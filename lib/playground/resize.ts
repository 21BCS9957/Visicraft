/**
 * "Make another size": finished Playground images turned into another shape, the whole run or
 * one image at a time. Extend paints new space around the untouched original, Remake makes
 * the ad again at the new shape with the original as its layout, Fit puts the original on a
 * blurred copy of itself or a colour (no AI, free). Shared by the page and the server.
 *
 * Kept free of `@/` imports so it can run anywhere (browser, server, plain node).
 */

import {
  enabledSizes,
  nearestSize,
  outputDimensions,
  playgroundModel,
  runCost,
  runMinutes,
  sizeForImage,
  sizeOption,
  sizePrice,
  type ImageQuality,
  type PlaygroundModelId,
  type PlaygroundSize,
} from './models';

export type ResizeMethod = 'extend' | 'remake' | 'fit';

/** How a run's images were made from other images; ordinary runs have none. */
export interface RunResize {
  method: ResizeMethod;
  /** The run the originals belong to; null when the original is a Canvas edit. */
  fromRunId: string | null;
  /** Fit: 'blur' or a colour as '#rrggbb'. */
  background?: string;
  /** Extend and Fit at 9:16: the original shrunk into the part of the screen Reels leaves visible. */
  safe?: boolean;
}

export const RESIZE_METHODS: Record<ResizeMethod, { label: string; blurb: string }> = {
  extend: {
    label: 'Extend',
    blurb: 'AI paints new space around your image. The image itself stays exactly as it is. Best for photos.',
  },
  remake: {
    label: 'Remake',
    blurb: 'AI makes each ad again in the new shape from the same prompt and references, with the original as its layout. Best for ads with text.',
  },
  fit: {
    label: 'Fit',
    blurb: 'Your image as it is, on a blurred copy of itself or a colour. Free, ready in seconds. Good for drafts.',
  },
};

/** The models Extend can use (Gemini: the masked fill is built for it). */
export const EXTEND_MODELS: PlaygroundModelId[] = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];
export const DEFAULT_EXTEND_MODEL: PlaygroundModelId = 'gemini-3-pro-image';

/** Shapes a copy can take, the ad formats first. */
export const RESIZE_RATIOS = ['9:16', '4:5', '1:1', '16:9', '3:4', '2:3', '4:3', '3:2', '5:4'];
export const RATIO_NAMES: Record<string, string> = { '9:16': 'Reels & Stories', '4:5': 'Feed', '1:1': 'Square', '16:9': 'Landscape' };

/** Where Instagram and Facebook Reels cover a 9:16 screen with their own interface. */
export const REELS_SAFE_ZONE = { top: 0.14, bottom: 0.35 };

/** Fit backgrounds besides a blurred copy. */
export const FIT_COLOURS = [
  { id: '#000000', label: 'Black' },
  { id: '#ffffff', label: 'White' },
];

export function isFitBackground(value: unknown): value is string {
  return value === 'blur' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
}

/** Above this share of new picture, Extend is mostly invention: Remake usually does better. */
export const EXTEND_MOSTLY_NEW = 0.5;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Meta's recommended size for Reels, Stories and Feed: a copy's short edge is at least this (1080 × 1920). */
export const MIN_COPY_EDGE = 1080;

/** The size class a copy is priced at: the original's own class, never larger (4K is off). */
export function copySize(width: number | null | undefined, height: number | null | undefined, fallback: PlaygroundSize = '2K'): PlaygroundSize {
  if (!width || !height) return fallback === '4K' ? '2K' : fallback;
  return sizeForImage(width, height, ['512', '1K', '2K']);
}

/** A copy's pixels at a size class: the standard size, enlarged when needed so the short edge is at least 1080. */
export function copyDimensions(size: PlaygroundSize, ratio: string): { width: number; height: number } | null {
  const standard = outputDimensions(size, ratio);
  if (!standard) return null;
  const short = Math.min(standard.width, standard.height);
  if (short >= MIN_COPY_EDGE) return standard;
  const scale = MIN_COPY_EDGE / short;
  return { width: Math.round(standard.width * scale), height: Math.round(standard.height * scale) };
}

/** The copy's size class and pixel size for an original. */
export function copyCanvas(width: number | null | undefined, height: number | null | undefined, ratio: string, fallback?: PlaygroundSize): { size: PlaygroundSize; width: number; height: number } | null {
  const size = copySize(width, height, fallback);
  const found = copyDimensions(size, ratio);
  return found ? { size, ...found } : null;
}

/** "Keep clear of Reels buttons" applies to Extend and Fit at 9:16. */
export function safeApplies(method: ResizeMethod, ratio: string): boolean {
  return method !== 'remake' && ratio === '9:16';
}

