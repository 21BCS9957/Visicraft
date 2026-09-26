import sharp from 'sharp';
import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { uploadDataUrlToBucket } from '@/lib/server/supabaseStorage';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * Generative models redraw packaging and garble small print. Instead of trusting
 * the rendered product, we cut the real product out of the canonical store photo
 * and paste it over the model's version, so label text is exact by construction.
 *
 * Cutting: an ML salient-object model (@imgly/background-removal-node, on-CPU)
 * produces an alpha matte for the whole photo. The model is under-confident on
 * dark products, so the matte is binarised at a low threshold: true background is
 * exactly zero, product pixels are merely low. Gemini's bounding box then picks the
 * package region and only the largest connected region inside it is kept, which
 * drops icons, arrows and props that share the photo.
 */

export interface ProductCutout {
  png: Buffer;
  width: number;
  height: number;
  sourceUrl: string;
  /** Mean luminance (0-255) of the opaque pixels, used to match scene lighting. */
  luminance: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CutoutResult {
  cutout: ProductCutout | null;
  reason?: string;
  usage?: ProviderUsage;
}

const ML_INPUT_MAX_EDGE = 1600; // the matting model works at ~1k internally; larger input just costs time
const ALPHA_THRESHOLD = 0.06; // matte values below this are background
const BOX_MARGIN = 0.08; // expand Gemini's box so the whole silhouette is inside
const MIN_PRODUCT_SHARE = 0.18; // product must cover at least this share of the box
const MIN_PRODUCT_EXTENT = 0.55; // and span at least this share of the box width/height

/** Asks Gemini for the bounding box of the product package in an image. */
export async function locateProduct(imageUrl: string): Promise<{ box: Box | null; usage: ProviderUsage }> {
  const { images } = await loadPreparedReferences([imageUrl]);
  const { response, providerModel } = await requestGeminiText(
    [
      { text: 'Find the single main retail product package (pouch, bottle, box, jar, tube or similar) in this image. Return JSON only: {"box_2d":[ymin,xmin,ymax,xmax]} with coordinates normalised to 0-1000, tightly enclosing the whole package including its edges but excluding shadows, props, icons and text that are not printed on the package. If there is no package, return {"box_2d":null}.' },
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

/** Runs the on-CPU matting model. Returns null when the engine is disabled or unavailable. */
async function removeBackgroundML(png: Buffer): Promise<Buffer | null> {
  if (process.env.PRODUCT_CUTOUT_ENGINE === 'off') return null;
  try {
    const { removeBackground } = await import('@imgly/background-removal-node');
    const result = await removeBackground(new Blob([new Uint8Array(png)], { type: 'image/png' }), {
      model: 'medium',
      output: { format: 'image/png', quality: 1 },
    });
    return Buffer.from(await result.arrayBuffer());
  } catch (error) {
    console.warn('Background removal model unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Cuts the product out of a store photo. Returns null (with a reason) when it
 * cannot be done reliably, in which case callers keep the model rendering.
 */
export async function cutoutProduct(imageUrl: string): Promise<CutoutResult> {
  const { images } = await loadPreparedReferences([imageUrl]);
  const source = Buffer.from(images[0].data, 'base64');
  const meta = await sharp(source).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return { cutout: null, reason: 'unreadable image' };

  const mlInput = await sharp(source)
    .resize({ width: ML_INPUT_MAX_EDGE, height: ML_INPUT_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const [matted, located] = await Promise.all([removeBackgroundML(mlInput), locateProduct(imageUrl)]);
  if (!matted) return { cutout: null, reason: 'matting engine unavailable', usage: located.usage };
  if (!located.box) return { cutout: null, reason: 'no package located', usage: located.usage };

  // Full-resolution alpha from the matte, binarised at a low threshold.
  const matteAlpha = await sharp(matted)
    .ensureAlpha()
    .extractChannel(3)
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaFull = singleChannel(matteAlpha.data, matteAlpha.info.channels, W * H);
  const rgb = await sharp(source).removeAlpha().raw().toBuffer();

  const mx = located.box.width * BOX_MARGIN * W;
  const my = located.box.height * BOX_MARGIN * H;
  const left = Math.max(0, Math.floor(located.box.left * W - mx));
  const top = Math.max(0, Math.floor(located.box.top * H - my));
  const right = Math.min(W, Math.ceil((located.box.left + located.box.width) * W + mx));
  const bottom = Math.min(H, Math.ceil((located.box.top + located.box.height) * H + my));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return { cutout: null, reason: 'package box too small', usage: located.usage };

  // Hard threshold: the matte is under-confident inside dark products, so any
  // interior softness must become fully opaque; edges are feathered later.
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      alpha[y * width + x] = alphaFull[(top + y) * W + left + x] / 255 < ALPHA_THRESHOLD ? 0 : 255;
    }
  }

  // Keep only the largest opaque region (the package); drop icons, arrows, props.
  const label = new Int32Array(width * height).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  const extents: Array<{ minX: number; minY: number; maxX: number; maxY: number; size: number }> = [];
  for (let start = 0; start < width * height; start++) {
    if (alpha[start] === 0 || label[start] !== -1) continue;
    const id = extents.length;
    const ext = { minX: width, minY: height, maxX: 0, maxY: 0, size: 0 };
    extents.push(ext);
    const queue = [start];
    label[start] = id;
    while (queue.length) {
      const idx = queue.pop() as number;
      const x = idx % width;
      const y = (idx - x) / width;
      ext.size += 1;
      if (x < ext.minX) ext.minX = x;
      if (x > ext.maxX) ext.maxX = x;
      if (y < ext.minY) ext.minY = y;
      if (y > ext.maxY) ext.maxY = y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (alpha[n] !== 0 && label[n] === -1) { label[n] = id; queue.push(n); }
      }
    }
    if (ext.size > bestSize) { bestSize = ext.size; bestLabel = id; }
  }
  if (bestLabel < 0) return { cutout: null, reason: 'nothing left after matting', usage: located.usage };
  const best = extents[bestLabel];
  const share = best.size / (width * height);
  const extentX = (best.maxX - best.minX + 1) / width;
  const extentY = (best.maxY - best.minY + 1) / height;
  if (share < MIN_PRODUCT_SHARE || extentX < MIN_PRODUCT_EXTENT || extentY < MIN_PRODUCT_EXTENT) {
    return { cutout: null, reason: `matted region too small (share ${share.toFixed(2)}, extent ${extentX.toFixed(2)}x${extentY.toFixed(2)})`, usage: located.usage };
  }

  // Keep the product component only, then erode its edge a few pixels so the
  // source background's colour fringe is not carried into the ad.
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = label[i] === bestLabel ? 255 : 0;
  // The matte dips below threshold in patches inside dark packaging; a package has no
  // see-through parts, so fill every transparent region not reachable from the border.
  const reachable = new Uint8Array(width * height);
  const fill: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * width + x;
    if (mask[i] === 0 && !reachable[i]) { reachable[i] = 1; fill.push(i); }
  };
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }
  while (fill.length) {
    const i = fill.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  let filledHoles = 0;
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 0 && !reachable[i]) { mask[i] = 255; filledHoles += 1; }
  }
  if (filledHoles) console.log(`Product cutout: filled ${filledHoles} interior hole pixels`);
  const bandRadius = Math.max(2, Math.round(Math.min(W, H) / 500));
  const core = erode(mask, width, height, bandRadius);
  // Alpha: core → 255; band (mask minus core) → the matte's own alpha, kept a hair
  // above zero so thin edges survive; outside → 0. Then a 1px feather.
  const alphaBand = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      if (core[i]) { alphaBand[i] = 255; continue; }
      const matte = alphaFull[(top + y) * W + left + x];
      alphaBand[i] = Math.max(matte, 48);
    }
  }
  const feathered = boxBlur3(alphaBand, width, height);
  // Source background colour for de-fringing: only when the photo's corners agree
  // (packshots on white or a flat colour); busy backgrounds skip this step.
  const background = uniformBackground(rgb, W, H);

  const outW = best.maxX - best.minX + 1;
  const outH = best.maxY - best.minY + 1;
  const out = Buffer.alloc(outW * outH * 4);
  let lumSum = 0;
  let lumCount = 0;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const cx = best.minX + x;
      const cy = best.minY + y;
      const ci = cy * width + cx;
      const si = ((top + cy) * W + left + cx) * 3;
      const a = feathered[ci];
      const oi = (y * outW + x) * 4;
      let r = rgb[si];
      let g = rgb[si + 1];
      let b = rgb[si + 2];
      if (background && a > 0 && a < 255) {
        // Observed = alpha·true + (1−alpha)·background ⇒ recover the true colour.
        const alpha = a / 255;
        r = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * background[0]) / alpha)));
        g = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * background[1]) / alpha)));
        b = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * background[2]) / alpha)));
      }
      out[oi] = r;
      out[oi + 1] = g;
      out[oi + 2] = b;
      out[oi + 3] = a;
      if (a === 255) {
        lumSum += 0.2126 * rgb[si] + 0.7152 * rgb[si + 1] + 0.0722 * rgb[si + 2];
        lumCount += 1;
      }
    }
  }
  const png = await sharp(out, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer();
  return {
    cutout: { png, width: outW, height: outH, sourceUrl: imageUrl, luminance: lumCount ? lumSum / lumCount : 128 },
    usage: located.usage,
  };
}

