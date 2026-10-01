/**
 * Image models the Playground offers, shared by the page and the server. Sizes, ratios,
 * pixel dimensions, reference guidance and prices follow Google's Gemini image docs and
 * price list (September 2026). Credits per image are ours: the one table to change.
 *
 * Kept free of `@/` imports so it can run anywhere (browser, server, plain node).
 */

export type PlaygroundModelId = 'gemini-3-pro-image' | 'gemini-3.1-flash-image' | 'gemini-3.1-flash-lite-image';
export type PlaygroundSize = '512' | '1K' | '2K' | '4K';
export type ReferenceRole = 'product' | 'person' | 'style';
export type ThinkingLevel = 'minimal' | 'high';

export interface PlaygroundSizeOption {
  id: PlaygroundSize;
  label: string;
  /** Google's price for one output image. */
  usd: number;
  credits: number;
}

export interface PlaygroundModelSpec {
  id: PlaygroundModelId;
  name: string;
  blurb: string;
  sizes: PlaygroundSizeOption[];
  ratios: string[];
  /** How many images of each kind the model keeps faithful; null = not supported. */
  referenceGuide: Record<ReferenceRole, number | null>;
  /** Google's price per input reference image (about 560 tokens each). */
  usdPerReference: number;
  /** The model lets you trade speed for more thinking. */
  thinking: boolean;
}

export const MAX_ENABLED_REFERENCES = 14;

const STANDARD_RATIOS = ['1:1', '4:5', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '5:4', '21:9'];
const EXTREME_RATIOS = ['1:4', '4:1', '1:8', '8:1'];

export const PLAYGROUND_MODELS: PlaygroundModelSpec[] = [
  {
    id: 'gemini-3-pro-image',
    name: 'Nano Banana Pro',
    blurb: 'Best quality, product detail and text in images',
    sizes: [
      { id: '1K', label: '1K', usd: 0.134, credits: 50 },
      { id: '2K', label: '2K', usd: 0.134, credits: 50 },
      { id: '4K', label: '4K', usd: 0.24, credits: 90 },
    ],
    ratios: STANDARD_RATIOS,
    referenceGuide: { product: 6, person: 5, style: 3 },
    usdPerReference: 0.0011,
    thinking: false,
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2',
    blurb: 'Fast and cheaper, extra-tall and extra-wide sizes',
    sizes: [
      { id: '512', label: '0.5K', usd: 0.045, credits: 20 },
      { id: '1K', label: '1K', usd: 0.067, credits: 25 },
      { id: '2K', label: '2K', usd: 0.101, credits: 35 },
      { id: '4K', label: '4K', usd: 0.151, credits: 50 },
    ],
    ratios: [...STANDARD_RATIOS, ...EXTREME_RATIOS],
    referenceGuide: { product: 10, person: 4, style: null },
    usdPerReference: 0.0003,
    thinking: true,
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Nano Banana 2 Lite',
    blurb: 'Cheapest drafts, 1K only',
    sizes: [{ id: '1K', label: '1K', usd: 0.0336, credits: 12 }],
    ratios: STANDARD_RATIOS,
    referenceGuide: { product: 14, person: null, style: null },
    usdPerReference: 0.00014,
    thinking: true,
  },
];

export const DEFAULT_PLAYGROUND_MODEL: PlaygroundModelId = 'gemini-3-pro-image';

export const ROLE_LABELS: Record<ReferenceRole, string> = {
  product: 'Product',
  person: 'Person',
  style: 'Style',
};