/**
 * Where the original sits on the copy: as large as fits. Extend leaves 14% above it on a 9:16,
 * so it starts just below the Reels top bar; otherwise it is centred. With `safe` (9:16), it
 * shrinks to fit between the Reels top bar and the caption area, so nothing of it is covered.
 */
export function placeOriginal(sourceWidth: number, sourceHeight: number, canvasWidth: number, canvasHeight: number, method: ResizeMethod, ratio: string, safe = false): Rect {
  if (safe && safeApplies(method, ratio)) {
    const boxTop = Math.round(REELS_SAFE_ZONE.top * canvasHeight);
    const boxHeight = Math.round((1 - REELS_SAFE_ZONE.top - REELS_SAFE_ZONE.bottom) * canvasHeight);
    const scale = Math.min(canvasWidth / sourceWidth, boxHeight / sourceHeight);
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    return { left: Math.round((canvasWidth - width) / 2), top: boxTop + Math.round((boxHeight - height) / 2), width, height };
  }
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  let width = Math.round(sourceWidth * scale);
  let height = Math.round(sourceHeight * scale);
  // A strip of a pixel or two is rounding, not space to fill.
  if (canvasWidth - width <= 2) width = canvasWidth;
  if (canvasHeight - height <= 2) height = canvasHeight;
  const freeHeight = canvasHeight - height;
  const top = method === 'extend' && ratio === '9:16'
    ? Math.min(freeHeight, Math.round(REELS_SAFE_ZONE.top * canvasHeight))
    : Math.round(freeHeight / 2);
  return { left: Math.round((canvasWidth - width) / 2), top, width, height };
}

/** Where an ad's readable text (headline, offer, price, logo, buttons) sits, as shares (0–1) of its height. */
export interface TextBand {
  top: number;
  bottom: number;
}

/**
 * "Keep clear of Reels buttons" (9:16), done by moving rather than shrinking: the original
 * keeps its normal size and slides up or down until its text sits between the Reels top bar
 * and the caption area. Only when the text is taller than that band does it shrink, just
 * enough (`shrunk`; Extend then paints the sides first, then the top and bottom). With no
 * text it sits where it always does.
 */
export function clearPlacement(sourceWidth: number, sourceHeight: number, canvasWidth: number, canvasHeight: number, text: TextBand | null, method: ResizeMethod): { rect: Rect; shrunk: boolean } {
  const normal = placeOriginal(sourceWidth, sourceHeight, canvasWidth, canvasHeight, method, '9:16');
  if (!text) return { rect: normal, shrunk: false };
  // A little air around the text: the boxes are tight.
  const textTop = Math.max(0, text.top - 0.012);
  const textBottom = Math.min(1, text.bottom + 0.012);
  const bandTop = Math.round(REELS_SAFE_ZONE.top * canvasHeight);
  const bandBottom = Math.round((1 - REELS_SAFE_ZONE.bottom) * canvasHeight);
  const lowest = Math.max(0, bandTop - textTop * normal.height);
  const highest = Math.min(canvasHeight - normal.height, bandBottom - textBottom * normal.height);
  if (lowest <= highest) {
    return { rect: { ...normal, top: Math.round(Math.min(highest, Math.max(lowest, normal.top))) }, shrunk: false };
  }
  const scale = Math.min(1, (bandBottom - bandTop) / Math.max(1, (textBottom - textTop) * normal.height));
  const width = Math.round(normal.width * scale);
  const height = Math.round(normal.height * scale);
  const top = Math.max(0, Math.min(canvasHeight - height, Math.round(bandTop - textTop * height)));
  return { rect: { left: Math.round((canvasWidth - width) / 2), top, width, height }, shrunk: true };
}

/** Gemini's own shape for a ratio (its "9:16" is 1536 × 2752, not exactly 9:16). */
export function geminiAspect(ratio: string): number {
  const size = outputDimensions('2K', ratio);
  return size ? size.width / size.height : 1;
}

/** The narrowest of the model's shapes that is at least `minAspect` wide (width / height). */
export function shapeAtLeast(modelId: string, minAspect: number): string {
  const shapes = playgroundModel(modelId).ratios
    .filter((ratio) => !/^(1:4|4:1|1:8|8:1)$/.test(ratio))
    .map((ratio) => ({ ratio, aspect: geminiAspect(ratio) }))
    .sort((a, b) => a.aspect - b.aspect);
  return (shapes.find((shape) => shape.aspect >= minAspect) ?? shapes[shapes.length - 1]).ratio;
}

/** How much of the copy is new picture (0–1) when the original is placed on it. */
export function newShare(sourceWidth: number, sourceHeight: number, ratio: string, safe = false): number {
  const canvas = outputDimensions('2K', ratio);
  if (!canvas || !sourceWidth || !sourceHeight) return 0;
  const rect = placeOriginal(sourceWidth, sourceHeight, canvas.width, canvas.height, 'extend', ratio, safe);
  return Math.max(0, 1 - (rect.width * rect.height) / (canvas.width * canvas.height));
}

