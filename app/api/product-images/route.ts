import { NextRequest, NextResponse } from 'next/server';

interface ProductImage {
  url: string;
  alt?: string;
  source: 'shopify' | 'metadata' | 'page';
}

interface ProductCapture {
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  vendor?: string;
  description?: string;
  images: ProductImage[];
}

const MAX_HTML_BYTES = 1_000_000;
const MAX_IMAGES = 12;
const FETCH_TIMEOUT_MS = 12000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!rawUrl) {
      return NextResponse.json({ error: 'Product URL is required' }, { status: 400 });
    }

    const productUrl = assertPublicHttpUrl(rawUrl);
    const shopifyData = await tryFetchShopifyProduct(productUrl).catch(() => null);
    const pageData = await scrapeProductPage(productUrl).catch(() => null);

    if (!shopifyData && !pageData) {
      return NextResponse.json(
        { error: 'Could not read product data from that URL' },
        { status: 422 }
      );
    }

    const images = uniqueImages([
      ...(shopifyData?.images ?? []),
      ...(pageData?.images ?? []),
    ]).slice(0, MAX_IMAGES);

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'No usable product images were found on that URL' },
        { status: 404 }
      );
    }

    const capture: ProductCapture = {
      requestedUrl: productUrl.href,
      finalUrl: pageData?.finalUrl ?? productUrl.href,
      title: shopifyData?.title ?? pageData?.title,
      vendor: shopifyData?.vendor ?? pageData?.vendor,
      description: shopifyData?.description ?? pageData?.description,
      images,
    };

    return NextResponse.json({ success: true, product: capture });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to capture product images';
    const status = message.includes('Invalid') || message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid product URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Invalid product URL: only HTTP and HTTPS URLs are supported');
  }

  if (url.username || url.password) {
    throw new Error('Invalid product URL: credentials are not allowed');
  }

  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Invalid product URL: custom ports are not allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('127.') ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    throw new Error('Invalid product URL: private network addresses are not allowed');
  }

  return url;
}

