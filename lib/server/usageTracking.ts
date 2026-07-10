import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  calculateGeminiImageCost,
  calculateVeoCost,
  type GeminiUsageMetadata,
} from '@/lib/usage/pricing';

export interface UsageActor {
  userId: string | null;
  userEmail: string | null;
}

export async function getUsageActor(): Promise<UsageActor> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return {
    userId: user?.id || null,
    userEmail: user?.email || null,
  };
}

export async function recordImageUsage(input: {
  actor: UsageActor;
  model: string;
  modelVersion?: string;
  responseId?: string;
  resolution?: string;
  imageCount: number;
  usage?: GeminiUsageMetadata;
}): Promise<void> {
  const cost = calculateGeminiImageCost(input);
  const supabase = createServiceClient();
  const { error } = await supabase.from('ai_usage_events').insert({
    user_id: input.actor.userId,
    user_email: input.actor.userEmail,
    provider: 'google',
    billing_source: 'gemini_developer_api',
    provider_request_id: input.responseId || null,
    model: input.model,
    model_version: input.modelVersion || null,
    feature: 'image_generation',
    status: 'completed',
    input_tokens: cost.inputTokens,
    output_tokens: cost.outputTokens,
    total_tokens: cost.totalTokens,
    image_count: input.imageCount,
    video_seconds: 0,
    resolution: input.resolution || null,
    input_cost_usd: cost.inputCostUsd,
    output_cost_usd: cost.outputCostUsd,
    media_cost_usd: cost.mediaCostUsd,
    estimated_cost_usd: cost.totalCostUsd,
    pricing_version: cost.pricingVersion,
    pricing_source: cost.pricingSource,
    pricing_snapshot: cost.pricingSnapshot,
    raw_usage: input.usage || {},
    completed_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Failed to save image usage: ${error.message}`);
}

export async function startVideoUsage(input: {
  actor: UsageActor;
  providerRequestId: string;
  model: string;
  resolution?: string;
  requestedSeconds: number;
  outputCount: number;
  billingSource: 'gemini_developer_api' | 'vertex_ai';
}): Promise<void> {
  const cost = calculateVeoCost({
    model: input.model,
    resolution: input.resolution,
    videoSeconds: input.requestedSeconds * input.outputCount,
  });
  const supabase = createServiceClient();
  const { error } = await supabase.from('ai_usage_events').insert({
    user_id: input.actor.userId,
    user_email: input.actor.userEmail,
    provider: 'google',
    billing_source: input.billingSource,
    provider_request_id: input.providerRequestId,
    model: input.model,
    feature: 'video_generation',
    status: 'processing',
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    image_count: 0,
    video_seconds: 0,
    requested_video_seconds: input.requestedSeconds * input.outputCount,
    output_count: input.outputCount,
    resolution: input.resolution || '720p',
    input_cost_usd: 0,
    output_cost_usd: 0,
    media_cost_usd: 0,
    estimated_cost_usd: cost.totalCostUsd,
    pricing_version: cost.pricingVersion,
    pricing_source: cost.pricingSource,
    pricing_snapshot: cost.pricingSnapshot,
    raw_usage: {
      requestedSeconds: input.requestedSeconds,
      outputCount: input.outputCount,
    },
  });

  if (error) throw new Error(`Failed to start video usage tracking: ${error.message}`);
}

export async function completeVideoUsage(providerRequestId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: event, error: fetchError } = await supabase
    .from('ai_usage_events')
    .select('id, model, resolution, requested_video_seconds, status')
    .eq('provider', 'google')
    .eq('provider_request_id', providerRequestId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to find video usage: ${fetchError.message}`);
  if (!event || event.status === 'completed') return;

  const videoSeconds = Number(event.requested_video_seconds) || 0;
  const cost = calculateVeoCost({
    model: event.model,
    resolution: event.resolution,
    videoSeconds,
  });
  const { error } = await supabase
    .from('ai_usage_events')
    .update({
      status: 'completed',
      video_seconds: videoSeconds,
      media_cost_usd: cost.mediaCostUsd,
      estimated_cost_usd: cost.totalCostUsd,
      completed_at: new Date().toISOString(),
    })
    .eq('id', event.id);

  if (error) throw new Error(`Failed to complete video usage: ${error.message}`);
}

export async function failVideoUsage(providerRequestId: string, reason?: unknown): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('ai_usage_events')
    .update({
      status: 'failed',
      estimated_cost_usd: 0,
      raw_usage: { failure: reason || 'Provider generation failed' },
      completed_at: new Date().toISOString(),
    })
    .eq('provider', 'google')
    .eq('provider_request_id', providerRequestId)
    .neq('status', 'completed');

  if (error) throw new Error(`Failed to mark video usage failed: ${error.message}`);
}

export async function safelyTrack(action: () => Promise<void>, label: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[usage-tracking] ${label}`, error);
  }
}