export type Quad = [[number, number], [number, number], [number, number], [number, number]];

/**
 * Asks Gemini for the four corners of the rendered package's front face (TL, TR,
 * BR, BL, normalised 0-1000), so the real cutout can be warped into the scene's
 * perspective instead of pasted flat.
 */
export async function locateProductQuad(imageUrl: string): Promise<{ quad: Quad | null; box: Box | null; usage: ProviderUsage }> {
  const { images } = await loadPreparedReferences([imageUrl]);
  const { response, providerModel } = await requestGeminiText(
    [
      { text: 'Find the single main product package in this advertisement image. Return JSON only: {"quad":[[x,y],[x,y],[x,y],[x,y]],"box_2d":[ymin,xmin,ymax,xmax]}. "quad" is the four corners of the package\'s FRONT FACE as drawn in the image (with its perspective), in this order: top-left, top-right, bottom-right, bottom-left, each as [x,y] normalised to 0-1000. "box_2d" is the tight bounding box of the whole package. Exclude shadows, props, hands and text that is not printed on the package. If there is no package, return {"quad":null,"box_2d":null}.' },
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
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start < 0 || end <= start) return { quad: null, box: null, usage };
  let parsed: { quad?: unknown; box_2d?: unknown } = {};
  try { parsed = JSON.parse(json.slice(start, end + 1)); } catch { return { quad: null, box: null, usage }; }
  let box: Box | null = null;
  if (Array.isArray(parsed.box_2d) && parsed.box_2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = parsed.box_2d.map(Number);
    if (ymax > ymin && xmax > xmin) box = { left: xmin / 1000, top: ymin / 1000, width: (xmax - xmin) / 1000, height: (ymax - ymin) / 1000 };
  }
  let quad: Quad | null = null;
  if (Array.isArray(parsed.quad) && parsed.quad.length === 4 && parsed.quad.every((p) => Array.isArray(p) && p.length === 2)) {
    quad = parsed.quad.map((p) => [Number(p[0]) / 1000, Number(p[1]) / 1000]) as Quad;
    if (!isUsableQuad(quad)) quad = null;
  }
  if (!box && quad) {
    const xs = quad.map((p) => p[0]);
    const ys = quad.map((p) => p[1]);
    box = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { quad, box, usage };
}

/** Convex, sane aspect, not tiny: a quad we can warp onto without producing garbage. */
function isUsableQuad(q: Quad): boolean {
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const signs = [0, 1, 2, 3].map((i) => Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])));
  if (new Set(signs.filter((v) => v !== 0)).size !== 1) return false;
  const area = Math.abs(q.reduce((acc, p, i) => acc + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2;
  if (area < 0.01) return false;
  const w = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
  const h = (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2;
  return w > 0.03 && h > 0.03 && w / h > 0.25 && w / h < 4;
}

/** Solves the 3x3 homography mapping src[i] → dst[i] (h33 = 1). */
function solveHomography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting on the 8x8 system.
  const n = 8;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    [b[c], b[pivot]] = [b[pivot], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let k = r + 1; k < n; k++) sum -= A[r][k] * h[k];
    h[r] = sum / (A[r][r] || 1e-12);
  }
  return [...h, 1];
}

