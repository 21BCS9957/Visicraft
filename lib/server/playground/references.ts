import 'server-only';

import axios from 'axios';
import sharp from 'sharp';

/**
 * Downloads a reference image and fits it to what Gemini accepts (JPEG, PNG or WebP, at
 * most 2560 px and 2 MB), keeping the original bytes when they already fit. The Playground
 * has its own copy so it doesn't depend on the ad pipeline's loader.
 */

export interface ReferenceImage {
  data: string;
  mimeType: string;
}

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 2560;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_ENTRIES = 64;

// A run sends the same references with every prompt: keep them for a few minutes.
const cache = new Map<string, { at: number; image: Promise<ReferenceImage> }>();

function sniff(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function fetchReference(url: string): Promise<ReferenceImage> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Reference images must be web URLs.');
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    headers: { Accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5' },
  });
  const bytes = Buffer.from(response.data);
  const mimeType = sniff(bytes);
  if (!mimeType) throw new Error('The reference is not a JPEG, PNG or WebP image.');

  const meta = await sharp(bytes, { failOn: 'none' }).metadata().catch(() => null);
  const fits = Boolean(meta?.width && meta?.height)
    && (meta?.width ?? 0) <= MAX_EDGE
    && (meta?.height ?? 0) <= MAX_EDGE
    && bytes.byteLength <= MAX_BYTES
    && (!meta?.orientation || meta.orientation === 1);
  if (fits) return { data: bytes.toString('base64'), mimeType };

  for (const [edge, quality] of [[2560, 92], [2048, 88], [1792, 84]] as const) {
    const resized = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (resized.byteLength <= MAX_BYTES || edge === 1792) return { data: resized.toString('base64'), mimeType: 'image/webp' };
  }
  throw new Error('The reference could not be prepared.');
}

export function loadReferenceImage(url: string): Promise<ReferenceImage> {
  const now = Date.now();
  for (const [key, entry] of cache) if (now - entry.at > CACHE_TTL_MS) cache.delete(key);
  const hit = cache.get(url);
  if (hit) return hit.image;
  while (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  const image = fetchReference(url).catch((error) => {
    cache.delete(url);
    throw error;
  });
  cache.set(url, { at: now, image });
  return image;
}
