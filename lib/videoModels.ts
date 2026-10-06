/**
 * Video models the app renders with, shared by the model menu and the server. Seedance
 * (ByteDance, on BytePlus ModelArk) is listed model by model because the models differ in
 * what they take: the 2.x series refuses an input frame with a real person's face, only
 * 1.x locks the camera, and only 2.x renders sound. Figures are from the ModelArk model
 * list and pricing pages (September 2026).
 */

export type VideoEngine = 'veo' | 'seedance';

export interface SeedanceModelSpec {
  id: string;
  name: string;
  /** Parameter family, which also sets the output pixel sizes. */
  family: '1.0' | '2.0' | '2.5';
  /** Output resolutions, lowest first. */
  resolutions: string[];
  minSeconds: number;
  maxSeconds: number;
  /** First + last frame mode (a pinned last frame). */
  lastFrame: boolean;
  /** Renders sound with the clip (voice, effects, music). */
  audio: boolean;
  /** Takes `camera_fixed` (and `seed`). */
  cameraFixed: boolean;
  /** Takes an input frame with a real person's face (the 2.x series refuses one). */
  realFaces: boolean;
  /** List price in USD per million video tokens by output resolution, for image input. */
  usdPerMillionTokens: Record<string, number>;
}

export const SEEDANCE_MODELS: SeedanceModelSpec[] = [
  {
    id: 'dreamina-seedance-2-5-260628',
    name: 'Seedance 2.5',
    family: '2.5',
    resolutions: ['480p', '720p', '1080p'],
    minSeconds: 4,
    maxSeconds: 30,
    lastFrame: true,
    audio: true,
    cameraFixed: false,
    realFaces: false,
    usdPerMillionTokens: { '480p': 10.7, '720p': 10.7, '1080p': 11.7 },
  },
  {
    id: 'dreamina-seedance-2-0-260128',
    name: 'Seedance 2.0',
    family: '2.0',
    resolutions: ['480p', '720p', '1080p', '4k'],
    minSeconds: 4,
    maxSeconds: 15,
    lastFrame: true,
    audio: true,
    cameraFixed: false,
    realFaces: false,
    usdPerMillionTokens: { '480p': 7, '720p': 7, '1080p': 7.7, '4k': 4 },
  },
  {
    id: 'dreamina-seedance-2-0-fast-260128',
    name: 'Seedance 2.0 Fast',
    family: '2.0',
    resolutions: ['480p', '720p'],
    minSeconds: 4,
    maxSeconds: 15,
    lastFrame: true,
    audio: true,
    cameraFixed: false,
    realFaces: false,
    usdPerMillionTokens: { '480p': 5.6, '720p': 5.6 },
  },
  {
    id: 'dreamina-seedance-2-0-mini-260615',
    name: 'Seedance 2.0 Mini',
    family: '2.0',
    resolutions: ['480p', '720p'],
    minSeconds: 4,
    maxSeconds: 15,
    lastFrame: true,
    audio: true,
    cameraFixed: false,
    realFaces: false,
    usdPerMillionTokens: { '480p': 3.5, '720p': 3.5 },
  },
  {
    id: 'seedance-1-0-pro-250528',
    name: 'Seedance 1.0 Pro',
    family: '1.0',
    resolutions: ['480p', '720p', '1080p'],
    minSeconds: 2,
    maxSeconds: 12,
    lastFrame: true,
    audio: false,
    cameraFixed: true,
    realFaces: true,
    usdPerMillionTokens: { '480p': 2.5, '720p': 2.5, '1080p': 2.5 },
  },
  {
    id: 'seedance-1-0-pro-fast-251015',
    name: 'Seedance 1.0 Pro Fast',
    family: '1.0',
    resolutions: ['480p', '720p', '1080p'],
    minSeconds: 2,
    maxSeconds: 12,
    lastFrame: false,
    audio: false,
    cameraFixed: true,
    realFaces: true,
    usdPerMillionTokens: { '480p': 1, '720p': 1, '1080p': 1 },
  },
];

/** The engine a model id belongs to, when it names one. */
export function videoEngineOf(model?: string): VideoEngine | undefined {
  if (!model) return undefined;
  if (/seedance/i.test(model)) return 'seedance';
  if (/veo/i.test(model)) return 'veo';
  return undefined;
}

