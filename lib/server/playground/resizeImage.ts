import sharp from 'sharp';
import { placeOriginal, type Rect } from '../../playground/resize';

/**
 * The pixel side of "Another size". Fit: the original on a blurred copy of itself or a colour.
 * Extend: the original on a canvas of the new shape with flat placeholder strips for Gemini to
 * paint; Gemini's answer is lined up with the original, its strips are colour-matched along
 * each seam, and the original is pasted back untouched, so every pixel of it stays exactly as
 * it was. Relative imports only, so it can be tested with plain node (jiti).
 */

export interface RgbImage {
  /** 8-bit RGB, row by row. */
  data: Buffer;
  width: number;
  height: number;
}

type Colour = [number, number, number];
type Side = 'top' | 'bottom' | 'left' | 'right';

const rawOf = (image: { width: number; height: number }, channels: 1 | 3 = 3) => ({ raw: { width: image.width, height: image.height, channels } });

/** Decodes an image once, upright, as RGB (transparent parts on white). */
export async function decodeRgb(bytes: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`The image decoded with ${info.channels} channels.`);
  return { data, width: info.width, height: info.height };
}

export async function resizeRgb(image: RgbImage, width: number, height: number): Promise<RgbImage> {
  if (image.width === width && image.height === height) return image;
  const data = await sharp(image.data, rawOf(image)).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  return { data, width, height };
}

function paste(target: RgbImage, source: RgbImage, left: number, top: number) {
  const row = source.width * 3;
  for (let y = 0; y < source.height; y++) {
    source.data.copy(target.data, ((top + y) * target.width + left) * 3, y * row, (y + 1) * row);
  }
}

function fillRect(target: RgbImage, rect: Rect, colour: Colour) {
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const i = (y * target.width + x) * 3;
      target.data[i] = colour[0];
      target.data[i + 1] = colour[1];
      target.data[i + 2] = colour[2];
    }
  }
}

function averageColour(image: RgbImage, rect: Rect): Colour {
  const sum = [0, 0, 0];
  let count = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((rect.width * rect.height) / 40_000)));
  for (let y = rect.top; y < rect.top + rect.height; y += step) {
    for (let x = rect.left; x < rect.left + rect.width; x += step) {
      const i = (y * image.width + x) * 3;
      sum[0] += image.data[i];
      sum[1] += image.data[i + 1];
      sum[2] += image.data[i + 2];
      count++;
    }
  }
  return sum.map((value) => Math.round(value / Math.max(1, count))) as Colour;
}

/** Encodes raw RGB as a JPEG (Fit) or a lossless PNG (Extend: the original's pixels stay exact). */
async function encode(image: RgbImage, format: 'jpeg' | 'png'): Promise<Buffer> {
  const pipeline = sharp(image.data, rawOf(image));
  return format === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
}

/* ------------------------------------------------------------------ Fit */

