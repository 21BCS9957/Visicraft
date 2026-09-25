import sharp from 'sharp';
import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { uploadDataUrlToBucket } from '@/lib/server/supabaseStorage';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * Generative models redraw packaging and garble small print. Instead of trusting
 * the rendered product, we cut the real product out of the canonical store photo
 * and paste it over the model's version, so label text is exact by construction.
 */

export interface ProductCutout {
  png: Buffer;
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const BG_TOLERANCE = 34; // max RGB distance from the sampled background colour to count as background
const SOFT_EDGE = 26; // distance range over which alpha ramps from 0 to 1
const MIN_COVERAGE = 0.04; // cutout must keep at least this share of pixels to be a real product

function colorDistance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Builds an alpha matte by keying out the near-uniform background found at the
 * image corners. Returns null when the photo has no solid background (lifestyle
 * shots), in which case callers fall back to the model-rendered product.
 */
export async function cutoutProduct(canonicalImageUrl: string): Promise<ProductCutout | null> {
  const { images } = await loadPreparedReferences([canonicalImageUrl]);
  const source = Buffer.from(images[0].data, 'base64');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const pad = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const corners = [
    sample(pad, pad), sample(width - 1 - pad, pad),
    sample(pad, height - 1 - pad), sample(width - 1 - pad, height - 1 - pad),
    sample(Math.floor(width / 2), pad), sample(Math.floor(width / 2), height - 1 - pad),
  ];
  const bg = corners.reduce((acc, c) => [acc[0] + c[0] / corners.length, acc[1] + c[1] / corners.length, acc[2] + c[2] / corners.length], [0, 0, 0]);
  if (corners.some((c) => colorDistance(c, bg) > BG_TOLERANCE)) return null;

  // Flood fill from the borders so background-coloured areas inside the product survive.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  const alpha = new Uint8Array(width * height).fill(255);
  let kept = width * height;
  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % width;
    const y = (idx - x) / width;
    const dist = colorDistance(sample(x, y), bg);
    if (dist > BG_TOLERANCE + SOFT_EDGE) continue;
    const a = dist <= BG_TOLERANCE ? 0 : Math.round(((dist - BG_TOLERANCE) / SOFT_EDGE) * 255);
    if (a === 0) kept -= 1;
    alpha[idx] = a;
    if (a === 0) {
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
  }
  if (kept / (width * height) < MIN_COVERAGE) return null;

  for (let i = 0; i < width * height; i++) data[i * channels + 3] = alpha[i];
  const png = await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) return null;
  return { png, width: meta.width, height: meta.height };
}

/** Asks Gemini for the bounding box of the product package in a generated ad. */
export async function locateProduct(generatedImageUrl: string): Promise<{ box: Box | null; usage: ProviderUsage }> {
  const { images } = await loadPreparedReferences([generatedImageUrl]);
  const { response, providerModel } = await requestGeminiText(
    [
      { text: 'Find the single main product package (bottle, pouch, box, jar, tube or similar retail packaging) in this advertisement image. Return JSON only: {"box_2d":[ymin,xmin,ymax,xmax]} with coordinates normalised to 0-1000, tightly enclosing the whole package including its edges. If there is no package, return {"box_2d":null}.' },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
    ],
    { temperature: 0 },
    'Product localisation'
  );
  const raw = response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  const meta = response.data.usageMetadata;
  const usage: ProviderUsage = {
    inputTokens: Number(meta?.promptTokenCount) || 0,
    outputTokens: Number(meta?.candidatesTokenCount) || 0,
    totalTokens: Number(meta?.totalTokenCount) || 0,
    providerModel,
  };
  const match = raw.match(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
  if (!match) return { box: null, usage };
  const [ymin, xmin, ymax, xmax] = match.slice(1, 5).map(Number);
  if (ymax <= ymin || xmax <= xmin) return { box: null, usage };
  return {
    box: { left: xmin / 1000, top: ymin / 1000, width: (xmax - xmin) / 1000, height: (ymax - ymin) / 1000 },
    usage,
  };
}

/**
 * Pastes the real product cutout over the model's rendition, scaled to cover the
 * located box, with a soft contact shadow. Returns the public URL of the composite.
 */
export async function compositeProduct(
  generatedImageUrl: string,
  cutout: ProductCutout,
  box: Box
): Promise<string> {
  const { images } = await loadPreparedReferences([generatedImageUrl]);
  const base = sharp(Buffer.from(images[0].data, 'base64'));
  const meta = await base.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('Could not read generated image dimensions');

  const boxW = box.width * W;
  const boxH = box.height * H;
  // Cover the rendered product so none of its garbled text peeks out.
  const scale = Math.max(boxW / cutout.width, boxH / cutout.height) * 1.04;
  const pw = Math.max(1, Math.round(cutout.width * scale));
  const ph = Math.max(1, Math.round(cutout.height * scale));
  const cx = box.left * W + boxW / 2;
  const cy = box.top * H + boxH / 2;
  const left = Math.round(cx - pw / 2);
  const top = Math.round(cy - ph / 2);

  const product = await sharp(cutout.png).resize(pw, ph, { fit: 'fill' }).png().toBuffer();
  const shadow = await sharp(product)
    .ensureAlpha()
    .linear([0, 0, 0, 0.55], [0, 0, 0, 0])
    .blur(Math.max(6, pw * 0.03))
    .png()
    .toBuffer();

  const layers = await Promise.all([
    clipToCanvas(shadow, left + Math.round(pw * 0.02), top + Math.round(ph * 0.04), pw, ph, W, H),
    clipToCanvas(product, left, top, pw, ph, W, H),
  ]);
  const composite = await base
    .composite(layers.filter((layer): layer is NonNullable<typeof layer> => layer !== null))
    .png()
    .toBuffer();

  return uploadDataUrlToBucket(`data:image/png;base64,${composite.toString('base64')}`, 'generated-thumbnails');
}

/** sharp rejects overlays that extend past the base image, so crop them to the visible part. */
async function clipToCanvas(
  layer: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(canvasW, left + width);
  const y1 = Math.min(canvasH, top + height);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + width && y1 === top + height) {
    return { input: layer, left, top };
  }
  const cropped = await sharp(layer)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input: cropped, left: x0, top: y0 };
}