/** The largest size that costs the same as `size` (Nano Banana Pro: 2K for the price of 1K). */
export function sameCostSize(modelId: string, size: PlaygroundSize): PlaygroundSize {
  const model = playgroundModel(modelId);
  const base = nearestSize(model, size);
  const credits = sizeOption(model, base)?.credits;
  const order: PlaygroundSize[] = ['512', '1K', '2K', '4K'];
  return enabledSizes(model)
    .filter((option) => option.credits === credits && order.indexOf(option.id) >= order.indexOf(base))
    .map((option) => option.id)
    .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ?? base;
}

/** The size Extend asks Gemini for: the largest at the copy's price (Pro: 2K). */
export const extendRequestSize = sameCostSize;

/** The size Remake makes the ad at: the source run's, or larger when it costs the same (Pro: 2K). */
export function remakeSize(modelId: string, sourceSize: PlaygroundSize): PlaygroundSize {
  return sameCostSize(modelId, nearestSize(playgroundModel(modelId), sourceSize));
}

/** Words that ask for something written on the image. */
const TEXT_AD_WORDS = /\b(headlines?|sub-?headlines?|text|cta|call to action|logos?|wordmark|tagline|captions?|price|offer|discount|typography|fonts?|words|badges?|banners?)\b/i;
/** "No text or logos.", "without captions", "ignore any labels or headline text…": up to the end of the sentence. */
const NEGATED = /\b(no|without|never|avoid|ignore|ignoring|zero|nothing)\b[^.;:!?\n]*/gi;

/** A prompt for a designed ad (headline, logo, offer…), not a plain photo: its copy should keep clear of Reels' buttons. */
export function asksForText(prompt: string): boolean {
  return TEXT_AD_WORDS.test(prompt.replace(NEGATED, ' '));
}

/** Most of these prompts are designed ads with text. */
export function looksLikeTextAds(prompts: string[]): boolean {
  if (!prompts.length) return false;
  return prompts.filter(asksForText).length * 2 >= prompts.length;
}

/** A rough time for the copies: Fit is a quick composite (6 at a time); the others take an AI image each, 3 at a time. */
export function copyMinutes(method: ResizeMethod, modelId: string, size: PlaygroundSize, count: number, quality?: ImageQuality | null): number {
  if (method === 'fit') return Math.ceil((count * 3) / 6 / 60);
  return runMinutes(modelId, size, count, quality);
}

export interface ResizePriceOptions {
  method: ResizeMethod;
  /** Extend: the Gemini model it uses; Remake: the source run's model. */
  model: string;
  /** The copy's size (Extend, Fit) or the source run's size (Remake). */
  size: PlaygroundSize;
  /** Remake: the source run's quality and number of references. */
  quality?: ImageQuality | null;
  referenceCount?: number;
}

/**
 * One copy's price, the same on the page and on the server (the run keeps it, and each copy
 * is charged it when it starts). Extend costs one image of its model; Remake costs one image
 * of the source run, with the original as one more reference; Fit is free.
 */
export function resizePrice(options: ResizePriceOptions): { credits: number; usd: number } {
  if (options.method === 'fit') return { credits: 0, usd: 0 };
  const model = playgroundModel(options.model);
  if (options.method === 'extend') {
    const option = sizeOption(model, extendRequestSize(model.id, options.size)) ?? enabledSizes(model)[0];
    const price = sizePrice(option, null);
    return { credits: price.credits, usd: price.usd };
  }
  const cost = runCost({
    model: model.id,
    size: remakeSize(model.id, options.size),
    promptCount: 1,
    ratioCount: 1,
    variations: 1,
    referenceCount: (options.referenceCount ?? 0) + 1,
    quality: options.quality,
  });
  return { credits: cost.creditsPerImage, usd: cost.usd };
}

/** Tells copies apart: an original gets one copy per shape, method, model or background, and placement. */
export function copyKey(ratio: string, run: { model: string; resize?: RunResize | null }): string {
  const resize = run.resize;
  if (!resize) return '';
  const detail = resize.method === 'extend' ? run.model : resize.method === 'fit' ? (resize.background ?? 'blur').toLowerCase() : '';
  return `${ratio}|${resize.method}|${detail}${resize.safe && safeApplies(resize.method, ratio) ? '|safe' : ''}`;
}

/** "Extend", "Fit on blur", "Extend · clear of Reels". */
export function copyMethodLabel(resize: RunResize): string {
  const base = resize.method === 'fit'
    ? `Fit on ${resize.background && resize.background !== 'blur' ? resize.background : 'blur'}`
    : RESIZE_METHODS[resize.method].label;
  return resize.safe ? `${base} · clear of Reels` : base;
}