/** The original scaled to cover the canvas, blurred at a small size (smooth and cheap) and darkened a little. */
async function blurredCover(source: RgbImage, width: number, height: number): Promise<RgbImage> {
  const smallWidth = Math.max(24, Math.round(width / 12));
  const smallHeight = Math.max(24, Math.round(height / 12));
  const small = await sharp(source.data, rawOf(source))
    .resize(smallWidth, smallHeight, { fit: 'cover' })
    .blur(Math.max(1, smallWidth / 14))
    .linear(0.72, 0)
    .raw()
    .toBuffer();
  const data = await sharp(small, rawOf({ width: smallWidth, height: smallHeight })).resize(width, height, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
  return { data, width, height };
}

/**
 * An image enlarged (Lanczos) so its short edge is at least `minEdge`, in its own format (PNG
 * stays PNG, anything else becomes JPEG q95); unchanged when it is already that big.
 */
export async function enlargeTo(bytes: Buffer, mimeType: string, minEdge: number): Promise<{ bytes: Buffer; mimeType: string }> {
  const meta = await sharp(bytes, { failOn: 'none' }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const short = Math.min(width, height);
  if (!short || short >= minEdge) return { bytes, mimeType };
  const scale = minEdge / short;
  const pipeline = sharp(bytes, { failOn: 'none' }).rotate().resize(Math.round(width * scale), Math.round(height * scale), { kernel: 'lanczos3' });
  return mimeType === 'image/png'
    ? { bytes: await pipeline.png().toBuffer(), mimeType: 'image/png' }
    : { bytes: await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer(), mimeType: 'image/jpeg' };
}

export function hexColour(hex: string): Colour {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Fit: the original at `rect` (by default as large as fits, centred) over a blurred copy of
 * itself or a flat colour. JPEG.
 */
export async function fitImage(source: RgbImage, width: number, height: number, ratio: string, background: string, place?: Rect): Promise<{ bytes: Buffer; rect: Rect }> {
  const rect = place ?? placeOriginal(source.width, source.height, width, height, 'fit', ratio);
  const original = await resizeRgb(source, rect.width, rect.height);
  let canvas: RgbImage;
  if (background === 'blur') {
    canvas = await blurredCover(source, width, height);
  } else {
    canvas = { data: Buffer.alloc(width * height * 3), width, height };
    fillRect(canvas, { left: 0, top: 0, width, height }, hexColour(background));
  }
  paste(canvas, original, rect.left, rect.top);
  return { bytes: await encode(canvas, 'jpeg'), rect };
}

/* ------------------------------------------------------------------ Extend */

export interface Strip {
  side: Side;
  rect: Rect;
  /** The flat placeholder colour Gemini sees there. */
  fill: Colour;
}

export interface ExtendCanvas {
  width: number;
  height: number;
  /** Where the original sits. */
  rect: Rect;
  /** The original at that size: what the copy keeps, pixel for pixel. */
  original: RgbImage;
  /** What Gemini gets: the original with flat placeholder strips around it. */
  canvas: RgbImage;
  strips: Strip[];
}

function stripsAround(rect: Rect, width: number, height: number): Array<{ side: Side; rect: Rect }> {
  const strips: Array<{ side: Side; rect: Rect }> = [];
  const bottom = rect.top + rect.height;
  const right = rect.left + rect.width;
  if (rect.top > 0) strips.push({ side: 'top', rect: { left: 0, top: 0, width, height: rect.top } });
  if (bottom < height) strips.push({ side: 'bottom', rect: { left: 0, top: bottom, width, height: height - bottom } });
  if (rect.left > 0) strips.push({ side: 'left', rect: { left: 0, top: rect.top, width: rect.left, height: rect.height } });
  if (right < width) strips.push({ side: 'right', rect: { left: right, top: rect.top, width: width - right, height: rect.height } });
  return strips;
}

/** The original's band along one edge (3% deep). */
function edgeRegion(original: RgbImage, side: Side): Rect {
  const depthY = Math.max(2, Math.round(original.height * 0.03));
  const depthX = Math.max(2, Math.round(original.width * 0.03));
  return side === 'top'
    ? { left: 0, top: 0, width: original.width, height: depthY }
    : side === 'bottom'
      ? { left: 0, top: original.height - depthY, width: original.width, height: depthY }
      : side === 'left'
        ? { left: 0, top: 0, width: depthX, height: original.height }
        : { left: original.width - depthX, top: 0, width: depthX, height: original.height };
}

/** The average colour along one edge of the original, so a strip reads as more of the same scene. */
function edgeColour(original: RgbImage, side: Side): Colour {
  return averageColour(original, edgeRegion(original, side));
}

/** How much the brightness varies in a region (standard deviation, 0–255): its texture. */
function texture(image: RgbImage, rect: Rect): { spread: number; colour: Colour } {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const colour: Colour = [0, 0, 0];
  const step = Math.max(1, Math.floor(Math.sqrt((rect.width * rect.height) / 20_000)));
  for (let y = rect.top; y < rect.top + rect.height; y += step) {
    for (let x = rect.left; x < rect.left + rect.width; x += step) {
      const i = (y * image.width + x) * 3;
      const luma = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      sum += luma;
      sumSq += luma * luma;
      for (let c = 0; c < 3; c++) colour[c] += image.data[i + c];
      count++;
    }
  }
  const mean = sum / Math.max(1, count);
  return {
    spread: Math.sqrt(Math.max(0, sumSq / Math.max(1, count) - mean * mean)),
    colour: colour.map((value) => value / Math.max(1, count)) as Colour,
  };
}

/**
 * The canvas Gemini paints: the original at `rect` (it must already be that size), the rest flat
 * strips of its edge colours.
 */
export function extendCanvasAt(original: RgbImage, width: number, height: number, rect: Rect): ExtendCanvas {
  if (original.width !== rect.width || original.height !== rect.height) throw new Error('The original must be at its place\'s size.');
  const canvas: RgbImage = { data: Buffer.alloc(width * height * 3), width, height };
  const strips = stripsAround(rect, width, height).map((strip) => ({ ...strip, fill: edgeColour(original, strip.side) }));
  strips.forEach((strip) => fillRect(canvas, strip.rect, strip.fill));
  paste(canvas, original, rect.left, rect.top);
  return { width, height, rect, original, canvas, strips };
}

/** The part of an image inside `rect`. */
export function cropRgb(image: RgbImage, rect: Rect): RgbImage {
  const data = Buffer.alloc(rect.width * rect.height * 3);
  for (let y = 0; y < rect.height; y++) {
    image.data.copy(data, y * rect.width * 3, ((rect.top + y) * image.width + rect.left) * 3, ((rect.top + y) * image.width + rect.left + rect.width) * 3);
  }
  return { data, width: rect.width, height: rect.height };
}

/** The canvas Gemini paints for the plain placement of the original in the new shape. */
export async function extendCanvas(source: RgbImage, width: number, height: number, ratio: string, safe = false): Promise<ExtendCanvas> {
  const rect = placeOriginal(source.width, source.height, width, height, 'extend', ratio, safe);
  const original = await resizeRgb(source, rect.width, rect.height);
  const canvas: RgbImage = { data: Buffer.alloc(width * height * 3), width, height };
  const strips = stripsAround(rect, width, height).map((strip) => ({ ...strip, fill: edgeColour(original, strip.side) }));
  strips.forEach((strip) => fillRect(canvas, strip.rect, strip.fill));
  paste(canvas, original, rect.left, rect.top);
  return { width, height, rect, original, canvas, strips };
}

/** The canvas as Gemini receives it: JPEG, at most 2560 px on the long edge. */
export async function canvasForGemini(prepared: ExtendCanvas): Promise<Buffer> {
  return sharp(prepared.canvas.data, rawOf(prepared.canvas))
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Where the answer has the original: answer(c + scale·(p − c) + (dx, dy)) ≈ original(p), c = the original's centre. */
export interface Alignment {
  dx: number;
  dy: number;
  scale: number;
  /** Mean luminance difference (0–255) over the original's area once lined up. */
  residual: number;
}

interface LumaImage {
  data: Float32Array;
  width: number;
  height: number;
}

async function lumaAt(image: RgbImage, width: number): Promise<LumaImage> {
  const height = Math.max(8, Math.round((image.height * width) / image.width));
  const raw = await sharp(image.data, rawOf(image)).resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer();
  return { data: Float32Array.from(raw), width, height };
}

function sample(image: LumaImage, x: number, y: number): number {
  const cx = Math.min(image.width - 1.001, Math.max(0, x));
  const cy = Math.min(image.height - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * image.width + x0;
  const top = image.data[i] * (1 - fx) + image.data[i + 1] * fx;
  const bottom = image.data[i + image.width] * (1 - fx) + image.data[i + image.width + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Mean difference between the original's area and the answer under one candidate alignment (in the level's pixels). */
function difference(original: LumaImage, answer: LumaImage, area: Rect, stride: number, scale: number, dx: number, dy: number): number {
  const cx = area.left + area.width / 2;
  const cy = area.top + area.height / 2;
  let sum = 0;
  let count = 0;
  for (let y = area.top; y < area.top + area.height; y += stride) {
    const ay = cy + scale * (y - cy) + dy;
    for (let x = area.left; x < area.left + area.width; x += stride) {
      sum += Math.abs(original.data[y * original.width + x] - sample(answer, cx + scale * (x - cx) + dx, ay));
      count++;
    }
  }
  return count ? sum / count : 255;
}

/** Edge strength of a level (change to the right plus change below): smooth skies and walls weigh nothing in the search. */
function edgesOf(level: LumaImage): LumaImage {
  const { width, height, data } = level;
  const edges = new Float32Array(width * height);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      edges[i] = Math.abs(data[i + 1] - data[i]) + Math.abs(data[i + width] - data[i]);
    }
  }
  return { data: edges, width, height };
}

/** The original's area at one level, a little inside its edges (the seam itself is not evidence). */
function areaAt(rect: Rect, factor: number, level: LumaImage): Rect {
  const margin = 0.04;
  const left = Math.ceil((rect.left + rect.width * margin) * factor);
  const top = Math.ceil((rect.top + rect.height * margin) * factor);
  const right = Math.min(level.width - 1, Math.floor((rect.left + rect.width * (1 - margin)) * factor));
  const bottom = Math.min(level.height - 1, Math.floor((rect.top + rect.height * (1 - margin)) * factor));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/**
 * How Gemini moved the original, if at all: a coarse search over shift and zoom at 192 px wide,
 * then a fine one at 768 px, both on edge strength so smooth areas can't pull it off. Gemini
 * usually keeps the framing to a pixel or two; a large residual (mean brightness difference
 * once lined up) means it re-composed the picture.
 */
export async function alignAnswer(prepared: ExtendCanvas, answer: RgbImage): Promise<Alignment> {
  const levels = [192, 768].map((width) => Math.min(width, prepared.width));
  const [coarseWidth, fineWidth] = levels;
  const [lumaCoarse, answerLumaCoarse, originalFine, answerFine] = await Promise.all([
    lumaAt(prepared.canvas, coarseWidth),
    lumaAt(answer, coarseWidth),
    lumaAt(prepared.canvas, fineWidth),
    lumaAt(answer, fineWidth),
  ]);
  const [originalCoarse, answerCoarse, originalFineEdges, answerFineEdges] = [lumaCoarse, answerLumaCoarse, originalFine, answerFine].map(edgesOf);

  const coarseFactor = coarseWidth / prepared.width;
  const coarseArea = areaAt(prepared.rect, coarseFactor, originalCoarse);
  let best = { scale: 1, dx: 0, dy: 0, value: difference(originalCoarse, answerCoarse, coarseArea, 2, 1, 0, 0) };
  for (let scale = 0.95; scale <= 1.0501; scale += 0.01) {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const value = difference(originalCoarse, answerCoarse, coarseArea, 2, scale, dx, dy);
        if (value < best.value - 1e-6) best = { scale, dx, dy, value };
      }
    }
  }

  const fineFactor = fineWidth / prepared.width;
  const step = fineWidth / coarseWidth;
  const fineArea = areaAt(prepared.rect, fineFactor, originalFine);
  const at = (scale: number, dx: number, dy: number) => difference(originalFineEdges, answerFineEdges, fineArea, 3, scale, dx, dy);
  let fine = { scale: best.scale, dx: best.dx * step, dy: best.dy * step, value: Infinity };
  const centre = { ...fine };
  // A full coarse step either way, so a near miss at 192 px is still found.
  for (const ds of [-0.01, -0.0075, -0.005, -0.0025, 0, 0.0025, 0.005, 0.0075, 0.01]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const candidate = { scale: centre.scale + ds, dx: centre.dx + dx, dy: centre.dy + dy };
        const value = at(candidate.scale, candidate.dx, candidate.dy);
        if (value < fine.value) fine = { ...candidate, value };
      }
    }
  }
  // Between the grid steps: the low point of a parabola through each axis's neighbours.
  const vertex = (minus: number, middle: number, plus: number) => {
    const curve = minus - 2 * middle + plus;
    return curve > 1e-6 ? Math.max(-0.5, Math.min(0.5, (minus - plus) / (2 * curve))) : 0;
  };
  const dx = fine.dx + vertex(at(fine.scale, fine.dx - 1, fine.dy), fine.value, at(fine.scale, fine.dx + 1, fine.dy));
  const dy = fine.dy + vertex(at(fine.scale, fine.dx, fine.dy - 1), fine.value, at(fine.scale, fine.dx, fine.dy + 1));
  const scale = fine.scale + 0.0025 * vertex(at(fine.scale - 0.0025, fine.dx, fine.dy), fine.value, at(fine.scale + 0.0025, fine.dx, fine.dy));
  const refined = at(scale, dx, dy);
  const chosen = refined <= fine.value ? { scale, dx, dy } : fine;
  const residual = difference(originalFine, answerFine, fineArea, 3, chosen.scale, chosen.dx, chosen.dy);
  return { scale: chosen.scale, dx: chosen.dx / fineFactor, dy: chosen.dy / fineFactor, residual };
}

/** The answer moved back in line with the original (bilinear), at the canvas size. */
function warp(answer: RgbImage, rect: Rect, alignment: Alignment): RgbImage {
  const { scale, dx, dy } = alignment;
  if (Math.abs(scale - 1) < 0.0005 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return { ...answer, data: Buffer.from(answer.data) };
  const { width, height } = answer;
  const out = Buffer.alloc(width * height * 3);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(height - 1.001, Math.max(0, cy + scale * (y - cy) + dy));
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1.001, Math.max(0, cx + scale * (x - cx) + dx));
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const i = (y0 * width + x0) * 3;
      const j = i + width * 3;
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = answer.data[i + c] * (1 - fx) + answer.data[i + 3 + c] * fx;
        const bottom = answer.data[j + c] * (1 - fx) + answer.data[j + 3 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { data: out, width, height };
}

/**
 * True when Gemini left a strip as the flat placeholder: its colour and almost none of the
 * texture the original has at that edge. A painted dark wall or a smooth sky is close to the
 * placeholder colour too, but it carries the edge's own texture, so it isn't mistaken for empty.
 */
function unpainted(image: RgbImage, strip: Strip, original: RgbImage): boolean {
  if (strip.rect.width * strip.rect.height < image.width * image.height * 0.01) return false;
  const painted = texture(image, strip.rect);
  const diff = painted.colour.reduce((sum, value, c) => sum + Math.abs(value - strip.fill[c]), 0) / 3;
  const edge = texture(original, edgeRegion(original, strip.side));
  return diff < 8 && painted.spread < Math.min(3, edge.spread * 0.3);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A box blur along a line of values, run twice (close to a Gaussian). */
function smoothLine(values: Float32Array, radius: number): Float32Array {
  let current = values;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(current.length);
    for (let i = 0; i < current.length; i++) {
      let sum = 0;
      let count = 0;
      for (let k = Math.max(0, i - radius); k <= Math.min(current.length - 1, i + radius); k++) {
        sum += current[k];
        count++;
      }
      next[i] = sum / count;
    }
    current = next;
  }
  return current;
}

/** 1 at the seam, easing to 0 at `distance` pixels away. */
function fade(distance: number, reach: number): number {
  return distance >= reach ? 0 : 0.5 * (1 + Math.cos((Math.PI * distance) / reach));
}

/**
 * Colour-matches Gemini's strips to the original. One overall shift (Gemini often warms or cools
 * the whole picture a little), then, along each seam, the remaining difference column by column
 * (row by row at the sides), measured just inside the original where both images show the same
 * thing, fading out away from the seam. The strips change; the original's area is pasted after.
 */
function matchColours(image: RgbImage, prepared: ExtendCanvas) {
  const { rect, original } = prepared;
  const { width } = image;

  // The overall shift, over the original's area.
  const shift = [0, 0, 0];
  let count = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((rect.width * rect.height) / 60_000)));
  for (let y = 0; y < rect.height; y += step) {
    for (let x = 0; x < rect.width; x += step) {
      const o = (y * original.width + x) * 3;
      const a = ((rect.top + y) * width + rect.left + x) * 3;
      for (let c = 0; c < 3; c++) shift[c] += original.data[o + c] - image.data[a + c];
      count++;
    }
  }
  for (let c = 0; c < 3; c++) shift[c] = Math.max(-24, Math.min(24, shift[c] / Math.max(1, count)));

  const depth = Math.max(1, Math.min(16, rect.height, rect.width));
  const add = (i: number, c: number, value: number) => {
    image.data[i + c] = Math.max(0, Math.min(255, Math.round(image.data[i + c] + value)));
  };

  for (const strip of prepared.strips) {
    const vertical = strip.side === 'top' || strip.side === 'bottom';
    // Along the seam: x for top/bottom strips, y for side strips.
    const length = vertical ? rect.width : rect.height;
    const residual = [0, 1, 2].map(() => new Float32Array(length));
    for (let t = 0; t < length; t++) {
      const values: number[][] = [[], [], []];
      for (let k = 0; k < depth; k++) {
        const ox = vertical ? t : strip.side === 'left' ? k : rect.width - 1 - k;
        const oy = vertical ? (strip.side === 'top' ? k : rect.height - 1 - k) : t;
        const o = (oy * original.width + ox) * 3;
        const a = ((rect.top + oy) * width + rect.left + ox) * 3;
        for (let c = 0; c < 3; c++) values[c].push(original.data[o + c] - (image.data[a + c] + shift[c]));
      }
      for (let c = 0; c < 3; c++) residual[c][t] = Math.max(-48, Math.min(48, median(values[c])));
    }
    const smooth = residual.map((line) => smoothLine(line, Math.max(4, Math.round(length / 64))));
    const reach = Math.max(12, Math.round((vertical ? image.height : image.width) * 0.06));

    for (let y = strip.rect.top; y < strip.rect.top + strip.rect.height; y++) {
      for (let x = strip.rect.left; x < strip.rect.left + strip.rect.width; x++) {
        const distance = strip.side === 'top'
          ? rect.top - y
          : strip.side === 'bottom'
            ? y - (rect.top + rect.height) + 1
            : strip.side === 'left'
              ? rect.left - x
              : x - (rect.left + rect.width) + 1;
        const t = vertical
          ? Math.min(length - 1, Math.max(0, x - rect.left))
          : Math.min(length - 1, Math.max(0, y - rect.top));
        const weight = fade(distance - 1, reach);
        const i = (y * width + x) * 3;
        for (let c = 0; c < 3; c++) add(i, c, shift[c] + smooth[c][t] * weight);
      }
    }
  }
}