async function fetchPublicUrl(url: URL, accept: string, redirectCount = 0): Promise<Response> {
  if (redirectCount > 3) {
    throw new Error('Too many redirects while fetching product URL');
  }

  assertPublicHttpUrl(url.href);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      headers: {
        accept,
        'user-agent': 'VisicraftBot/1.0 (+https://visicraft.ai)',
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Product URL redirected without a location');
      const redirected = new URL(location, url);
      return fetchPublicUrl(redirected, accept, redirectCount + 1);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryFetchShopifyProduct(productUrl: URL) {
  const match = productUrl.pathname.match(/\/products\/([^/?#]+)/);
  if (!match?.[1]) return null;

  const jsonUrl = new URL(`/products/${match[1]}.js`, productUrl.origin);
  const response = await fetchPublicUrl(jsonUrl, 'application/json,text/javascript,*/*');
  if (!response.ok) return null;

  const product = await response.json().catch(() => null) as {
    title?: string;
    vendor?: string;
    description?: string;
    body_html?: string;
    images?: unknown[];
    featured_image?: unknown;
  } | null;

  if (!product) return null;

  const imageUrls = [
    ...(Array.isArray(product.images) ? product.images : []),
    product.featured_image,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  return {
    title: cleanText(product.title),
    vendor: cleanText(product.vendor),
    description: cleanText(stripHtml(product.description ?? product.body_html ?? '')),
    images: imageUrls
      .map((url) => normalizeImageUrl(url, productUrl))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({
        url,
        alt: product.title,
        source: 'shopify' as const,
      })),
  };
}

async function scrapeProductPage(productUrl: URL) {
  const response = await fetchPublicUrl(productUrl, 'text/html,application/xhtml+xml');
  if (!response.ok) {
    throw new Error(`Failed to fetch product URL (${response.status})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('Product URL did not return an HTML page');
  }

  const html = await readCappedText(response, MAX_HTML_BYTES);
  const finalUrl = response.url || productUrl.href;
  const baseUrl = new URL(finalUrl);

  const metadataImages = [
    ...extractMetaContent(html, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']),
    ...extractJsonLdImages(html),
  ];

  const pageImages = extractImageTagSources(html)
    .filter((src) => /cdn\.shopify|shopify|product|products|files/i.test(src));

  const images: ProductImage[] = [
    ...metadataImages.map((url) => ({ url, source: 'metadata' as const })),
    ...pageImages.map((url) => ({ url, source: 'page' as const })),
  ].reduce<ProductImage[]>((acc, image) => {
    const normalized = normalizeImageUrl(image.url, baseUrl);
    if (normalized) {
      acc.push({ ...image, url: normalized });
    }
    return acc;
  }, []);

  return {
    finalUrl,
    title: cleanText(
      extractMetaContent(html, ['og:title', 'twitter:title'])[0] ?? extractTitle(html)
    ),
    vendor: cleanText(extractMetaContent(html, ['product:brand', 'og:site_name'])[0]),
    description: cleanText(extractMetaContent(html, ['og:description', 'description'])[0]),
    images,
  };
}

async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.slice(0, Math.max(0, maxBytes - received));
    chunks.push(chunk);
    received += chunk.byteLength;
    if (chunk.byteLength < value.byteLength) break;
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function extractMetaContent(html: string, names: string[]): string[] {
  const targets = new Set(names.map((name) => name.toLowerCase()));
  const out: string[] = [];
  const metaRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html))) {
    const tag = match[0];
    const key = getAttribute(tag, 'property') ?? getAttribute(tag, 'name') ?? getAttribute(tag, 'itemprop');
    if (!key || !targets.has(key.toLowerCase())) continue;
    const content = getAttribute(tag, 'content');
    if (content) out.push(decodeHtml(content));
  }

  return out;
}

function extractImageTagSources(html: string): string[] {
  const out: string[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html))) {
    const tag = match[0];
    const direct = getAttribute(tag, 'src') ??
      getAttribute(tag, 'data-src') ??
      getAttribute(tag, 'data-original') ??
      getAttribute(tag, 'data-master');
    if (direct) out.push(direct);

    const srcset = getAttribute(tag, 'srcset') ?? getAttribute(tag, 'data-srcset');
    if (srcset) out.push(...parseSrcSet(srcset));
  }

  return out;
}

function extractJsonLdImages(html: string): string[] {
  const out: string[] = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html))) {
    const rawJson = stripHtmlComments(match[1]).trim();
    if (!rawJson) continue;
    const parsed = JSONParseSafe(rawJson);
    collectJsonLdImages(parsed, out);
  }

  return out;
}

function collectJsonLdImages(value: unknown, out: string[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdImages(item, out));
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const type = record['@type'];
  const isProduct = typeof type === 'string'
    ? type.toLowerCase() === 'product'
    : Array.isArray(type) && type.some((item) => typeof item === 'string' && item.toLowerCase() === 'product');

  if (isProduct && record.image) {
    const image = record.image;
    if (typeof image === 'string') out.push(image);
    if (Array.isArray(image)) {
      image.forEach((item) => {
        if (typeof item === 'string') out.push(item);
        if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string') {
          out.push((item as Record<string, string>).url);
        }
      });
    }
    if (typeof image === 'object' && image && typeof (image as Record<string, unknown>).url === 'string') {
      out.push((image as Record<string, string>).url);
    }
  }

  if (Array.isArray(record['@graph'])) {
    collectJsonLdImages(record['@graph'], out);
  }
}

function JSONParseSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAttribute(tag: string, attr: string): string | undefined {
  const pattern = new RegExp(`${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  const match = tag.match(pattern);
  if (!match?.[1]) return undefined;
  return decodeHtml(match[1].replace(/^['"]|['"]$/g, '').trim());
}

function parseSrcSet(srcset: string): string[] {
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function normalizeImageUrl(rawUrl: string, baseUrl: URL): string | undefined {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return undefined;

  try {
    const cleaned = decodeHtml(rawUrl.trim());
    const absolute = cleaned.startsWith('//')
      ? `${baseUrl.protocol}${cleaned}`
      : new URL(cleaned, baseUrl).href;

    const url = assertPublicHttpUrl(absolute);
    url.searchParams.delete('width');
    url.searchParams.delete('height');
    url.searchParams.delete('crop');
    return url.href;
  } catch {
    return undefined;
  }
}

function uniqueImages(images: ProductImage[]): ProductImage[] {
  const seen = new Set<string>();
  const out: ProductImage[] = [];

  for (const image of images) {
    const key = image.url.replace(/([?&])(v|_pos|variant)=\d+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(image);
  }

  return out;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripHtml(match[1])) : undefined;
}

function cleanText(value?: string): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function stripHtmlComments(value: string): string {
  return value.replace(/<!--|-->/g, '');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