/** Output pixel sizes, [width, height], from Google's tables (Lite uses the 1K row). */
const DIMENSIONS: Record<string, Partial<Record<PlaygroundSize, [number, number]>>> = {
  '1:1': { '512': [512, 512], '1K': [1024, 1024], '2K': [2048, 2048], '4K': [4096, 4096] },
  '2:3': { '512': [424, 632], '1K': [848, 1264], '2K': [1696, 2528], '4K': [3392, 5056] },
  '3:2': { '512': [632, 424], '1K': [1264, 848], '2K': [2528, 1696], '4K': [5056, 3392] },
  '3:4': { '512': [448, 600], '1K': [896, 1200], '2K': [1792, 2400], '4K': [3584, 4800] },
  '4:3': { '512': [600, 448], '1K': [1200, 896], '2K': [2400, 1792], '4K': [4800, 3584] },
  '4:5': { '512': [464, 576], '1K': [928, 1152], '2K': [1856, 2304], '4K': [3712, 4608] },
  '5:4': { '512': [576, 464], '1K': [1152, 928], '2K': [2304, 1856], '4K': [4608, 3712] },
  '9:16': { '512': [384, 688], '1K': [768, 1376], '2K': [1536, 2752], '4K': [3072, 5504] },
  '16:9': { '512': [688, 384], '1K': [1376, 768], '2K': [2752, 1536], '4K': [5504, 3072] },
  '21:9': { '512': [792, 168], '1K': [1584, 672], '2K': [3168, 1344], '4K': [6336, 2688] },
  '1:4': { '512': [256, 1024], '1K': [512, 2048], '2K': [1024, 4096], '4K': [2048, 8192] },
  '4:1': { '512': [1024, 256], '1K': [2048, 512], '2K': [4096, 1024], '4K': [8192, 2048] },
  '1:8': { '512': [192, 1536], '1K': [384, 3072], '2K': [768, 6144], '4K': [1536, 12288] },
  '8:1': { '512': [1536, 192], '1K': [3072, 384], '2K': [6144, 768], '4K': [12288, 1536] },
};

export const RATIO_PRESETS: Array<{ label: string; ratio: string }> = [
  { label: 'Feed', ratio: '4:5' },
  { label: 'Reels', ratio: '9:16' },
  { label: 'Square', ratio: '1:1' },
];

export function playgroundModel(id: string | undefined | null): PlaygroundModelSpec {
  return PLAYGROUND_MODELS.find((model) => model.id === id) ?? PLAYGROUND_MODELS[0];
}

export function isPlaygroundModel(id: unknown): id is PlaygroundModelId {
  return PLAYGROUND_MODELS.some((model) => model.id === id);
}

export function sizeOption(model: PlaygroundModelSpec, size: string | undefined | null): PlaygroundSizeOption | undefined {
  return model.sizes.find((option) => option.id === size);
}

/** The size to use when a model doesn't offer the one asked for: the nearest it has. */
export function nearestSize(model: PlaygroundModelSpec, size: string | undefined | null): PlaygroundSize {
  if (sizeOption(model, size)) return size as PlaygroundSize;
  const order: PlaygroundSize[] = ['512', '1K', '2K', '4K'];
  const wanted = Math.max(0, order.indexOf((size ?? '2K') as PlaygroundSize));
  const ranked = [...model.sizes].sort(
    (a, b) => Math.abs(order.indexOf(a.id) - wanted) - Math.abs(order.indexOf(b.id) - wanted)
  );
  return ranked[0].id;
}

export function outputDimensions(size: PlaygroundSize, ratio: string): { width: number; height: number } | null {
  const found = DIMENSIONS[ratio]?.[size];
  return found ? { width: found[0], height: found[1] } : null;
}

/** "1536 × 2752" for a size and ratio, or '' when unknown. */
export function dimensionLabel(size: PlaygroundSize, ratio: string): string {
  const found = outputDimensions(size, ratio);
  return found ? `${found.width} × ${found.height}` : '';
}

/** The value Gemini expects in imageConfig.imageSize. */
export function apiImageSize(size: PlaygroundSize): string {
  return size === '512' ? '512' : size;
}

export interface RunCost {
  images: number;
  creditsPerImage: number;
  credits: number;
  /** Google's price for the whole run, including the reference images sent each time. */
  usd: number;
}