/**
 * How much the picture jumps across the original's edges, in multiples of its usual change
 * between neighbouring rows (columns at the sides) right there: the worst edge. A seamless fill
 * stays around 1–2 (measured on every real Extend so far); a separate picture painted around
 * the original, or a scene continued around a card, jumps 4 to 100. Small steps don't count.
 */
function seamJump(image: RgbImage, rect: Rect, strips: Strip[]): number {
  let worst = 0;
  for (const strip of strips) {
    const vertical = strip.side === 'top' || strip.side === 'bottom';
    if ((vertical ? strip.rect.height : strip.rect.width) < 6) continue;
    const length = vertical ? rect.width : rect.height;
    // d: 0 = the strip's pixel at the seam, 1 = the original's first pixel, 2–3 inside it, -1 and -2 further out.
    const at = (t: number, d: number): number => {
      const [x, y] = strip.side === 'top'
        ? [rect.left + t, rect.top - 1 + d]
        : strip.side === 'bottom'
          ? [rect.left + t, rect.top + rect.height - d]
          : strip.side === 'left'
            ? [rect.left - 1 + d, rect.top + t]
            : [rect.left + rect.width - d, rect.top + t];
      return (y * image.width + x) * 3;
    };
    const diff = (a: number, b: number) =>
      (Math.abs(image.data[a] - image.data[b]) + Math.abs(image.data[a + 1] - image.data[b + 1]) + Math.abs(image.data[a + 2] - image.data[b + 2])) / 3;
    let seam = 0;
    let near = 0;
    for (let t = 0; t < length; t++) {
      seam += diff(at(t, 0), at(t, 1));
      near += (diff(at(t, 2), at(t, 3)) + diff(at(t, -2), at(t, -1))) / 2;
    }
    seam /= length;
    near /= length;
    if (seam < 4) continue;
    worst = Math.max(worst, seam / Math.max(0.5, near));
  }
  return worst;
}