/** Remake's layout: the original image, sent after the references with its own label. */
export interface LayoutReference {
  url: string;
  /** "Image 3 (Layout: this same ad at 4:5):" */
  label: string;
}

/** "Image 3 (Layout: this same ad at 4:5):" */
export function layoutLabel(imageNumber: number, fromRatio: string): string {
  return `Image ${imageNumber} (Layout: this same ad at ${fromRatio}):`;
}

/** What Remake adds to the prompt; the original goes with it as image `imageNumber` (the last one). */
export function remakeInstruction(options: { imageNumber: number; fromRatio: string; toRatio: string }): string {
  const { imageNumber, fromRatio, toRatio } = options;
  const keep = 'Keep everything that makes it this ad: the product exactly as shown, the people, colours, light, style, every piece of text word for word, the typography and the logo.';
  const relayout = 'Lay it out again for the new shape rather than stretching, squashing, cropping or padding it: no blurred, repeated or empty strips.';
  if (toRatio === '9:16') {
    const top = Math.round(REELS_SAFE_ZONE.top * 100);
    const bottom = Math.round(REELS_SAFE_ZONE.bottom * 100);
    return [
      `Image ${imageNumber} is this same ad, already made at ${fromRatio}. Make it again at 9:16 for Instagram and Facebook Reels and Stories.`,
      keep,
      relayout,
      `The apps cover the top ${top}% and the bottom ${bottom}% of the screen with their own buttons and captions, so put every piece of text, the logo, prices and badges inside the band from ${top + 1}% to ${100 - bottom - 1}% of the image height, counted from the top. Use the top ${top}% and the bottom ${bottom}% only for background or scene: the product and people may reach into them, text and logos may not.`,
    ].join(' ');
  }
  return [
    `Image ${imageNumber} is this same ad, already made at ${fromRatio}. Make it again at ${toRatio}.`,
    keep,
    relayout,
    'Keep every text and logo fully inside the frame with a comfortable margin.',
  ].join(' ');
}

/**
 * What Extend tells Gemini. Told that a "photograph is placed on a larger canvas", Gemini paints
 * a backdrop around a card, especially for ads with text; told that the picture was cropped and
 * the strips are the parts cut away, it continues the scene across the edges.
 */
export function extendPrompt(sides: 'vertical' | 'horizontal' | 'around'): string {
  const where = sides === 'vertical' ? 'at the top and bottom' : sides === 'horizontal' ? 'at the left and right' : 'around the picture';
  return `
This picture was cropped. The solid-colour strips ${where} mark the parts that were cut away. Restore them: paint the missing parts of the same scene so the picture looks as if it had never been cropped, with the same place, light, colours, perspective, grain and depth of field, as sharp as the rest.

Everything that reaches an edge carries on across it the way it naturally would: a person's body and clothes, furniture and objects, the floor or ground, the sky, walls, patterns and shadows. Lines and horizons continue at the same height and angle.

It is one continuous picture, not a card, poster, panel or photo placed on a background: there is no border, box, frame, edge, shadow or change of light around the part that was already there. Keep that part exactly as it is, at the same size and position: do not move, zoom, crop, redraw or restyle it, and do not repeat its people, products, text or logos in the new parts. Add no new text, logos or watermarks, and leave none of the solid placeholder colour.
`.trim();
}

export interface OrderedRun<T> {
  run: T;
  /** The run this one's images were made from, when it sits under it. */
  source: T | null;
}

/** Runs in gallery order: newest first, each followed by the runs made from it (newest first). */
export function orderRuns<T extends { id: string; createdAt: string; resize?: RunResize | null }>(runs: T[]): Array<OrderedRun<T>> {
  const known = new Set(runs.map((run) => run.id));
  const copies = new Map<string, T[]>();
  const roots: T[] = [];
  for (const run of runs) {
    const from = run.resize?.fromRunId;
    if (from && from !== run.id && known.has(from)) copies.set(from, [...(copies.get(from) ?? []), run]);
    else roots.push(run);
  }
  const newestFirst = (a: T, b: T) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const ordered: Array<OrderedRun<T>> = [];
  const placed = new Set<string>();
  const place = (run: T, source: T | null) => {
    if (placed.has(run.id)) return;
    placed.add(run.id);
    ordered.push({ run, source });
    [...(copies.get(run.id) ?? [])].sort(newestFirst).forEach((copy) => place(copy, run));
  };
  [...roots].sort(newestFirst).forEach((run) => place(run, null));
  // Copies of copies that point at each other in a loop still show.
  runs.forEach((run) => place(run, null));
  return ordered;
}