export function runCost(options: {
  model: string;
  size: string;
  promptCount: number;
  ratioCount: number;
  variations: number;
  referenceCount?: number;
}): RunCost {
  const model = playgroundModel(options.model);
  const size = sizeOption(model, options.size) ?? model.sizes[0];
  const images = Math.max(0, options.promptCount) * Math.max(0, options.ratioCount) * Math.max(1, options.variations);
  const usdPerImage = size.usd + (options.referenceCount ?? 0) * model.usdPerReference;
  return {
    images,
    creditsPerImage: size.credits,
    credits: images * size.credits,
    usd: Number((images * usdPerImage).toFixed(4)),
  };
}

/** Warnings for the chosen model about the switched-on references (never blocks, except the total). */
export function referenceWarnings(modelId: string, counts: Record<ReferenceRole, number>): string[] {
  const model = playgroundModel(modelId);
  const warnings: string[] = [];
  const total = counts.product + counts.person + counts.style;
  if (total > MAX_ENABLED_REFERENCES) {
    warnings.push(`Gemini takes at most ${MAX_ENABLED_REFERENCES} reference images. Switch some off.`);
  }
  (Object.keys(counts) as ReferenceRole[]).forEach((role) => {
    const guide = model.referenceGuide[role];
    if (counts[role] === 0) return;
    if (guide === null) {
      warnings.push(`${model.name} doesn't use ${ROLE_LABELS[role].toLowerCase()} references reliably; Nano Banana Pro does.`);
    } else if (counts[role] > guide) {
      warnings.push(`${model.name} keeps up to ${guide} ${ROLE_LABELS[role].toLowerCase()} images sharp; extra ones may lose detail.`);
    }
  });
  return warnings;
}

/** A rough time estimate for a run, 3 images at a time. */
export function runMinutes(modelId: string, size: string, images: number): number {
  const secondsPerImage = modelId === 'gemini-3-pro-image'
    ? (size === '4K' ? 60 : 35)
    : modelId === 'gemini-3.1-flash-image'
      ? (size === '4K' ? 35 : 18)
      : 10;
  return Math.max(1, Math.round((images * secondsPerImage) / 3 / 60));
}

const RATIOS: Array<[string, number]> = [
  ['1:1', 1], ['4:5', 0.8], ['5:4', 1.25], ['3:4', 0.75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5],
  ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9], ['1:4', 0.25], ['4:1', 4], ['1:8', 0.125], ['8:1', 8],
];

/** The Gemini ratio closest to the image's shape. */
export function closestRatio(width: number, height: number, allowed: string[]): string {
  const shape = width / height;
  return RATIOS
    .filter(([ratio]) => allowed.includes(ratio))
    .sort((a, b) => Math.abs(Math.log(a[1] / shape)) - Math.abs(Math.log(b[1] / shape)))[0]?.[0] ?? '1:1';
}

/** The output size class that covers the image's long edge. */
export function sizeForImage(width: number, height: number, sizes: PlaygroundSize[]): PlaygroundSize {
  const edge = Math.max(width, height);
  const wanted: PlaygroundSize = edge <= 700 ? '512' : edge <= 1400 ? '1K' : edge <= 2800 ? '2K' : '4K';
  const order: PlaygroundSize[] = ['512', '1K', '2K', '4K'];
  return [...sizes].sort((a, b) => Math.abs(order.indexOf(a) - order.indexOf(wanted)) - Math.abs(order.indexOf(b) - order.indexOf(wanted)))[0];
}

/** The Claude prompt writer's price: a small base plus a little per prompt (about Claude's cost). */
export const PROMPT_WRITER_CREDITS = { base: 5, perPrompt: 2 };
export const MAX_WRITTEN_PROMPTS = 100;

export function promptWriterCredits(count: number): number {
  return PROMPT_WRITER_CREDITS.base + PROMPT_WRITER_CREDITS.perPrompt * Math.max(1, Math.round(count));
}
