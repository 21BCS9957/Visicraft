// Single source of truth for credit costs per model + resolution

export interface CreditCost {
  model: string;
  resolution: string;
  credits: number;
}

/** Model credit costs per resolution */
export const CREDIT_COSTS: Record<string, Record<string, number>> = {
  'nano-banana-pro': { '720p': 30, '1080p': 40, '2K': 50, '4K': 60 },
  'gpt-image': { '720p': 25, '1080p': 35, '2K': 45, '4K': 55 },
  'midjourney': { '720p': 40, '1080p': 50, '2K': 60, '4K': 80 },
  'google-imagen': { '720p': 30, '1080p': 40, '2K': 50, '4K': 65 },
  'flux-2-max': { '720p': 35, '1080p': 45, '2K': 55, '4K': 70 },
};

export function getCreditCost(model: string, resolution: string): number {
  return CREDIT_COSTS[model]?.[resolution] ?? 50;
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