/**
 * Warps the cutout onto the quad (inverse mapping with bilinear sampling) and
 * darkens/brightens it with the scene's broad light falloff taken from the
 * model's own rendering, so the real product sits in the shot's perspective and
 * light. Returns the public URL of the composite.
 */
export async function compositeProductPerspective(
  generatedImageUrl: string,
  cutout: ProductCutout,
  quad: Quad
): Promise<string> {
  const { images } = await loadPreparedReferences([generatedImageUrl]);
  const baseBuffer = Buffer.from(images[0].data, 'base64');
  const meta = await sharp(baseBuffer).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('Could not read generated image dimensions');

  // Grow the quad ~3% about its centre so no rendered edge peeks out.
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4;
  const cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  const grown = quad.map(([x, y]) => [(cx + (x - cx) * 1.03) * W, (cy + (y - cy) * 1.03) * H]);
  const xs = grown.map((p) => p[0]);
  const ys = grown.map((p) => p[1]);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(W, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(H, Math.ceil(Math.max(...ys)));
  const bw = right - left;
  const bh = bottom - top;
  if (bw < 8 || bh < 8) throw new Error('Quad too small');

  const cut = await sharp(cutout.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = cut.info.width;
  const ch = cut.info.height;
  // dest (canvas px) → unit square of the cutout
  const Hinv = solveHomography(grown, [[0, 0], [1, 0], [1, 1], [0, 1]]);

  // Scene light: broad blur of the render's luminance inside the quad's bbox, as a ratio to its mean.
  const shade = await sharp(baseBuffer).extract({ left, top, width: bw, height: bh }).greyscale().blur(Math.max(8, bw * 0.12)).raw().toBuffer({ resolveWithObject: true });
  const shadeData = singleChannel(shade.data, shade.info.channels, bw * bh);
  let shadeMean = 0;
  for (let i = 0; i < bw * bh; i++) shadeMean += shadeData[i];
  shadeMean = Math.max(1, shadeMean / (bw * bh));

  const layer = Buffer.alloc(bw * bh * 4);
  const sample = (u: number, v: number, c: number): number => {
    const x = u * (cw - 1);
    const y = v * (ch - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(cw - 1, x0 + 1);
    const y1 = Math.min(ch - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const at = (xx: number, yy: number) => cut.data[(yy * cw + xx) * 4 + c];
    return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const X = left + x + 0.5;
      const Y = top + y + 0.5;
      const w = Hinv[6] * X + Hinv[7] * Y + Hinv[8];
      const u = (Hinv[0] * X + Hinv[1] * Y + Hinv[2]) / w;
      const v = (Hinv[3] * X + Hinv[4] * Y + Hinv[5]) / w;
      const o = (y * bw + x) * 4;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) { layer[o + 3] = 0; continue; }
      const ratio = Math.min(1.25, Math.max(0.72, shadeData[y * bw + x] / shadeMean));
      const gain = Math.pow(ratio, 0.85);
      layer[o] = Math.min(255, Math.round(sample(u, v, 0) * gain));
      layer[o + 1] = Math.min(255, Math.round(sample(u, v, 1) * gain));
      layer[o + 2] = Math.min(255, Math.round(sample(u, v, 2) * gain));
      layer[o + 3] = Math.round(sample(u, v, 3));
    }
  }
  const layerPng = await sharp(layer, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
  const composite = await sharp(baseBuffer).composite([{ input: layerPng, left, top }]).png().toBuffer();
  return uploadDataUrlToBucket(`data:image/png;base64,${composite.toString('base64')}`, 'generated-thumbnails');
}

/**
 * Pastes the real product cutout over the model's rendition, scaled to cover the
 * located box, brightness-matched to the scene, with a soft contact shadow.
 * Returns the public URL of the composite.
 */
export async function compositeProduct(
  generatedImageUrl: string,
  cutout: ProductCutout,
  box: Box
): Promise<string> {
  const { images } = await loadPreparedReferences([generatedImageUrl]);
  const baseBuffer = Buffer.from(images[0].data, 'base64');
  const meta = await sharp(baseBuffer).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('Could not read generated image dimensions');

  const boxW = box.width * W;
  const boxH = box.height * H;
  // Cover the rendered product so none of its garbled text peeks out.
  const scale = Math.max(boxW / cutout.width, boxH / cutout.height) * 1.05;
  const pw = Math.max(1, Math.round(cutout.width * scale));
  const ph = Math.max(1, Math.round(cutout.height * scale));
  const cx = box.left * W + boxW / 2;
  const cy = box.top * H + boxH / 2;
  const left = Math.round(cx - pw / 2);
  const top = Math.round(cy - ph / 2);

  // Match the scene's brightness on the product (never its hue: packaging colours stay true).
  const region = await sharp(baseBuffer)
    .extract({
      left: Math.max(0, Math.round(box.left * W)),
      top: Math.max(0, Math.round(box.top * H)),
      width: Math.max(1, Math.min(W - Math.round(box.left * W), Math.round(boxW))),
      height: Math.max(1, Math.min(H - Math.round(box.top * H), Math.round(boxH))),
    })
    .stats();
  const sceneLum = 0.2126 * region.channels[0].mean + 0.7152 * region.channels[1].mean + 0.0722 * region.channels[2].mean;
  const brightness = Math.min(1.12, Math.max(0.82, sceneLum / Math.max(1, cutout.luminance)));

  const product = await sharp(cutout.png)
    .resize(pw, ph, { fit: 'fill' })
    .modulate({ brightness })
    .png()
    .toBuffer();
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
  const composite = await sharp(baseBuffer)
    .composite(layers.filter((layer): layer is NonNullable<typeof layer> => layer !== null))
    .png()
    .toBuffer();

  return uploadDataUrlToBucket(`data:image/png;base64,${composite.toString('base64')}`, 'generated-thumbnails');
}

/**
 * sharp's raw output does not always keep a single band (a blurred 1-channel
 * image comes back as 3), so take the first channel per pixel defensively.
 */
function singleChannel(data: Buffer, channels: number, pixels: number): Uint8Array {
  if (channels === 1 && data.length === pixels) return new Uint8Array(data.buffer, data.byteOffset, pixels);
  const stride = Math.max(1, Math.round(data.length / pixels));
  const out = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) out[i] = data[i * stride];
  return out;
}

/** 3x3 box blur of a mask: a one-pixel soft edge without relying on sharp's channel handling. */
function boxBlur3(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += mask[yy * width + xx];
          count += 1;
        }
      }
      out[y * width + x] = Math.round(sum / count);
    }
  }
  return out;
}

