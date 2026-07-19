import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getCreditCost } from '@/lib/credits/calculator';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export type UsageFeature = 'image_generation' | 'video_generation';

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount?: number;
  videoSeconds?: number;
  providerModel?: string;
}

export interface UsageLogInput {
  user: User;
  provider?: string;
  model: string;
  feature: UsageFeature;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  imageCount?: number;
  videoSeconds?: number;
  estimatedCostUsd?: number;
  creditCost?: number;
  metadata?: Record<string, unknown>;
}

export async function requireAuthenticatedUser(request?: NextRequest): Promise<User> {
  const supabase = await createClient();
  const authorization = request?.headers.get('authorization');
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch?.[1]) {
    const { data: bearerData } = await supabase.auth.getUser(bearerMatch[1]);
    if (bearerData.user) return bearerData.user;
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;

  throw new Error('Authentication required');
}

export async function deductCreditsForUser(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;

  const admin = createServiceClient();

  const rpcResult = await admin.rpc('deduct_user_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (!rpcResult.error) {
    return rpcResult.data === true;
  }

  console.warn('deduct_user_credits RPC unavailable, falling back to non-atomic update:', rpcResult.error.message);

  const { data, error: fetchError } = await admin
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .single();

  if (fetchError || !data) {
    console.error('Failed to fetch credits for server deduction:', fetchError);
    return false;
  }

  const currentCredits = Number(data.credits) || 0;
  if (currentCredits < amount) return false;

  const { error: updateError } = await admin
    .from('user_credits')
    .update({
      credits: currentCredits - amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to deduct credits on server:', updateError);
    return false;
  }

  return true;
}

export async function refundCreditsForUser(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;

  const admin = createServiceClient();
  const { data, error: fetchError } = await admin
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .single();

  if (fetchError || !data) {
    console.error('Failed to fetch credits for server refund:', fetchError);
    return;
  }

  const { error: updateError } = await admin
    .from('user_credits')
    .update({
      credits: (Number(data.credits) || 0) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to refund credits on server:', updateError);
  }
}

export async function logUsage(input: UsageLogInput): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from('usage_logs')
    .insert({
      user_id: input.user.id,
      user_email: input.user.email ?? null,
      provider: input.provider ?? 'google',
      model: input.model,
      feature: input.feature,
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
      total_tokens: input.totalTokens ?? 0,
      image_count: input.imageCount ?? 0,
      video_seconds: input.videoSeconds ?? 0,
      estimated_cost_usd: Number((input.estimatedCostUsd ?? 0).toFixed(6)),
      credit_cost: input.creditCost ?? 0,
      metadata: input.metadata ?? {},
    });

  if (error) {
    console.error('Usage log insert failed:', error);
  }
}

export function getServerImageCreditCost(
  mode: string,
  model: string | undefined,
  resolution: string | undefined
): number {
  if (mode === 'generate') {
    return getCreditCost(model || 'nano-banana-pro', resolution || '2K');
  }

  const modeCosts: Record<string, number> = {
    edit: 70,
    upscale: 80,
    unblur: 75,
    thumbnail: 65,
  };

  return modeCosts[mode] ?? 50;
}

export function getServerVideoCreditCost(options: {
  model?: string;
  duration?: string | number;
  resolution?: string;
  numResults?: number;
}): number {
  const base = options.model?.includes('veo') ? 120 : 120;
  const seconds = parseDurationSeconds(options.duration, 5);
  const resultCount = Math.max(1, Math.round(Number(options.numResults) || 1));
  const durationMultiplier = seconds <= 4 ? 0.8 : seconds >= 8 ? 1.6 : seconds >= 6 ? 1.2 : 1;
  const resolutionMultiplier = options.resolution === '4K' ? 2 : options.resolution === '1080p' ? 1.5 : 1;

  return Math.max(1, Math.round(base * resultCount * durationMultiplier * resolutionMultiplier));
}

export function estimateGoogleImageCostUsd(options: {
  model?: string;
  resolution?: string;
  imageCount: number;
  inputTokens?: number;
  outputTokens?: number;
}): number {
  const resolution = options.resolution === '4K' ? '4K' : '2K';
  const imageUnitCost = resolution === '4K'
    ? readNumberEnv('GOOGLE_GEMINI_3_PRO_IMAGE_4K_USD', 0.24)
    : readNumberEnv('GOOGLE_GEMINI_3_PRO_IMAGE_2K_USD', 0.134);
  const inputPerMillion = readNumberEnv('GOOGLE_GEMINI_3_PRO_IMAGE_INPUT_USD_PER_1M', 0);
  const outputPerMillion = readNumberEnv('GOOGLE_GEMINI_3_PRO_IMAGE_OUTPUT_USD_PER_1M', 0);

  return roundCost(
    options.imageCount * imageUnitCost +
    ((options.inputTokens ?? 0) / 1_000_000) * inputPerMillion +
    ((options.outputTokens ?? 0) / 1_000_000) * outputPerMillion
  );
}

export function estimateGoogleProductAnalysisCostUsd(options: {
  inputTokens?: number;
  outputTokens?: number;
}): number {
  const inputPerMillion = readNumberEnv('GOOGLE_GEMINI_2_5_FLASH_INPUT_USD_PER_1M', 0.3);
  const outputPerMillion = readNumberEnv('GOOGLE_GEMINI_2_5_FLASH_OUTPUT_USD_PER_1M', 2.5);

  return roundCost(
    ((options.inputTokens ?? 0) / 1_000_000) * inputPerMillion +
    ((options.outputTokens ?? 0) / 1_000_000) * outputPerMillion
  );
}

export function estimateGoogleVideoCostUsd(options: {
  model?: string;
  duration?: string | number;
  numResults?: number;
}): number {
  const model = options.model || 'veo-2.0-generate-001';
  const seconds = parseDurationSeconds(options.duration, 5);
  const resultCount = Math.max(1, Math.round(Number(options.numResults) || 1));

  let perSecond = readNumberEnv('GOOGLE_VEO_2_USD_PER_SECOND', 0.35);
  if (model.includes('veo-3.1') || model.includes('veo-3')) {
    perSecond = readNumberEnv('GOOGLE_VEO_3_1_USD_PER_SECOND', 0.4);
  } else if (model.includes('veo-1')) {
    perSecond = readNumberEnv('GOOGLE_VEO_1_USD_PER_SECOND', 0.2);
  }

  return roundCost(seconds * resultCount * perSecond);
}

export function parseDurationSeconds(duration: string | number | undefined, fallback = 5): number {
  if (typeof duration === 'number' && Number.isFinite(duration)) return Math.max(1, duration);
  const parsed = Number(String(duration ?? `${fallback}s`).replace('s', ''));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

export function sumUsage(usages: ProviderUsage[]): Required<Pick<ProviderUsage, 'inputTokens' | 'outputTokens' | 'totalTokens'>> {
  return usages.reduce(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + (usage.inputTokens || 0),
      outputTokens: acc.outputTokens + (usage.outputTokens || 0),
      totalTokens: acc.totalTokens + (usage.totalTokens || 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  );
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundCost(value: number): number {
  return Number(value.toFixed(6));
}