/**
 * A listed Seedance model, or what an unlisted id (a newer version, or an endpoint id)
 * most likely supports, judged by the family its name points to.
 */
export function seedanceSpec(id: string): SeedanceModelSpec {
  const known = SEEDANCE_MODELS.find((model) => model.id === id);
  if (known) return known;
  const like = /seedance-1-0-pro-fast/.test(id)
    ? 'seedance-1-0-pro-fast-251015'
    : /seedance-1/.test(id)
      ? 'seedance-1-0-pro-250528'
      : /seedance-2-5/.test(id)
        ? 'dreamina-seedance-2-5-260628'
        : /fast/.test(id)
          ? 'dreamina-seedance-2-0-fast-260128'
          : /mini/.test(id)
            ? 'dreamina-seedance-2-0-mini-260615'
            : 'dreamina-seedance-2-0-260128';
  const base = SEEDANCE_MODELS.find((model) => model.id === like) as SeedanceModelSpec;
  return { ...base, id, name: id };
}

/**
 * Output size (width x height) of the landscape ratios by family and resolution, from the
 * ModelArk API reference (September 2026); the portrait ones are the same, turned (9:16 is
 * 16:9 turned, 3:4 is 4:3).
 */
const LANDSCAPE_SIZES: Record<SeedanceModelSpec['family'], Record<string, Record<'16:9' | '4:3' | '1:1' | '21:9', [number, number]>>> = {
  '1.0': {
    '480p': { '16:9': [864, 480], '4:3': [736, 544], '1:1': [640, 640], '21:9': [960, 416] },
    '720p': { '16:9': [1248, 704], '4:3': [1120, 832], '1:1': [960, 960], '21:9': [1504, 640] },
    '1080p': { '16:9': [1920, 1088], '4:3': [1664, 1248], '1:1': [1440, 1440], '21:9': [2176, 928] },
  },
  '2.0': {
    '480p': { '16:9': [864, 496], '4:3': [752, 560], '1:1': [640, 640], '21:9': [992, 432] },
    '720p': { '16:9': [1280, 720], '4:3': [1112, 834], '1:1': [960, 960], '21:9': [1470, 630] },
    '1080p': { '16:9': [1920, 1080], '4:3': [1664, 1248], '1:1': [1440, 1440], '21:9': [2206, 946] },
    '4k': { '16:9': [3840, 2160], '4:3': [3326, 2494], '1:1': [2880, 2880], '21:9': [4398, 1886] },
  },
  '2.5': {
    '480p': { '16:9': [854, 480], '4:3': [752, 560], '1:1': [640, 640], '21:9': [992, 432] },
    '720p': { '16:9': [1280, 720], '4:3': [1112, 834], '1:1': [960, 960], '21:9': [1470, 630] },
    '1080p': { '16:9': [1920, 1080], '4:3': [1664, 1248], '1:1': [1440, 1440], '21:9': [2206, 946] },
  },
};
const TURNED: Record<string, '16:9' | '4:3'> = { '9:16': '16:9', '3:4': '4:3' };

export function seedanceFrameSize(spec: SeedanceModelSpec, resolution: string, aspectRatio: string): { width: number; height: number } | null {
  const sizes = LANDSCAPE_SIZES[spec.family][resolution];
  if (!sizes) return null;
  const turned = TURNED[aspectRatio];
  const size = turned ? sizes[turned] : sizes[aspectRatio as keyof typeof sizes];
  if (!size) return null;
  return turned ? { width: size[1], height: size[0] } : { width: size[0], height: size[1] };
}

/** List price per second: tokens = width x height x 24 fps / 1024 per second of output. */
export function seedanceUsdPerSecond(id: string, resolution: string, aspectRatio = '9:16'): number {
  const spec = seedanceSpec(id);
  const size = seedanceFrameSize(spec, resolution, aspectRatio) ?? seedanceFrameSize(spec, resolution, '9:16');
  const price = spec.usdPerMillionTokens[resolution] ?? Object.values(spec.usdPerMillionTokens).at(-1) ?? 0;
  if (!size) return 0;
  return ((size.width * size.height * 24) / 1024 / 1_000_000) * price;
}

