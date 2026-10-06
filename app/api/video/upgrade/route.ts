import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deductCreditsForUser, logUsage, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { isSeedanceOperation, seedanceTaskId } from '@/lib/server/seedance';
import { isVideoEngineConfigured, submitVideoJob, videoEngineSetup } from '@/lib/server/video';
import {
  upgradeModelFor,
  upgradeQualities,
  videoCostUsd,
  videoCredits,
  videoEngineOf,
  videoQualityLabel,
  type FinalQuality,
  type VideoEngine,
  type VideoQuality,
} from '@/lib/videoModels';

// Starting a render (and its refund on failure) must not be cut off after the charge.
export const maxDuration = 300;

/**
 * Upgrades a clip (usually a cheap draft) to a higher quality without redoing the ad: its
 * hero frame, storyboard and prompt are reused, so only the final render is charged. A
 * Seedance 2.5 draft becomes its own take in 1080p; any other clip is re-rendered from the
 * same frame and prompt (on Seedance 1.x also from the same seed, so it stays close).
 */

const FINAL: FinalQuality[] = ['720p', '1080p', '4k'];

/** What the new clip carries over from the source, so it can be retried, refunded or upgraded again. */
const CARRIED = ['heroUrl', 'referenceImageUrls', 'promptIsFinal', 'prompt', 'negativePrompt', 'aspectRatio', 'cameraFixed', 'needsAudio', 'realFace', 'lastFramePinned', 'sensitive', 'videoStyle', 'madeStyle', 'exactGarment', 'modelledOn', 'referenceVideoIds'];

export async function POST(request: NextRequest) {
  let charged: { userId: string; credits: number } | null = null;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { operationId?: unknown; quality?: unknown };
    const operationId = typeof body.operationId === 'string' ? body.operationId : '';
    const quality = FINAL.find((q) => q === body.quality);
    if (!operationId || !quality) {
      return NextResponse.json({ error: 'operationId and a quality (720p, 1080p or 4k) are required.' }, { status: 400 });
    }

    const { data } = await createServiceClient()
      .from('usage_logs')
      .select('id,metadata')
      .eq('feature', 'video_generation')
      .eq('user_id', user.id)
      .contains('metadata', { operationIds: [operationId] })
      .limit(1);
    const meta = (data?.[0]?.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) return NextResponse.json({ error: 'This video was not found in your account.' }, { status: 404 });
    const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : undefined);
    const heroUrl = text('heroUrl');
    const prompt = text('prompt');
    const model = text('videoModel');
    if (!heroUrl || !prompt || !model) {
      return NextResponse.json({ error: 'This video was made before upgrades existed, so it cannot be upgraded. Generate it again.' }, { status: 400 });
    }
    const engine: VideoEngine = (text('videoEngine') as VideoEngine | undefined) ?? videoEngineOf(model) ?? 'veo';
    const from = (text('quality') as VideoQuality | undefined) ?? '1080p';
    // A Seedance 2.5 draft task (valid for 7 days) renders its own take in 1080p.
    const nativeDraft = meta.nativeDraft === true && isSeedanceOperation(operationId);
    const allowed = upgradeQualities(model, from, nativeDraft);
    if (!allowed.includes(quality)) {
      return NextResponse.json({ error: allowed.length ? `This clip can be upgraded to ${allowed.map(videoQualityLabel).join(' or ')}.` : 'This clip is already at the highest quality its model renders.' }, { status: 400 });
    }
    if (!isVideoEngineConfigured(engine)) {
      return NextResponse.json({ error: `Video generation is not configured yet (set ${videoEngineSetup(engine)}).` }, { status: 500 });
    }

    const durationSeconds = Number(meta.durationSeconds) || 8;
    const aspectRatio = text('aspectRatio') ?? '9:16';
    // Priced by the model the upgrade renders with (a Veo draft's upgrade runs on the full Veo).
    const credits = videoCredits(upgradeModelFor(model), quality, durationSeconds, aspectRatio);
    if (!(await deductCreditsForUser(user.id, credits))) {
      return NextResponse.json({ error: `Insufficient credits. Need ${credits} credits.` }, { status: 402 });
    }
    charged = { userId: user.id, credits };

    const job = await submitVideoJob({
      engine,
      // A Veo draft rendered on Veo Fast; its upgrade uses the full model.
      model: engine === 'veo' ? undefined : model,
      imageUrl: heroUrl,
      lastFrameUrl: meta.lastFramePinned === true ? heroUrl : undefined,
      prompt,
      negativePrompt: text('negativePrompt'),
      aspectRatio,
      duration: durationSeconds,
      quality,
      cameraFixed: meta.cameraFixed === true,
      realFace: meta.realFace === true,
      needsAudio: meta.needsAudio === true,
      seed: typeof meta.seed === 'number' ? meta.seed : undefined,
      fromDraftTaskId: nativeDraft ? seedanceTaskId(operationId) : undefined,
      // A Seedance reference film re-renders from its references and its approved prompt.
      referenceImageUrls: Array.isArray(meta.referenceImageUrls)
        ? (meta.referenceImageUrls as unknown[]).filter((url): url is string => typeof url === 'string')
        : undefined,
      promptIsFinal: meta.promptIsFinal === true,
    });

    // Rendered for less than was charged (a fallback model): refund the difference.
    let creditsKept = credits;
    const actualCredits = videoCredits(job.model, job.quality, job.durationSeconds, aspectRatio);
    if (actualCredits < credits) {
      await refundCreditsForUser(user.id, credits - actualCredits);
      creditsKept = actualCredits;
    }
    charged = null;

    const carried = Object.fromEntries(CARRIED.filter((key) => key in meta).map((key) => [key, meta[key]]));
    await logUsage({
      user,
      model: job.model,
      feature: 'video_generation',
      videoSeconds: job.durationSeconds,
      estimatedCostUsd: Number(videoCostUsd(job.model, job.quality, job.durationSeconds, aspectRatio).toFixed(4)),
      creditCost: creditsKept,
      metadata: {
        ...carried,
        mode: 'video_upgrade',
        upgradedFrom: operationId,
        operationId: job.operationName,
        // What /api/video-status needs to retry a refused or filtered take once, or refund it.
        operationIds: [job.operationName],
        retries: 0,
        videoEngine: job.engine,
        videoModel: job.model,
        durationSeconds: job.durationSeconds,
        quality: job.quality,
        draft: false,
        nativeDraft: false,
        seed: job.seed ?? (typeof meta.seed === 'number' ? meta.seed : null),
        resolution: job.resolution,
        notice: job.notice ?? null,
        chargedServerSide: true,
      },
    }).catch((error) => console.error('Upgrade usage logging failed:', error));

    return NextResponse.json({
      operationId: job.operationName,
      video: { model: job.model, engine: job.engine, quality: job.quality, durationSeconds: job.durationSeconds, nativeDraft: false },
      creditsDeducted: creditsKept,
      notice: job.notice,
    });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits).catch(() => undefined);
    console.error('Video upgrade failed:', error);
    const message = error instanceof Error ? error.message : 'Upgrade failed';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
