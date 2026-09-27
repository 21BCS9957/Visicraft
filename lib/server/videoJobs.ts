import { createServiceClient } from '@/lib/supabase/server';
import { refundCreditsForUser } from '@/lib/server/usage';
import { safeVeoPrompt, submitVeoJob } from '@/lib/server/veo';

/**
 * What happens when a video job ends without a video. Veo reports its safety filter
 * only when the job finishes, long after credits were charged at submission, so the
 * charge is found here by operation id: a filtered take is re-rendered once with a
 * neutral prompt, and anything that still fails is refunded exactly once.
 */

export interface VideoFailureOutcome {
  done: boolean;
  progress: number;
  error?: string;
  /** A retry was submitted; the client should poll this operation instead. */
  retryOperationId?: string;
  message?: string;
}

interface ChargeRow {
  id: string;
  user_id: string;
  credit_cost: number;
  metadata: Record<string, unknown>;
}

async function findCharge(operationId: string): Promise<ChargeRow | null> {
  const admin = createServiceClient();
  const byList = await admin
    .from('usage_logs')
    .select('id,user_id,credit_cost,metadata')
    .eq('feature', 'video_generation')
    .contains('metadata', { operationIds: [operationId] })
    .limit(1);
  if (byList.data?.[0]) return byList.data[0] as ChargeRow;
  // Older rows (and plain img2vid) only recorded a single operationId.
  const bySingle = await admin
    .from('usage_logs')
    .select('id,user_id,credit_cost,metadata')
    .eq('feature', 'video_generation')
    .eq('metadata->>operationId', operationId)
    .limit(1);
  return (bySingle.data?.[0] as ChargeRow | undefined) ?? null;
}

export async function handleFailedVideo(operationId: string, error: string): Promise<VideoFailureOutcome> {
  const admin = createServiceClient();
  const filtered = /filter|safety|polic|responsible ai|rai/i.test(error);
  const row = await findCharge(operationId).catch((e) => {
    console.warn('Could not look up the video charge:', e);
    return null;
  });
  const meta = row?.metadata ?? {};
  const retries = Number(meta.retries) || 0;
  const heroUrl = typeof meta.heroUrl === 'string' ? meta.heroUrl : undefined;
  const operationIds = Array.isArray(meta.operationIds) ? (meta.operationIds as string[]) : [operationId];

  // One neutral re-render after a safety-filter rejection, if we know the frame.
  if (row && filtered && retries < 1 && heroUrl) {
    try {
      const job = await submitVeoJob({
        imageUrl: heroUrl,
        prompt: safeVeoPrompt(),
        negativePrompt: 'people, person, hands, text, captions, logos, morphing, warped or changing product',
        aspectRatio: '9:16',
        duration: 8,
      });
      // Claim the retry atomically so two polls cannot both resubmit.
      const claimed = await admin
        .from('usage_logs')
        .update({ metadata: { ...meta, operationIds: [...operationIds, job.operationName], retries: retries + 1, lastError: error.slice(0, 300) } })
        .eq('id', row.id)
        .eq('metadata->>retries', String(retries))
        .select('id');
      if (claimed.data?.length) {
        console.log(`Video ${operationId}: Veo filtered the take; retrying once with a neutral prompt as ${job.operationName}`);
        return {
          done: false,
          progress: 0,
          retryOperationId: job.operationName,
          message: 'Veo’s safety filter rejected the first take. Re-rendering with a neutral, product-only prompt…',
        };
      }
    } catch (retryError) {
      console.warn('Video retry could not be submitted:', retryError);
    }
  }

  // Refund once: only the poll that flips `refunded` from null pays it back.
  let refunded = meta.refunded === true;
  if (row && !refunded && row.credit_cost > 0) {
    const claimed = await admin
      .from('usage_logs')
      .update({ metadata: { ...meta, refunded: true, refundReason: error.slice(0, 300), refundedAt: new Date().toISOString() } })
      .eq('id', row.id)
      .is('metadata->>refunded', null)
      .select('id');
    if (claimed.data?.length) {
      await refundCreditsForUser(row.user_id, row.credit_cost);
      refunded = true;
      console.log(`Video ${operationId}: refunded ${row.credit_cost} credits to ${row.user_id}`);
    }
  }

  const credits = row?.credit_cost ? `${row.credit_cost} video credits` : 'your video credits';
  return {
    done: true,
    progress: 0,
    error: filtered
      ? `Veo’s safety filter rejected this video${retries > 0 ? ', including a retry with a neutral product-only prompt' : ''}. ${refunded ? `Your ${credits} were refunded.` : ''} Products like intimate wear trip this filter; a product photo without a model tends to get through.`.replace(/\s+/g, ' ').trim()
      : `Video generation failed: ${error}. ${refunded ? `Your ${credits} were refunded.` : ''}`.trim(),
  };
}
