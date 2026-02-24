// Credit cost calculator - single source of truth for model/resolution and feature-based costs

export interface CreditCost {
  model: string;
  resolution: string;
  credits: number;
}

/** Feature IDs used by the generate page and API routes */
export type FeatureId = 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit';

/** Credit cost per feature (generate page + API server-side enforcement) */
export const FEATURE_CREDIT_COSTS: Record<FeatureId, number> = {
  generate: 65,
  thumbnail: 70,
  upscale: 80,
  unblur: 75,
  edit: 70,
};

/** Video generation: duration id -> credits (Veo supports 4s, 6s, 8s only) */
export const VIDEO_CREDIT_COSTS: Record<string, number> = {
  '4s': 40,
  '6s': 60,
  '8s': 80,
};

/** Text-to-speech: fixed cost per request */
export const TTS_CREDIT_COST = 15;

export function getCreditCostForFeature(feature: FeatureId): number {
  return FEATURE_CREDIT_COSTS[feature] ?? 65;
}

export function getCreditCostForVideo(durationId: string): number {
  return VIDEO_CREDIT_COSTS[durationId] ?? 60;
}

export const CREDIT_COSTS: Record<string, Record<string, number>> = {
  'Gemini 2 Flash': {
    '720p': 20,
    '1080p': 30,
    '2K': 40,
    '4K': 50,
  },
  'Gemini 3 Pro': {
    '720p': 30,
    '1080p': 40,
    '2K': 50,
    '4K': 60,
  },
  'Banana Pro': {
    '720p': 35,
    '1080p': 45,
    '2K': 50,
    '4K': 70,
  },
};

export function calculateCredits(model: string, resolution: string): number {
  return CREDIT_COSTS[model]?.[resolution] || 30;
}

export function getModelName(model: string): string {
  const modelMap: Record<string, string> = {
    'gemini-2-flash': 'Gemini 2 Flash',
    'gemini-3-pro': 'Gemini 3 Pro',
    'banana-pro': 'Banana Pro',
    'nano-banana-pro': 'Banana Pro',
    'gpt-image': 'Gemini 3 Pro',
    'google-imagen': 'Gemini 3 Pro',
    'midjourney': 'Gemini 3 Pro',
    'flux-2-max': 'Gemini 3 Pro',
  };
  return modelMap[model] || model;
}

export function getResolutionName(resolution: string): string {
  const resMap: Record<string, string> = {
    '16:9': '1080p',
    '1:1': '1080p',
    '4:3': '1080p',
    '9:16': '1080p',
    '21:9': '2K',
  };
  return resMap[resolution] || '1080p';
}