/** The photo's background colour when its corners agree within a small tolerance, else null. */
function uniformBackground(rgb: Buffer, W: number, H: number): [number, number, number] | null {
  const pad = Math.max(2, Math.round(Math.min(W, H) * 0.02));
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * W + x) * 3;
    return [rgb[i], rgb[i + 1], rgb[i + 2]];
  };
  const samples = [
    px(pad, pad), px(W - 1 - pad, pad), px(pad, H - 1 - pad), px(W - 1 - pad, H - 1 - pad),
    px(Math.floor(W / 2), pad), px(Math.floor(W / 2), H - 1 - pad), px(pad, Math.floor(H / 2)), px(W - 1 - pad, Math.floor(H / 2)),
  ];
  const mean: [number, number, number] = [0, 0, 0];
  samples.forEach((c) => { mean[0] += c[0] / samples.length; mean[1] += c[1] / samples.length; mean[2] += c[2] / samples.length; });
  const spread = Math.max(...samples.map((c) => Math.hypot(c[0] - mean[0], c[1] - mean[1], c[2] - mean[2])));
  return spread <= 24 ? [Math.round(mean[0]), Math.round(mean[1]), Math.round(mean[2])] : null;
}

/** Binary erosion: a pixel stays opaque only if every pixel within `radius` is opaque. */
function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] === 0) continue;
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { keep = false; break; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || mask[yy * width + xx] === 0) { keep = false; break; }
        }
      }
      out[i] = keep ? 255 : 0;
    }
  }
  return out;
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
