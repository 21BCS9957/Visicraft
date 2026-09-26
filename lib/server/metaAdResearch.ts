import axios from 'axios';
import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import type { ProviderUsage } from '@/lib/server/usage';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';

export type AdMediaType = 'image' | 'video';

export interface WinningAd {
  id: string;
  pageName: string;
  startDate: string;
  daysRunning: number;
  body?: string;
  title?: string;
  ctaText?: string;
  /** Landing-page domain shown under the ad, a strong hint of what is being sold. */
  landingDomain?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Video ads can still serve as design references (via their cover frame) when image ads are scarce. */
  mediaKind: 'image' | 'video';
  /** How many ad variants share this creative: advertisers duplicate what makes money. */
  collationCount: number;
  /** Ranking score: run length weighted by collation. */
  winScore: number;
  libraryUrl: string;
}

/** One beat of a video ad's timeline. */
export interface AdSequenceShot {
  /** Time range, e.g. "0-2s". */
  t: string;
  shot: string;
  camera?: string;
  text?: string;
  purpose?: string;
}

/** How one winning ad is built, so a new creative can be modelled on it. */
export interface AdDesign {
  id: string;
  pageName: string;
  daysRunning: number;
  format: string;
  layout: string;
  hook: string;
  textPlacement: string;
  colorMood: string;
  proofOrOffer: string;
  whyItWorks: string;
  /** Video ads only: the timed shot sequence. */
  sequence?: AdSequenceShot[];
  /** Video ads only: voice-over / music / sound style. */
  audio?: string;
}

export interface AdResearchResult {
  niche: string;
  keywords: string[];
  country: string;
  mediaType: AdMediaType;
  ads: WinningAd[];
  patterns: string;
  designs: AdDesign[];
  /** True when sample ads were used instead of a live Ad Library scrape (AD_RESEARCH_MOCK). */
  mock: boolean;
  usage: ProviderUsage;
}

const DEFAULT_ACTOR = 'apify~facebook-ads-scraper';
const ADS_PER_KEYWORD = 40;
// Longest-running first: only ads already live this many days ago (and still active) qualify.
const MIN_AGE_CASCADE_DAYS: Array<number | null> = [180, 60, null];
const ADS_PER_COMPETITOR = 25;
const MIN_USABLE_ADS = 3;
const TOP_ADS = 6;
const CANDIDATE_POOL = 80; // ads screened by the relevance gate before ranking by age
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
// Gemini's inline request limit is ~20 MB in total; keep headroom for the images and text.
const MAX_INLINE_VIDEO_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_VIDEOS_TO_WATCH = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type RawAd = Record<string, unknown>;

const researchCache = new Map<string, { createdAt: number; result: AdResearchResult }>();
const scrapeCache = new Map<string, { createdAt: number; items: RawAd[] }>();

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function geminiText(response: Awaited<ReturnType<typeof requestGeminiText>>['response']): string {
  return response.data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim() ?? '';
}

function geminiUsage(
  response: Awaited<ReturnType<typeof requestGeminiText>>['response'],
  providerModel: string
): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens,
    providerModel,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const withoutFences = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function deriveNicheKeywords(
  product: ShopifyProductContext,
  imageUrls: string[] = []
): Promise<{
  niche: string;
  keywords: string[];
  competitors: string[];
  usage: ProviderUsage;
}> {
  // The photos settle what the product actually is when the listing text is vague.
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You pick Meta Ad Library search keywords for competitor research in India. Study the product photos (if attached) together with the listing to understand exactly what kind of product this is, who buys it and why.

Product name: ${clean(product.title, 180) || 'unknown'}
Brand: ${clean(product.vendor, 120) || 'unknown'}
Description: ${clean(product.description, 700) || 'unknown'}

Return JSON only: {"niche":"2-4 word product category","keywords":["kw1","kw2"],"competitors":["Brand A","Brand B","Brand C","Brand D"]}
Rules: exactly 2 keywords, each 1-3 words, generic category terms competitors would use in ad copy (e.g. "protein powder", "hair oil"). competitors: 3-4 well-known consumer brands that sell this same product category in India and advertise on Meta (D2C brands preferred), by the name their Facebook page would use. Never include this brand's own name.`,
  }];
  if (imageUrls.length > 0) {
    const { images } = await loadPreparedReferences(imageUrls.slice(0, 3)).catch(() => ({ images: [] as Array<{ mimeType: string; data: string }> }));
    images.forEach((image, index) => {
      parts.push({ text: `PRODUCT PHOTO ${index + 1}:` }, { inlineData: { mimeType: image.mimeType, data: image.data } });
    });
  }
  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.2 }, 'Ad research keyword planning');
  const parsed = parseJsonObject(geminiText(response));
  const keywords = Array.isArray(parsed?.keywords)
    ? parsed.keywords.map((k) => clean(k, 40)).filter(Boolean).slice(0, 2)
    : [];
  const fallback = clean(product.title, 60).split(' ').slice(-2).join(' ');
  const ownBrand = clean(product.vendor, 60).toLowerCase();
  const competitors = Array.isArray(parsed?.competitors)
    ? parsed.competitors.map((c) => clean(c, 40)).filter((c) => c && c.toLowerCase() !== ownBrand).slice(0, 4)
    : [];
  return {
    niche: clean(parsed?.niche, 60) || fallback || 'product',
    keywords: keywords.length > 0 ? keywords : [fallback || 'product'],
    competitors,
    usage: geminiUsage(response, providerModel),
  };
}