/**
 * The shapes a video can be made in. Seedance renders all of them (plus 4:3 and 21:9); Veo
 * only 9:16 and 16:9; neither renders 4:5, so 3:4 is the feed's portrait shape.
 */
export type VideoAspect = '9:16' | '16:9' | '1:1' | '3:4';
export const DEFAULT_VIDEO_ASPECT: VideoAspect = '9:16';

export const VIDEO_ASPECTS: Array<{
  id: VideoAspect;
  label: string;
  /** Where it runs, for the picker. */
  use: string;
  /** The word the prompts use ("10-second horizontal …"). */
  orientation: 'vertical' | 'horizontal' | 'square' | 'portrait';
  /** Where the ad runs, for the prompt writer. */
  placement: string;
}> = [
  { id: '9:16', label: 'Reels', use: 'Reels, Stories, Shorts', orientation: 'vertical', placement: 'Meta Reels and Stories' },
  { id: '16:9', label: 'Landscape', use: 'YouTube, websites', orientation: 'horizontal', placement: 'YouTube, websites and in-stream video' },
  { id: '1:1', label: 'Square', use: 'Feed', orientation: 'square', placement: 'the Facebook and Instagram feed' },
  { id: '3:4', label: 'Portrait', use: 'Feed (nearest to 4:5)', orientation: 'portrait', placement: 'the Facebook and Instagram feed' },
];

export function isVideoAspect(value: unknown): value is VideoAspect {
  return typeof value === 'string' && VIDEO_ASPECTS.some((aspect) => aspect.id === value);
}

/** A shape's details; anything unknown is 9:16. */
export function videoAspectInfo(ratio?: string): (typeof VIDEO_ASPECTS)[number] {
  return VIDEO_ASPECTS.find((aspect) => aspect.id === ratio) ?? VIDEO_ASPECTS[0];
}

/** "16 / 9", for a CSS aspect-ratio. */
export function cssAspect(ratio?: string): string {
  return videoAspectInfo(ratio).id.replace(':', ' / ');
}

/** True for shapes wider than tall or square, which play full width. */
export function isWideAspect(ratio?: string): boolean {
  const id = videoAspectInfo(ratio).id;
  return id === '16:9' || id === '1:1';
}

/** A clip's quality: a cheap draft to test with, or a final resolution. */
export type VideoQuality = 'draft' | '720p' | '1080p' | '4k';
export type FinalQuality = Exclude<VideoQuality, 'draft'>;

const FINAL_ORDER: FinalQuality[] = ['720p', '1080p', '4k'];
export const DEFAULT_VIDEO_QUALITY: VideoQuality = '1080p';

export interface VideoModelOptions {
  engine: VideoEngine;
  /** Clip lengths offered, in seconds. */
  durations: number[];
  defaultDuration: number;
  /** Final qualities the model renders. */
  qualities: FinalQuality[];
  /** Shapes the model renders. */
  aspectRatios: VideoAspect[];
  /**
   * How a draft is made: its resolution, and whether the final reuses the draft's own take
   * (Seedance 2.5 draft mode) or re-renders the same frame and prompt.
   */
  draft: { resolution: string; native: boolean };
}

const SEEDANCE_DURATIONS = [4, 5, 8, 10, 12, 15, 20, 30];

export function videoModelOptions(model: string): VideoModelOptions {
  if (videoEngineOf(model) !== 'seedance') {
    // Veo 3.1 renders 4, 6 or 8 seconds; its drafts use the Fast tier at 720p. Standard Veo
    // charges the same for 720p as for 1080p, so 720p is not offered as a final quality.
    return { engine: 'veo', durations: [4, 6, 8], defaultDuration: 8, qualities: ['1080p', '4k'], aspectRatios: ['9:16', '16:9'], draft: { resolution: '720p', native: false } };
  }
  const spec = seedanceSpec(model);
  return {
    engine: 'seedance',
    durations: SEEDANCE_DURATIONS.filter((s) => s >= spec.minSeconds && s <= spec.maxSeconds),
    defaultDuration: 8,
    qualities: spec.resolutions.filter((r): r is FinalQuality => (FINAL_ORDER as string[]).includes(r)),
    aspectRatios: VIDEO_ASPECTS.map((aspect) => aspect.id),
    draft: { resolution: '480p', native: spec.family === '2.5' },
  };
}

