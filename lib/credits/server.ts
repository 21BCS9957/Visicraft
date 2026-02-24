import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import {
  getCreditCostForFeature,
  getCreditCostForVideo,
  type FeatureId,
} from './calculator';

/**
 * Atomically deduct credits for a user (single DB operation to avoid race conditions).
 * Requires the Postgres function deduct_credits(p_user_id, p_amount) to exist (see database-setup.sql).
 * Returns the new balance, or null if insufficient credits or error.
 */
export async function deductCreditsAtomic(
  userId: string,
  amount: number,
  supabase?: SupabaseClient
): Promise<number | null> {
  const client = supabase ?? createServiceClient();
  const { data, error } = await client.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    if (error.message?.includes('Insufficient credits')) {
      return null;
    }
    console.error('deduct_credits RPC error:', error);
    return null;
  }
  const balance = typeof data === 'number' ? data : typeof data === 'string' ? parseInt(data, 10) : null;
  return Number.isFinite(balance) ? balance : null;
}

/**
 * Get credit cost for a feature or video. Use in API routes for server-side enforcement.
 */
export { getCreditCostForFeature, getCreditCostForVideo };
export { TTS_CREDIT_COST } from './calculator';
export type { FeatureId };
