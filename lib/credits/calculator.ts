// Credit cost calculator for different models and resolutions

export interface CreditCost {
  model: string;
  resolution: string;
  credits: number;
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