/** A shape the model renders: the one asked for, else 9:16. */
export function snapVideoAspect(model: string, ratio?: string): VideoAspect {
  const { aspectRatios } = videoModelOptions(model);
  return isVideoAspect(ratio) && aspectRatios.includes(ratio) ? ratio : DEFAULT_VIDEO_ASPECT;
}

/** A length the model renders, nearest to the one asked for. */
export function snapVideoDuration(model: string, seconds?: number): number {
  const { durations, defaultDuration } = videoModelOptions(model);
  if (!seconds || !Number.isFinite(seconds)) return defaultDuration;
  return durations.reduce((best, d) => (Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best), durations[0]);
}

/** A quality the model renders: the one asked for, else the nearest below it. Any model can draft. */
export function normalizeVideoQuality(model: string, quality?: string): VideoQuality {
  if (quality === 'draft') return 'draft';
  const { qualities } = videoModelOptions(model);
  const wanted = FINAL_ORDER.indexOf(quality as FinalQuality);
  if (wanted < 0) return qualities.includes('1080p') ? '1080p' : qualities.at(-1) ?? '720p';
  return qualities.filter((q) => FINAL_ORDER.indexOf(q) <= wanted).at(-1) ?? qualities[0];
}

/**
 * What a clip can be upgraded to: a Seedance 2.5 draft becomes its own take in 1080p; any
 * other clip re-renders the same frame and prompt at a higher quality.
 */
export function upgradeQualities(model: string, from: VideoQuality, nativeDraft = false): FinalQuality[] {
  if (nativeDraft) return ['1080p'];
  const fromRank = from === 'draft' ? -1 : FINAL_ORDER.indexOf(from);
  return videoModelOptions(model).qualities.filter((q) => FINAL_ORDER.indexOf(q) > fromRank);
}

/** The model an upgrade renders with: a Veo draft ran on Veo Fast, its upgrade on the full Veo. */
export function upgradeModelFor(model: string): string {
  return videoEngineOf(model) === 'seedance' ? model : model.replace(/-(fast|lite)(?=-)/, '');
}

export function videoQualityLabel(quality: VideoQuality): string {
  return quality === 'draft' ? 'Draft' : quality === '4k' ? '4K' : quality;
}

/** Veo on the Gemini API, USD per second (September 2026): Standard, Fast and Lite tiers. */
function veoUsdPerSecond(model: string, resolution: string): number {
  const tier = /4k/i.test(resolution) ? 2 : resolution === '720p' ? 0 : 1;
  if (/veo-2/.test(model)) return 0.35;
  if (/lite/.test(model)) return [0.05, 0.08, 0.08][tier];
  if (/fast/.test(model)) return [0.1, 0.12, 0.3][tier];
  return [0.4, 0.4, 0.6][tier];
}

/** Provider list price of a clip in USD (a Veo draft renders on Veo Fast, a Seedance draft at 480p). */
export function videoCostUsd(model: string, quality: VideoQuality, seconds: number, aspectRatio = '9:16'): number {
  const options = videoModelOptions(model);
  const resolution = quality === 'draft' ? options.draft.resolution : quality;
  const perSecond = options.engine === 'seedance'
    ? seedanceUsdPerSecond(model, resolution, aspectRatio)
    : veoUsdPerSecond(quality === 'draft' ? 'veo-3.1-fast' : model, resolution);
  return perSecond * seconds;
}

/**
 * Credits per USD of provider cost. The default, 60, keeps today's price of an 8-second
 * 1080p Veo clip (192 credits); NEXT_PUBLIC_VIDEO_CREDITS_PER_USD changes it everywhere.
 */
export const VIDEO_CREDITS_PER_USD = Number(process.env.NEXT_PUBLIC_VIDEO_CREDITS_PER_USD) || 60;
const MIN_VIDEO_CREDITS = 5;

/** What a clip costs the user, from its provider cost. Shared by the price shown and the charge. */
export function videoCredits(model: string, quality: VideoQuality, seconds: number, aspectRatio = '9:16'): number {
  return Math.max(MIN_VIDEO_CREDITS, Math.round(videoCostUsd(model, quality, seconds, aspectRatio) * VIDEO_CREDITS_PER_USD));
}
