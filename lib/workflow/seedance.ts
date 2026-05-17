export const SEEDANCE_MODELS = [
  {
    id: 'seedance-2',
    name: 'Seedance 2 Pro',
    provider: 'PiAPI',
    icon: 'ph:film-slate-fill',
    iconType: 'icon' as const,
    color: '#f97316',
  },
  {
    id: 'seedance-2-fast',
    name: 'Seedance 2 Fast',
    provider: 'PiAPI',
    icon: 'ph:lightning-fill',
    iconType: 'icon' as const,
    color: '#f59e0b',
  },
] as const;

export const SEEDANCE_MODES = [
  {
    id: 'text_to_video',
    name: 'Text to Video',
    description: 'Prompt only, no references',
  },
  {
    id: 'first_last_frames',
    name: 'First / Last Frames',
    description: 'Use 1-2 connected images',
  },
  {
    id: 'omni_reference',
    name: 'Omni Reference',
    description: 'Use 1-12 image, video, or audio references',
  },
] as const;

export const SEEDANCE_ASPECT_RATIOS = [
  { id: '21:9', name: '21:9 (Cinematic)', emoji: '🎞️' },
  { id: '16:9', name: '16:9 (Landscape)', emoji: '⬜' },
  { id: '4:3', name: '4:3 (Classic)', emoji: '📺' },
  { id: '1:1', name: '1:1 (Square)', emoji: '🟦' },
  { id: '3:4', name: '3:4 (Portrait)', emoji: '▯' },
  { id: '9:16', name: '9:16 (Vertical)', emoji: '📱' },
] as const;

export const SEEDANCE_FIRST_LAST_ASPECT_RATIOS = [
  { id: 'auto', name: 'Auto (from first frame)', emoji: '✨' },
  ...SEEDANCE_ASPECT_RATIOS,
] as const;

export const SEEDANCE_DURATIONS = Array.from({ length: 12 }, (_, index) => {
  const seconds = index + 4;
  return { id: `${seconds}s`, name: `${seconds} Seconds` };
});

export const SEEDANCE_RESOLUTIONS = [
  { id: '480p', name: '480p Standard', emoji: '📼' },
  { id: '720p', name: '720p HD', emoji: '📷' },
  { id: '1080p', name: '1080p Full HD', emoji: '🎥' },
] as const;

export const SEEDANCE_FAST_RESOLUTIONS = SEEDANCE_RESOLUTIONS.filter(
  (resolution) => resolution.id !== '1080p'
);

export const SEEDANCE_UNIT_PRICE_USD: Record<string, Record<string, number>> = {
  'seedance-2': {
    '480p': 0.1,
    '720p': 0.2,
    '1080p': 0.5,
  },
  'seedance-2-fast': {
    '480p': 0.08,
    '720p': 0.16,
  },
};

export const SEEDANCE_MAX_INPUT_VIDEO_SECONDS = 15.4;
const USD_TO_PLATFORM_CREDITS = 306;

export function isSeedanceModel(model: string): boolean {
  return model === 'seedance-2' || model === 'seedance-2-fast';
}

export function normalizeSeedanceDuration(duration: string | number | undefined): number {
  const raw = typeof duration === 'number' ? duration : Number(String(duration ?? '5s').replace('s', ''));
  if (!Number.isFinite(raw)) return 5;
  return Math.min(15, Math.max(4, Math.round(raw)));
}

export function getSeedanceUnitPrice(model: string, resolution: string): number {
  return SEEDANCE_UNIT_PRICE_USD[model]?.[resolution]
    ?? SEEDANCE_UNIT_PRICE_USD[model]?.['720p']
    ?? 0.2;
}

export function getSeedanceCreditCost(
  model: string,
  resolution: string,
  duration: string | number | undefined,
  inputVideoSeconds = 0
): number {
  const outputSeconds = normalizeSeedanceDuration(duration);
  const unitPrice = getSeedanceUnitPrice(model, resolution);
  const usdCost = unitPrice * outputSeconds + (unitPrice / 2) * inputVideoSeconds;
  return Math.max(1, Math.ceil(usdCost * USD_TO_PLATFORM_CREDITS));
}

export function getDefaultSeedanceMode(referenceUrls: string[]): string {
  return referenceUrls.length > 0 ? 'omni_reference' : 'text_to_video';
}

export function isVideoUrl(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return url.startsWith('data:video/') || clean.endsWith('.mp4') || clean.endsWith('.mov');
}
