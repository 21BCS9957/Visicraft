export const GOOGLE_PRICING_VERSION = 'google-public-pricing-2026-07-07';
export const GOOGLE_PRICING_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';

export interface ModalityTokenCount {
  modality?: string;
  tokenCount?: number;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: ModalityTokenCount[];
  candidatesTokensDetails?: ModalityTokenCount[];
  serviceTier?: string;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  mediaCostUsd: number;
  totalCostUsd: number;
  pricingVersion: string;
  pricingSource: string;
  pricingSnapshot: Record<string, unknown>;
}

interface ImagePricing {
  canonicalModel: string;
  inputUsdPerMillionTokens: number;
  textOutputUsdPerMillionTokens: number;
  imageOutputUsdPerMillionTokens: number;
  imageOutputTokens: Record<'1K' | '2K' | '4K', number>;
}

const IMAGE_PRICING: Record<string, ImagePricing> = {
  'gemini-3-pro-image': {
    canonicalModel: 'gemini-3-pro-image',
    inputUsdPerMillionTokens: 2,
    textOutputUsdPerMillionTokens: 12,
    imageOutputUsdPerMillionTokens: 120,
    imageOutputTokens: { '1K': 1120, '2K': 1120, '4K': 2000 },
  },
  'gemini-2.5-flash-image': {
    canonicalModel: 'gemini-2.5-flash-image',
    inputUsdPerMillionTokens: 0.3,
    textOutputUsdPerMillionTokens: 2.5,
    imageOutputUsdPerMillionTokens: 30,
    imageOutputTokens: { '1K': 1290, '2K': 1290, '4K': 1290 },
  },
};

const MODEL_ALIASES: Record<string, string> = {
  'nano-banana-pro': 'gemini-3-pro-image',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
  'nano-banana': 'gemini-2.5-flash-image',
};

const VEO_USD_PER_SECOND: Record<string, Record<string, number>> = {
  'veo-3.1-generate-preview': { '720p': 0.4, '1080p': 0.4, '4K': 0.6 },
  'veo-3.1-generate-001': { '720p': 0.4, '1080p': 0.4, '4K': 0.6 },
  'veo-3.1-fast-generate-preview': { '720p': 0.1, '1080p': 0.12, '4K': 0.3 },
  'veo-3.1-fast-generate-001': { '720p': 0.1, '1080p': 0.12, '4K': 0.3 },
  'veo-3.1-lite-generate-preview': { '720p': 0.05, '1080p': 0.08 },
  'veo-2.0-generate-001': { '720p': 0.35, '1080p': 0.35 },
  'veo-1.0': { '720p': 0.35, '1080p': 0.35 },
};

function roundUsd(value: number): number {
  return Number(value.toFixed(10));
}

function normalizeModel(model: string): string {
  const clean = model.replace(/^models\//, '');
  return MODEL_ALIASES[clean] || clean;
}

function normalizeImageSize(resolution?: string): '1K' | '2K' | '4K' {
  if (resolution === '4K') return '4K';
  if (resolution === '720p' || resolution === '1K') return '1K';
  return '2K';
}

function modalityTokens(details: ModalityTokenCount[] | undefined, modality: string): number {
  return (details || []).reduce((sum, detail) => {
    return detail.modality?.toUpperCase() === modality
      ? sum + Math.max(0, Number(detail.tokenCount) || 0)
      : sum;
  }, 0);
}

export function calculateGeminiImageCost(input: {
  model: string;
  resolution?: string;
  imageCount: number;
  usage?: GeminiUsageMetadata;
}): CostBreakdown {
  const canonicalModel = normalizeModel(input.model);
  const pricing = IMAGE_PRICING[canonicalModel];
  if (!pricing) {
    throw new Error(`No audited Google image pricing configured for model: ${input.model}`);
  }

  const usage = input.usage || {};
  const imageSize = normalizeImageSize(input.resolution);
  const inputTokens = Math.max(0, Number(usage.promptTokenCount) || 0);
  const candidateTokens = Math.max(0, Number(usage.candidatesTokenCount) || 0);
  const thinkingTokens = Math.max(0, Number(usage.thoughtsTokenCount) || 0);
  const reportedImageOutputTokens = modalityTokens(usage.candidatesTokensDetails, 'IMAGE');
  const imageOutputTokens = reportedImageOutputTokens ||
    pricing.imageOutputTokens[imageSize] * Math.max(0, input.imageCount);
  const reportedTextOutputTokens = modalityTokens(usage.candidatesTokensDetails, 'TEXT');
  const textOutputTokens = reportedTextOutputTokens || Math.max(0, candidateTokens - imageOutputTokens);

  const inputCostUsd = inputTokens * pricing.inputUsdPerMillionTokens / 1_000_000;
  const textOutputCostUsd = (textOutputTokens + thinkingTokens) *
    pricing.textOutputUsdPerMillionTokens / 1_000_000;
  const imageOutputCostUsd = imageOutputTokens * pricing.imageOutputUsdPerMillionTokens / 1_000_000;
  const totalCostUsd = inputCostUsd + textOutputCostUsd + imageOutputCostUsd;
  const outputTokens = candidateTokens + thinkingTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(Number(usage.totalTokenCount) || 0, inputTokens + outputTokens),
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(textOutputCostUsd),
    mediaCostUsd: roundUsd(imageOutputCostUsd),
    totalCostUsd: roundUsd(totalCostUsd),
    pricingVersion: GOOGLE_PRICING_VERSION,
    pricingSource: GOOGLE_PRICING_SOURCE,
    pricingSnapshot: {
      canonicalModel,
      imageSize,
      inputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
      textOutputUsdPerMillionTokens: pricing.textOutputUsdPerMillionTokens,
      imageOutputUsdPerMillionTokens: pricing.imageOutputUsdPerMillionTokens,
      imageOutputTokens,
      textOutputTokens,
      thinkingTokens,
    },
  };
}

export function calculateVeoCost(input: {
  model: string;
  resolution?: string;
  videoSeconds: number;
}): CostBreakdown {
  const canonicalModel = normalizeModel(input.model);
  const resolution = input.resolution === '4K' || input.resolution === '1080p'
    ? input.resolution
    : '720p';
  const modelPricing = VEO_USD_PER_SECOND[canonicalModel];
  const usdPerSecond = modelPricing?.[resolution];

  if (usdPerSecond === undefined) {
    throw new Error(`No audited Google video pricing configured for ${input.model} at ${resolution}`);
  }

  const videoSeconds = Math.max(0, input.videoSeconds);
  const mediaCostUsd = videoSeconds * usdPerSecond;

  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    mediaCostUsd: roundUsd(mediaCostUsd),
    totalCostUsd: roundUsd(mediaCostUsd),
    pricingVersion: GOOGLE_PRICING_VERSION,
    pricingSource: GOOGLE_PRICING_SOURCE,
    pricingSnapshot: {
      canonicalModel,
      resolution,
      usdPerGeneratedSecond: usdPerSecond,
    },
  };
}