function adLibrarySearchUrl(keyword: string, country: string, mediaType: AdMediaType | 'all'): string {
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country,
    q: keyword,
    search_type: 'keyword_unordered',
    media_type: mediaType,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/**
 * Test mode: AD_RESEARCH_MOCK=true skips Apify and feeds sample ads shaped like the
 * scraper output, so ranking, Gemini analysis and generation still run end to end.
 */
function sampleAdLibraryItems(niche: string, mediaType: AdMediaType): RawAd[] {
  const now = Math.floor(Date.now() / 1000);
  const samples = [
    { page: 'Sample Brand A', days: 412, title: `India's favourite ${niche}`, body: `Loved by 1 lakh+ customers. Try the ${niche} everyone is switching to. Free shipping across India.`, cta: 'Shop now' },
    { page: 'Sample Brand B', days: 287, title: 'Before vs after in 14 days', body: `Tired of ${niche} that does nothing? See real results in two weeks or your money back.`, cta: 'Learn more' },
    { page: 'Sample Brand C', days: 190, title: 'Made in India, made for you', body: `Clean, honest ${niche} with no nasties. Rated 4.6 by verified buyers.`, cta: 'Shop now' },
    { page: 'Sample Brand D', days: 121, title: 'Buy 2 get 1 free', body: `Stock up on your daily ${niche}. Limited time combo offer.`, cta: 'Get offer' },
    { page: 'Sample Brand E', days: 64, title: 'Why doctors recommend it', body: `The science-backed ${niche} built for Indian weather and routines.`, cta: 'Shop now' },
    { page: 'Sample Brand D', days: 20, title: 'New launch', body: 'Newer ad from the same advertiser, should be ranked out.', cta: 'Shop now' },
  ];
  return samples.map((sample, index) => ({
    ad_archive_id: `sample-${mediaType}-${index + 1}`,
    page_name: sample.page,
    is_active: true,
    start_date: now - sample.days * 86_400,
    snapshot: {
      title: sample.title,
      body: { text: sample.body },
      cta_text: sample.cta,
      images: mediaType === 'image' ? [{ original_image_url: '' }] : [],
      videos: mediaType === 'video' ? [{ video_sd_url: 'sample', video_preview_image_url: '' }] : [],
    },
  }));
}

const SC_BASE = 'https://api.scrapecreators.com/v1/facebook/adLibrary';
const SC_PAGES_PER_KEYWORD = 3; // ~25-30 ads per page, 1 credit each
const SC_PAGES_PER_COMPANY = 2;

export type ResearchProvider = 'scrapecreators' | 'apify';

export function getResearchProvider(): ResearchProvider | null {
  if (process.env.SCRAPECREATORS_API_KEY) return 'scrapecreators';
  if (process.env.APIFY_API_TOKEN) return 'apify';
  return null;
}

async function scGet<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new Error('Winning-ad research is not configured (missing SCRAPECREATORS_API_KEY).');
  const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join('&');
  const attempt = () => axios.get<T & { success?: boolean; error?: string; message?: string }>(`${SC_BASE}/${path}?${query}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 60000,
  });
  // The upstream scrape occasionally stalls; one retry recovers it without re-paying (cached server side).
  const response = await attempt().catch(() => attempt()).catch((error: unknown) => {
    const message = axios.isAxiosError(error)
      ? (error.response?.data as { message?: string; error?: string } | undefined)?.message || (error.response?.data as { error?: string } | undefined)?.error || error.message
      : String(error);
    throw new Error(`ScrapeCreators ${path} failed: ${message}`);
  });
  if (response.data.success === false) throw new Error(`ScrapeCreators ${path} failed: ${response.data.message || response.data.error || 'unknown error'}`);
  return response.data;
}

/** Keyword search on the Ad Library via ScrapeCreators, following the cursor for a few pages. */
async function scSearchAds(
  keyword: string,
  country: string,
  mediaType: AdMediaType | 'all',
  pages: number,
  /** Only ads that already had impressions on/before this date (still active now = long-runner). */
  impressionsBefore?: string
): Promise<RawAd[]> {
  const cacheKey = `sc|search|${country}|${mediaType}|${impressionsBefore ?? ''}|${keyword.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const items: RawAd[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pages; page++) {
    const data = await scGet<{ searchResults?: RawAd[]; cursor?: string | null }>('search/ads', {
      query: keyword,
      country,
      media_type: mediaType.toUpperCase(),
      status: 'ACTIVE',
      sort_by: 'total_impressions',
      end_date: impressionsBefore,
      cursor,
    });
    items.push(...(data.searchResults ?? []));
    cursor = data.cursor || undefined;
    if (!cursor) break;
  }
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

/** A brand's own active ads: resolve its page (prefer the country's page), then page ads. */
async function scCompanyAds(brand: string, country: string, pages: number): Promise<RawAd[]> {
  const cacheKey = `sc|company|${country}|${brand.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const found = await scGet<{ searchResults?: Array<{ name?: string; page_id?: string; id?: string }> }>('search/companies', { query: brand });
  const candidates = (found.searchResults ?? []).filter((c) => c.page_id || c.id);
  if (candidates.length === 0) return [];
  const countryWords: Record<string, string[]> = { IN: ['india', 'in'], US: ['usa', 'us', 'united states'], GB: ['uk', 'united kingdom'] };
  const wanted = countryWords[country] ?? [country.toLowerCase()];
  const brandLower = brand.toLowerCase();
  const scored = candidates.map((c) => {
    const name = (c.name ?? '').toLowerCase();
    let score = name.startsWith(brandLower) ? 2 : name.includes(brandLower) ? 1 : 0;
    if (wanted.some((w) => name.split(/\s+/).includes(w))) score += 3;
    // A page for another country loses to a bare brand page.
    if (/\b(uk|usa|us|uae|singapore|canada|australia|europe)\b/.test(name) && !wanted.some((w) => name.includes(w))) score -= 2;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  const pageId = String(scored[0].c.page_id || scored[0].c.id);
  const items: RawAd[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pages; page++) {
    const data = await scGet<{ results?: RawAd[]; cursor?: string | null }>('company/ads', { pageId, status: 'ACTIVE', sort_by: 'total_impressions', cursor });
    items.push(...(data.results ?? []));
    cursor = data.cursor || undefined;
    if (!cursor) break;
  }
  console.log(`Ad research: ${items.length} active ads on page "${scored[0].c.name}" (${pageId}) for competitor ${brand}`);
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

async function scrapeAdLibrary(
  keywords: string[],
  country: string,
  mediaType: AdMediaType | 'all',
  minAgeDays: number | null,
  limitPerKeyword = ADS_PER_KEYWORD
): Promise<RawAd[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('Winning-ad research is not configured (missing APIFY_API_TOKEN).');
  const actor = process.env.APIFY_META_ADS_ACTOR || DEFAULT_ACTOR;
  const cacheKey = `${actor}|${country}|${mediaType}|${minAgeDays ?? 0}|${keywords.join(',').toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;

  // apify/facebook-ads-scraper input; the Ad Library search URL carries country, keyword and media type.
  const response = await axios.post<unknown>(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=150`,
    {
      startUrls: keywords.map((keyword) => ({ url: adLibrarySearchUrl(keyword, country, mediaType) })),
      resultsLimit: limitPerKeyword * keywords.length,
      activeStatus: 'active',
      sorting: '',
      ...(minAgeDays
        ? { onlyAdsOlderThan: new Date(Date.now() - minAgeDays * 86_400_000).toISOString().slice(0, 10) }
        : {}),
      isDetailsPerAd: false,
      enrichWithEcommerceData: false,
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 170000,
    }
  );

  const items = Array.isArray(response.data) ? response.data.filter((item): item is RawAd => !!item && typeof item === 'object') : [];
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

function pick(record: RawAd | undefined, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function toStartDate(raw: RawAd): Date | null {
  const value = pick(raw, 'startDateFormatted', 'start_date_formatted', 'start_date', 'startDate', 'ad_delivery_start_time');
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string' && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function firstMedia(snapshot: RawAd | undefined): { imageUrl?: string; videoUrl?: string } {
  // Field names differ between Ad Library scrapers (snake_case vs camelCase); accept both.
  const images = pick(snapshot, 'images') as RawAd[] | undefined;
  const videos = pick(snapshot, 'videos') as RawAd[] | undefined;
  const cards = pick(snapshot, 'cards') as RawAd[] | undefined;
  const videoKeys = ['video_sd_url', 'videoSdUrl', 'video_hd_url', 'videoHdUrl'];
  const imageKeys = ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl'];
  const video = (Array.isArray(videos) && videos[0]) || (Array.isArray(cards) && cards.find((c) => pick(c, ...videoKeys))) || undefined;
  const image = (Array.isArray(images) && images[0]) || (Array.isArray(cards) && cards.find((c) => pick(c, ...imageKeys))) || undefined;
  const videoUrl = pick(video, ...videoKeys);
  const imageUrl = pick(image, ...imageKeys) ?? pick(video, 'video_preview_image_url', 'videoPreviewImageUrl');
  return {
    imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
    videoUrl: typeof videoUrl === 'string' ? videoUrl : undefined,
  };
}

function hasMedia(url: string | undefined): boolean {
  return typeof url === 'string';
}

/** Winning = still active and running the longest. One ad per advertiser for variety. */
export function rankWinningAds(
  rawAds: RawAd[],
  mediaType: AdMediaType,
  limit = TOP_ADS,
  includeOtherKind = false,
  /** Keyword searches keep 1 ad per advertiser for variety; a brand's own page may keep several. */
  maxPerPage = 1
): WinningAd[] {
  const now = Date.now();
  const perPage = new Map<string, WinningAd[]>();
  const dropped = { inactive: 0, noDate: 0, catalog: 0, noMedia: 0, otherKind: 0 };

  for (const raw of rawAds) {
    if (pick(raw, 'is_active', 'isActive') === false) { dropped.inactive += 1; continue; }
    // Catalog/DPA ads are auto-generated from product feeds, not designed creatives worth modelling.
    const snapshotForFormat = pick(raw, 'snapshot') as RawAd | undefined;
    const displayFormat = String(pick(snapshotForFormat, 'displayFormat', 'display_format') ?? '').toUpperCase();
    const title = String(pick(snapshotForFormat, 'title') ?? '');
    if (displayFormat === 'DPA' || displayFormat === 'DCO' || /\{\{.*\}\}/.test(title)) { dropped.catalog += 1; continue; }
    const start = toStartDate(raw);
    if (!start) { dropped.noDate += 1; continue; }
    const snapshot = pick(raw, 'snapshot') as RawAd | undefined;
    const media = firstMedia(snapshot);
    const mediaKind: 'image' | 'video' = hasMedia(media.videoUrl) ? 'video' : 'image';
    if (!hasMedia(media.imageUrl) && !hasMedia(media.videoUrl)) { dropped.noMedia += 1; continue; }
    if (!includeOtherKind && mediaKind !== mediaType) { dropped.otherKind += 1; continue; }

    const id = String(pick(raw, 'ad_archive_id', 'adArchiveID', 'adArchiveId', 'id') ?? '');
    if (!id) continue;
    const pageName = clean(pick(raw, 'page_name', 'pageName') ?? pick(snapshot, 'page_name'), 120) || 'Unknown advertiser';
    const body = pick(snapshot, 'body') as RawAd | string | undefined;

    const collationCount = Math.max(1, Number(pick(raw, 'collation_count', 'collationCount')) || 1);
    const daysRunning = Math.max(0, Math.floor((now - start.getTime()) / 86_400_000));
    const ad: WinningAd = {
      id,
      pageName,
      startDate: start.toISOString(),
      daysRunning,
      collationCount,
      winScore: Math.round(daysRunning * (1 + 0.5 * Math.log2(collationCount))),
      body: clean(typeof body === 'string' ? body : pick(body as RawAd, 'text'), 600) || undefined,
      title: clean(pick(snapshot, 'title'), 160) || undefined,
      ctaText: clean(pick(snapshot, 'cta_text', 'ctaText'), 40) || undefined,
      landingDomain: clean(pick(snapshot, 'caption') ?? pick(snapshot, 'link_url', 'linkUrl'), 80).replace(/^https?:\/\//, '').split('/')[0] || undefined,
      imageUrl: media.imageUrl || undefined,
      videoUrl: media.videoUrl || undefined,
      mediaKind,
      libraryUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
    };

    const key = pageName.toLowerCase();
    const list = perPage.get(key) ?? [];
    list.push(ad);
    perPage.set(key, list);
  }

  const kept = [...perPage.values()].flatMap((list) => list.sort((a, b) => b.winScore - a.winScore).slice(0, maxPerPage));
  if (rawAds.length > 0) {
    console.log(`Ad research filter: ${rawAds.length} raw → ${kept.length} kept (dropped: ${Object.entries(dropped).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`);
  }
  return kept
    .sort((a, b) => b.winScore - a.winScore)
    .slice(0, limit);
}

async function loadVideoInline(url: string): Promise<{ mimeType: string; data: string; byteLength: number } | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 25000,
      maxContentLength: MAX_VIDEO_BYTES,
      maxBodyLength: MAX_VIDEO_BYTES,
    });
    const bytes = Buffer.from(response.data);
    return { mimeType: 'video/mp4', data: bytes.toString('base64'), byteLength: bytes.byteLength };
  } catch {
    return null;
  }
}

/**
 * Keeps only ads that sell the same kind of product as ours. Longevity alone is
 * not enough: a keyword search for "sleep tea" also returns mattresses and clinics.
 */
async function filterRelevantAds(
  candidates: WinningAd[],
  product: ShopifyProductContext,
  niche: string
): Promise<{ ads: WinningAd[]; usage: ProviderUsage }> {
  if (candidates.length === 0) return { ads: [], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  const listing = candidates.map((ad, i) => `${i + 1}. id=${ad.id} | page: ${ad.pageName} | domain: ${ad.landingDomain || 'n/a'} | headline: ${ad.title || 'n/a'} | text: ${(ad.body || 'n/a').slice(0, 260)}`).join('\n');
  const { response, providerModel } = await requestGeminiText(
    [{
      text: `You are screening Meta ads for competitor research.

OUR PRODUCT
Name: ${clean(product.title, 160) || 'unknown'}
Brand: ${clean(product.vendor, 100) || 'unknown'}
Category: ${niche}
Description: ${clean(product.description, 500) || 'unknown'}

An ad is RELEVANT only if it is selling a consumer product of the same category as ours (for a herbal tea: other teas, herbal infusions, tea bags; not mattresses, supplements in capsule form, clinics, apps, courses, general lifestyle pages, marketplaces or unrelated products that merely mention the same benefit). Judge from the page name, domain, headline and text.

ADS
${listing}

Return JSON only: {"relevant":[{"id":"...","reason":"<=12 words"}]} listing only the relevant ads, most relevant first.`,
    }],
    { temperature: 0 },
    'Ad relevance screening'
  );
  const parsed = parseJsonObject(geminiText(response));
  console.log('Ad relevance candidates:\n' + candidates.map((ad) => `  ${ad.daysRunning}d x${ad.collationCount} | ${ad.pageName} | ${ad.landingDomain || 'n/a'} | ${(ad.title || '').slice(0, 60)} | ${(ad.body || '').slice(0, 90)}`).join('\n'));
  console.log('Ad relevance verdict:', JSON.stringify(parsed?.relevant ?? parsed).slice(0, 1500));
  const relevantIds = new Set(
    (Array.isArray(parsed?.relevant) ? parsed.relevant : [])
      .map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>).id ?? '') : ''))
      .filter(Boolean)
  );
  const ads = candidates.filter((ad) => relevantIds.has(ad.id));
  console.log(`Ad research: ${ads.length} of ${candidates.length} long-running ads sell the same category (${niche})`);
  return { ads, usage: geminiUsage(response, providerModel) };
}

async function analyzeWinningAds(
  ads: WinningAd[],
  mediaType: AdMediaType,
  niche: string
): Promise<{ patterns: string; designs: AdDesign[]; usage: ProviderUsage }> {
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You are a senior Meta performance creative strategist for Indian D2C brands. Below are the longest-running active ${mediaType} ads in the "${niche}" niche on Meta in India. Longevity is our proxy for profitability: advertisers keep ads that make money.

Study each creative and its copy. Return JSON only:
{
  "brief": "CREATIVE PATTERN BRIEF, max 1500 characters: the visual formats, hook structures, text-overlay usage, proof/offer devices and emotional angles that recur across these ads${mediaType === 'video' ? ', plus video pacing (first 2 seconds, shot types, product reveal timing)' : ''}",
  "ads": [
    {
      "id": "the ad id given",
      "format": "e.g. product hero with headline / before-after / UGC selfie / benefit callouts / comparison / carousel card",
      "layout": "where the product sits, its size in frame, background/setting, supporting elements",
      "hook": "the headline structure and the promise it makes (structure, not brand wording)",
      "textPlacement": "how much text, where, hierarchy, colours",
      "colorMood": "palette, lighting, mood",
      "proofOrOffer": "reviews, ratings, guarantees, offers, badges used",
      "whyItWorks": "one sentence on the psychological lever"${mediaType === 'video' ? `,
      "sequence": [{"t":"0-2s","shot":"what is on screen","camera":"static / push-in / handheld / cut","text":"on-screen text if any","purpose":"hook / problem / reveal / proof / offer / CTA"}],
      "audio": "voice-over, music and sound style"` : ''}
    }
  ]
}${mediaType === 'video' ? '\nFor ads whose video is attached, watch it and give the full timed sequence from first frame to last (typically 4-8 beats). For ads where only a cover frame is attached, infer the likely sequence from the frame and copy and say so in "format".' : ''}
Never copy a competitor's brand name, claims or exact wording into your descriptions.`,
  }];

  const imageUrls = ads.map((ad) => ad.imageUrl).filter((url): url is string => Boolean(url));
  const prepared = imageUrls.length > 0
    ? await loadPreparedReferences(imageUrls).catch(() => ({ images: [], sourceIndexes: [] as number[] }))
    : { images: [], sourceIndexes: [] as number[] };
  const imageByAd = new Map<string, { mimeType: string; data: string }>();
  prepared.images.forEach((image, i) => {
    const url = imageUrls[prepared.sourceIndexes[i]];
    const ad = ads.find((candidate) => candidate.imageUrl === url);
    if (ad) imageByAd.set(ad.id, image);
  });

  const videoByAd = new Map<string, { mimeType: string; data: string }>();
  if (mediaType === 'video') {
    // Watch the top winners that fit the inline budget, longest-running first.
    const videos = await Promise.all(
      ads.slice(0, MAX_VIDEOS_TO_WATCH).map(async (ad) => [ad.id, ad.videoUrl?.startsWith('http') ? await loadVideoInline(ad.videoUrl) : null] as const)
    );
    let budget = MAX_INLINE_VIDEO_TOTAL_BYTES;
    videos.forEach(([id, video]) => {
      if (!video) return;
      if (video.byteLength > budget) { console.log(`Ad research: skipping video ${id} (${Math.round(video.byteLength / 1e6)} MB over inline budget)`); return; }
      budget -= video.byteLength;
      videoByAd.set(id, { mimeType: video.mimeType, data: video.data });
    });
  }

  ads.forEach((ad, index) => {
    parts.push({
      text: `AD ${index + 1} — id ${ad.id} — running ${ad.daysRunning} days${ad.mediaKind === 'video' && mediaType === 'image' ? ' (video ad; its cover frame is shown)' : ''}. Headline: ${ad.title || 'n/a'}. CTA: ${ad.ctaText || 'n/a'}. Primary text: ${ad.body || 'n/a'}`,
    });
    const video = videoByAd.get(ad.id);
    const image = imageByAd.get(ad.id);
    if (video) parts.push({ inlineData: { mimeType: video.mimeType, data: video.data } });
    else if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  });

  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.3 }, 'Winning ad analysis');
  const text = geminiText(response);
  const parsed = parseJsonObject(text);
  const byId = new Map(ads.map((ad) => [ad.id, ad]));
  const designs: AdDesign[] = (Array.isArray(parsed?.ads) ? parsed.ads : [])
    .map((item): AdDesign | null => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const ad = byId.get(String(record.id ?? ''));
      if (!ad) return null;
      return {
        id: ad.id,
        pageName: ad.pageName,
        daysRunning: ad.daysRunning,
        format: clean(record.format, 120),
        layout: clean(record.layout, 400),
        hook: clean(record.hook, 300),
        textPlacement: clean(record.textPlacement, 300),
        colorMood: clean(record.colorMood, 200),
        proofOrOffer: clean(record.proofOrOffer, 200),
        whyItWorks: clean(record.whyItWorks, 200),
        sequence: Array.isArray(record.sequence)
          ? record.sequence
              .map((beat): AdSequenceShot | null => {
                const b = (beat && typeof beat === 'object' ? beat : {}) as Record<string, unknown>;
                const shot = clean(b.shot, 220);
                if (!shot) return null;
                return { t: clean(b.t, 12) || '?', shot, camera: clean(b.camera, 80) || undefined, text: clean(b.text, 120) || undefined, purpose: clean(b.purpose, 40) || undefined };
              })
              .filter((beat): beat is AdSequenceShot => beat !== null)
              .slice(0, 10)
          : undefined,
        audio: clean(record.audio, 200) || undefined,
      };
    })
    .filter((design): design is AdDesign => design !== null);
  return {
    patterns: (clean(parsed?.brief, 2500) || text).slice(0, 2500),
    designs,
    usage: geminiUsage(response, providerModel),
  };
}

/**
 * Meta's creative URLs are signed CDN links that expire within days. Copy each
 * winner's image (and SD video) into our storage so the UI strip and later
 * analysis keep working; fall back to the original URL if a copy fails.
 */
async function persistWinnerMedia(ads: WinningAd[]): Promise<WinningAd[]> {
  const { uploadBufferToBucket } = await import('@/lib/server/supabaseStorage');
  const copy = async (url: string | undefined, bucket: string, mime: string, maxBytes: number): Promise<string | undefined> => {
    if (!url || !/^https?:\/\//.test(url)) return url;
    try {
      const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 25000, maxContentLength: maxBytes, maxBodyLength: maxBytes });
      const type = String(response.headers['content-type'] || mime).split(';')[0].trim() || mime;
      return await uploadBufferToBucket(Buffer.from(response.data), bucket, type.startsWith('image/') || type.startsWith('video/') ? type : mime);
    } catch (error) {
      console.warn('Could not persist winner media, keeping the CDN link:', error instanceof Error ? error.message : error);
      return url;
    }
  };
  return Promise.all(ads.map(async (ad) => ({
    ...ad,
    imageUrl: await copy(ad.imageUrl, 'generated-thumbnails', 'image/jpeg', 8 * 1024 * 1024),
    videoUrl: await copy(ad.videoUrl, 'generated-videos', 'video/mp4', MAX_VIDEO_BYTES),
  })));
}

export async function researchWinningAds(
  product: ShopifyProductContext,
  mediaType: AdMediaType,
  country = 'IN',
  options: { imageUrls?: string[] } = {}
): Promise<AdResearchResult> {
  const { niche, keywords, competitors, usage: keywordUsage } = await deriveNicheKeywords(product, options.imageUrls ?? []);
  const cacheKey = `${process.env.AD_RESEARCH_MOCK === 'true' ? 'mock|' : ''}${country}|${mediaType}|${[...keywords, ...competitors].join(',').toLowerCase()}`;
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.result, usage: keywordUsage };
  }

  const mock = process.env.AD_RESEARCH_MOCK === 'true';
  let ads: WinningAd[] = [];
  let relevanceUsage: ProviderUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  if (mock) {
    ads = rankWinningAds(sampleAdLibraryItems(niche, mediaType), mediaType);
  } else {
    // All age tiers scrape concurrently (one round-trip instead of up to four); the
    // oldest tier with enough usable ads wins, otherwise the tier with the most.
    const provider = getResearchProvider();
    if (!provider) throw new Error('Winning-ad research is not configured (set SCRAPECREATORS_API_KEY).');
    const jobs: Array<{ label: string; run: () => Promise<RawAd[]> }> = [];
    if (provider === 'scrapecreators') {
      // Current top ads by impressions, plus ads that were already running months ago
      // and are still active (the Ad Library's impressions-window filter): long-runners.
      const longRunnerCutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
      keywords.forEach((keyword) => {
        jobs.push({
          label: `"${keyword}" (${mediaType})`,
          run: () => scSearchAds(keyword, country, mediaType, SC_PAGES_PER_KEYWORD),
        });
        jobs.push({
          label: `"${keyword}" (${mediaType}) live since before ${longRunnerCutoff}`,
          run: () => scSearchAds(keyword, country, mediaType, 2, longRunnerCutoff),
        });
      });
      // Competitor brands' own pages: their real creatives, mostly video.
      competitors.forEach((brand) => jobs.push({
        label: `competitor ${brand}`,
        run: () => scCompanyAds(brand, country, SC_PAGES_PER_COMPANY),
      }));
    } else {
      // Apify: category keywords by age tier, plus competitor names as keywords.
      MIN_AGE_CASCADE_DAYS.forEach((minAgeDays) => jobs.push({
        label: `"${keywords.join('", "')}" running ${minAgeDays ?? 0}+ days`,
        run: () => scrapeAdLibrary(keywords, country, mediaType, minAgeDays),
      }));
      if (competitors.length > 0) {
        jobs.push({
          label: `competitors ${competitors.join(', ')}`,
          run: () => scrapeAdLibrary(competitors, country, 'all', null, ADS_PER_COMPETITOR),
        });
      }
    }
    const tiers = await Promise.all(
      jobs.map(async (job) => {
        const started = Date.now();
        const rawAds = await job.run().catch((error) => {
          console.warn(`Ad research ${job.label} failed:`, error instanceof Error ? error.message : error);
          return [] as RawAd[];
        });
        const ranked = rankWinningAds(rawAds, mediaType, CANDIDATE_POOL, true, job.label.startsWith('competitor') ? 4 : 1);
        console.log(`Ad research: ${ranked.length} usable ${mediaType} ads for ${job.label} (${Math.round((Date.now() - started) / 1000)}s)`);
        return ranked;
      })
    );
    // Merge tiers, longest-running first, then keep only ads selling our category.
    const pool = new Map<string, WinningAd>();
    tiers.flat().forEach((ad) => {
      const existing = pool.get(ad.id);
      if (!existing || ad.winScore > existing.winScore) pool.set(ad.id, ad);
    });
    // Gate every candidate first: long-running junk (advertorials, novel apps) must not
    // crowd out genuine competitors that happen to refresh creatives more often.
    const candidates = [...pool.values()].sort((a, b) => b.winScore - a.winScore).slice(0, CANDIDATE_POOL);
    const screened = await filterRelevantAds(candidates, product, niche);
    relevanceUsage = screened.usage;
    const relevant = screened.ads.sort((a, b) => b.winScore - a.winScore);
    const sameKind = relevant.filter((ad) => ad.mediaKind === mediaType);
    const otherKind = relevant.filter((ad) => ad.mediaKind !== mediaType);
    const diverse = (list: WinningAd[]) => {
      const perPage = new Map<string, number>();
      return list.filter((ad) => {
        const key = ad.pageName.toLowerCase();
        const n = perPage.get(key) ?? 0;
        if (n >= 2) return false;
        perPage.set(key, n + 1);
        return true;
      });
    };
    const preferred = diverse(sameKind);
    ads = (preferred.length >= MIN_USABLE_ADS
      ? preferred.slice(0, TOP_ADS)
      : diverse([...sameKind, ...otherKind]).slice(0, TOP_ADS)
    ).sort((a, b) => b.winScore - a.winScore);
    if (otherKind.length && sameKind.length < MIN_USABLE_ADS) {
      console.log(`Ad research: only ${sameKind.length} relevant ${mediaType} ads; using ${Math.min(otherKind.length, TOP_ADS - sameKind.length)} ${mediaType === 'image' ? 'video cover frames' : 'image ads'} as extra design references`);
    }
  }
  if (ads.length === 0) {
    throw new Error(`No long-running ${mediaType} ads selling ${niche} were found on Meta in ${country}.`);
  }

  if (!mock) ads = await persistWinnerMedia(ads);
  const analysis = await analyzeWinningAds(ads, mediaType, niche);
  const result: AdResearchResult = {
    niche,
    keywords,
    country,
    mediaType,
    ads,
    patterns: analysis.patterns,
    designs: analysis.designs,
    mock,
    usage: {
      inputTokens: keywordUsage.inputTokens + relevanceUsage.inputTokens + analysis.usage.inputTokens,
      outputTokens: keywordUsage.outputTokens + relevanceUsage.outputTokens + analysis.usage.outputTokens,
      totalTokens: keywordUsage.totalTokens + relevanceUsage.totalTokens + analysis.usage.totalTokens,
      providerModel: analysis.usage.providerModel,
    },
  };

  researchCache.set(cacheKey, { createdAt: Date.now(), result });
  return result;
}
