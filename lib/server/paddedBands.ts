import axios from 'axios';
import sharp from 'sharp';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';

/**
 * Image models sometimes compose a frame in the shape of a reference photo (a 2:3 store
 * photo inside a 9:16 canvas) and fill the rest with a blurred, stretched copy of the
 * picture. Such a padded band is detected at the top or bottom edge (or, in a frame wider
 * than the photo, such as 16:9 or 1:1, at the left or right) and cut off, with the other
 * sides trimmed so the frame keeps its aspect ratio.
 */

const SAMPLE_WIDTH = 256;
/** Rows count as blurred when their detail is below this share of the image's typical detail. */
const BLUR_RATIO = 0.35;
const MIN_BAND = 0.05;
const MAX_TRIM = 0.3;

export interface PaddedBands {
  /** Share of the height taken by a padded band at each edge (0 = none). */
  top: number;
  bottom: number;
  /** Share of the width at the sides, checked only in frames that aren't tall (0 = none). */
  left?: number;
  right?: number;
}

/** Frames at least this wide for their height (3:4, 1:1, 16:9) are also checked at the sides. */
const SIDE_CHECK_MIN_RATIO = 0.7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

export async function findPaddedBands(image: Buffer): Promise<PaddedBands> {
  const { data, info } = await sharp(image).resize({ width: SAMPLE_WIDTH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const lum = (x: number, y: number) => {
    const i = (y * W + x) * C;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  // Detail within each row, and how abruptly each row differs from the one above.
  const detail: number[] = [];
  const seam: number[] = [0];
  for (let y = 0; y < H; y++) {
    let d = 0;
    let s = 0;
    for (let x = 0; x < W; x++) {
      if (x < W - 1) d += Math.abs(lum(x + 1, y) - lum(x, y));
      if (y > 0) s += Math.abs(lum(x, y) - lum(x, y - 1));
    }
    detail.push(d / (W - 1));
    if (y > 0) seam.push(s / W);
  }
  const typicalDetail = median(detail.slice(Math.floor(H * 0.25), Math.floor(H * 0.75)));
  const typicalSeam = median(seam) || 1;
  const columnMeans = (y0: number, y1: number) => Array.from({ length: W }, (_, x) => {
    let s = 0;
    for (let y = y0; y < y1; y++) s += lum(x, y);
    return s / Math.max(1, y1 - y0);
  });

  const measure = (edge: 'top' | 'bottom'): number => {
    let rows = 0;
    while (rows < H * 0.4) {
      const y = edge === 'top' ? rows : H - 1 - rows;
      if (detail[y] > typicalDetail * BLUR_RATIO) break;
      rows++;
    }
    if (rows < H * MIN_BAND) return 0;
    const boundary = edge === 'top' ? rows : H - rows;
    let seamStrength = 0;
    for (let d = -2; d <= 2; d++) {
      const y = boundary + d;
      if (y > 0 && y < H) seamStrength = Math.max(seamStrength, seam[y]);
    }
    const ratio = seamStrength / typicalSeam;
    // A blurry edge alone is often sky or a plain wall. A padded band ends in a hard,
    // full-width seam and repeats the colours of the picture next to it.
    const band = edge === 'top' ? columnMeans(0, rows) : columnMeans(H - rows, H);
    const inner = edge === 'top' ? columnMeans(rows, Math.min(H, 2 * rows)) : columnMeans(Math.max(0, H - 2 * rows), H - rows);
    const padded = ratio >= 4.5 && (correlation(band, inner) >= 0.6 || ratio >= 9);
    return padded ? rows / H : 0;
  };
  return { top: measure('top'), bottom: measure('bottom') };
}

async function loadImage(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) return Buffer.from(url.split(',')[1] ?? '', 'base64');
  const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 30000 });
  return Buffer.from(response.data);
}

/**
 * Cuts padded bands off a generated frame. Returns the original URL when there is none,
 * and `tooLarge` when the bands take so much of the frame that it should be re-rendered.
 */
export async function trimPaddedBands(url: string): Promise<{ url: string; bands: PaddedBands; trimmed: boolean; tooLarge: boolean }> {
  const buffer = await loadImage(url);
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const found = await findPaddedBands(buffer);
  // The sides, by the same check on the frame turned a quarter (its left edge on top).
  const sides = width && height && width / height >= SIDE_CHECK_MIN_RATIO
    ? await findPaddedBands(await sharp(buffer).rotate(90).toBuffer())
    : { top: 0, bottom: 0 };
  const bands: PaddedBands = { ...found, left: sides.top, right: sides.bottom };
  if (!bands.top && !bands.bottom && !bands.left && !bands.right) return { url, bands, trimmed: false, tooLarge: false };
  // A little beyond the detected band, so no blurred rows survive the seam.
  const beyond = (share = 0) => (share ? share + 0.01 : 0);
  const cut = { top: beyond(bands.top), bottom: beyond(bands.bottom), left: beyond(bands.left), right: beyond(bands.right) };
  if (cut.top + cut.bottom > MAX_TRIM || cut.left + cut.right > MAX_TRIM) return { url, bands, trimmed: false, tooLarge: true };
  if (!width || !height) return { url, bands, trimmed: false, tooLarge: false };

  // What is left after the cuts, then trimmed on the other axis so the frame keeps its aspect ratio.
  const left0 = Math.round(width * cut.left);
  const top0 = Math.round(height * cut.top);
  const freeWidth = width - left0 - Math.round(width * cut.right);
  const freeHeight = height - top0 - Math.round(height * cut.bottom);
  const tooWide = freeWidth / freeHeight > width / height;
  const keptWidth = tooWide ? Math.round((freeHeight * width) / height) : freeWidth;
  const keptHeight = tooWide ? freeHeight : Math.round((freeWidth * height) / width);
  const left = left0 + Math.max(0, Math.round((freeWidth - keptWidth) / 2));
  const top = top0 + Math.max(0, Math.round((freeHeight - keptHeight) / 2));
  const fixed = await sharp(buffer)
    .extract({ left, top, width: Math.min(keptWidth, width - left), height: Math.min(keptHeight, height - top) })
    .resize(width, height, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer();
  const fixedUrl = await uploadBufferToBucket(fixed, 'generated-thumbnails', 'image/jpeg');
  return { url: fixedUrl, bands, trimmed: true, tooLarge: false };
}