/** Above this, the strips don't continue the original (see `seamJump`). */
export const JUMP_LIMIT = 3.5;

export interface ExtendResult {
  /** The finished picture: the original's area is the original, pixel for pixel. */
  image: RgbImage;
  alignment: Alignment;
  /** Gemini left a strip as the flat placeholder. */
  unpainted: boolean;
  /** How much the picture jumps across the original's edges (see `seamJump`). */
  jump: number;
}

/** Lines up Gemini's answer (already at the canvas size), colour-matches its strips and pastes the original back. */
export async function finishExtend(prepared: ExtendCanvas, answer: RgbImage): Promise<ExtendResult> {
  if (answer.width !== prepared.width || answer.height !== prepared.height) throw new Error('The answer must be at the canvas size.');
  const alignment = await alignAnswer(prepared, answer);
  const image = warp(answer, prepared.rect, alignment);
  const blank = prepared.strips.some((strip) => unpainted(image, strip, prepared.original));
  matchColours(image, prepared);
  paste(image, prepared.original, prepared.rect.left, prepared.rect.top);
  return { image, alignment, unpainted: blank, jump: seamJump(image, prepared.rect, prepared.strips) };
}

/** Lossless PNG, so the original's area stays exact. */
export function encodePng(image: RgbImage): Promise<Buffer> {
  return encode(image, 'png');
}
