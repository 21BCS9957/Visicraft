import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deductCreditsForUser, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { isVideoEngineConfigured, submitVideoJob, videoEngineSetup } from '@/lib/server/video';
import type { VideoReview } from '@/lib/server/videoReview';
import { videoCostUsd, videoCredits } from '@/lib/videoModels';

// Starting a render (and its refund on failure) must not be cut off after the charge.
export const maxDuration = 300;

/**
 * Approves (or cancels) a video the pipeline prepared for review. The user may edit the
 * prompt and drop reference images; everything else is what they were shown. Video credits
 * are charged here, not when the ad was generated, and refunded if the job cannot start.
 */
export async function POST(request: NextRequest) {
  let charged: { userId: string; credits: number } | null = null;
  let reopen: (() => Promise<void>) | null = null;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { approvalId?: unknown; prompt?: unknown; negativePrompt?: unknown; frames?: unknown; cancel?: unknown };
    const approvalId = typeof body.approvalId === 'string' || typeof body.approvalId === 'number' ? String(body.approvalId) : '';
    if (!approvalId) return NextResponse.json({ error: 'approvalId is required.' }, { status: 400 });

    const admin = createServiceClient();
    const { data } = await admin
      .from('usage_logs')
      .select('id,metadata')
      .eq('id', approvalId)
      .eq('user_id', user.id)
      .eq('feature', 'video_generation')
      .limit(1);
    const row = data?.[0] as { id: string | number; metadata: Record<string, unknown> } | undefined;
    const meta = row?.metadata;
    if (!row || !meta || meta.mode !== 'video_review') return NextResponse.json({ error: 'This video review was not found.' }, { status: 404 });
    if (meta.pending !== true) {
      return NextResponse.json({ error: meta.cancelled ? 'This video was cancelled.' : 'This video was already approved.', operationId: meta.operationId ?? null }, { status: 409 });
    }
    const review = meta.review as VideoReview;

    if (body.cancel === true) {
      await admin.from('usage_logs').update({ metadata: { ...meta, pending: false, cancelled: true, cancelledAt: new Date().toISOString() } }).eq('id', row.id);
      return NextResponse.json({ cancelled: true });
    }

    // Only frames that were offered, in their order; a first frame cannot be swapped.
    const planned = review.frames.map((f) => f.url);
    const kept = review.mode === 'reference' && Array.isArray(body.frames)
      ? planned.filter((url) => (body.frames as unknown[]).includes(url))
      : planned;
    if (kept.length === 0) return NextResponse.json({ error: 'Keep at least one reference image.' }, { status: 400 });
    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim().slice(0, 6000) : review.prompt;
    const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 1500) : review.negativePrompt;
    if (!isVideoEngineConfigured(review.engine)) {
      return NextResponse.json({ error: `Video generation is not configured yet (set ${videoEngineSetup(review.engine)}).` }, { status: 500 });
    }

    // Claim it, so a double click cannot render (and charge) twice.
    const claimed = await admin
      .from('usage_logs')
      .update({ metadata: { ...meta, pending: false, approvedAt: new Date().toISOString() } })
      .eq('id', row.id)
      .eq('metadata->>pending', 'true')
      .select('id');
    if (!claimed.data?.length) return NextResponse.json({ error: 'This video is already being rendered.' }, { status: 409 });
    const reopenReview = async () => {
      await admin.from('usage_logs').update({ metadata: { ...meta, pending: true } }).eq('id', row.id);
    };
    reopen = reopenReview;

    const credits = videoCredits(review.model, review.quality, review.durationSeconds, review.aspectRatio);
    if (!(await deductCreditsForUser(user.id, credits))) {
      await reopenReview();
      return NextResponse.json({ error: `Insufficient credits. Need ${credits} credits.` }, { status: 402 });
    }
    charged = { userId: user.id, credits };

    const job = await submitVideoJob({
      engine: review.engine,
      model: review.model,
      quality: review.quality,
      duration: review.durationSeconds,
      aspectRatio: review.aspectRatio,
      imageUrl: kept[0],
      lastFrameUrl: review.mode === 'first_frame' && review.lastFramePinned ? kept[0] : undefined,
      referenceImageUrls: review.mode === 'reference' ? kept : undefined,
      prompt,
      negativePrompt,
      promptIsFinal: true,
      cameraFixed: review.cameraFixed,
      realFace: review.realFace,
      needsAudio: review.needsAudio,
    });

    // Rendered for less than was charged (a fallback model): refund the difference.
    let creditsKept = credits;
    const actualCredits = videoCredits(job.model, job.quality, job.durationSeconds, review.aspectRatio);
    if (actualCredits < credits) {
      await refundCreditsForUser(user.id, credits - actualCredits);
      creditsKept = actualCredits;
    }
    charged = null;
    reopen = null;

    await admin
      .from('usage_logs')
      .update({
        model: job.model,
        credit_cost: creditsKept,
        video_seconds: job.durationSeconds,
        estimated_cost_usd: Number(videoCostUsd(job.model, job.quality, job.durationSeconds, review.aspectRatio).toFixed(4)),
        metadata: {
          ...meta,
          pending: false,
          approvedAt: new Date().toISOString(),
          operationId: job.operationName,
          // What /api/video-status needs to retry a refused or filtered take once, or refund it,
          // and /api/video/upgrade to render it again at a higher quality.
          operationIds: [job.operationName],
          retries: 0,
          heroUrl: kept[0],
          referenceImageUrls: review.mode === 'reference' ? kept : null,
          prompt,
          negativePrompt: negativePrompt ?? null,
          promptIsFinal: true,
          promptEdited: prompt !== review.prompt,
          videoEngine: job.engine,
          videoModel: job.model,
          quality: job.quality,
          draft: job.quality === 'draft',
          nativeDraft: job.nativeDraft === true,
          seed: job.seed ?? null,
          durationSeconds: job.durationSeconds,
          aspectRatio: review.aspectRatio,
          lastFramePinned: review.lastFramePinned,
          cameraFixed: review.cameraFixed,
          realFace: review.realFace,
          needsAudio: review.needsAudio,
          resolution: job.resolution,
          notice: job.notice ?? null,
          chargedServerSide: true,
        },
      })
      .eq('id', row.id);

    return NextResponse.json({
      operationId: job.operationName,
      video: { model: job.model, engine: job.engine, quality: job.quality, durationSeconds: job.durationSeconds, nativeDraft: job.nativeDraft === true },
      creditsDeducted: creditsKept,
      notice: job.notice,
    });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits).catch(() => undefined);
    // The job did not start: the review stays open so it can be adjusted and approved again.
    if (reopen) await reopen().catch(() => undefined);
    console.error('Video render failed to start:', error);
    const message = error instanceof Error ? error.message : 'The video could not be started';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
