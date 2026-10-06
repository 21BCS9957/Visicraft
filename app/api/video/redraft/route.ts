import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deductCreditsForUser, logUsage, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { isOwnStorageUrl } from '@/lib/server/playground/db';
import { isVideoEngineConfigured, submitVideoJob, videoEngineSetup } from '@/lib/server/video';
import { promptSeconds, retimePrompt } from '@/lib/video/shared';
import { videoCostUsd, videoCredits, videoEngineOf, videoModelOptions, type VideoEngine } from '@/lib/videoModels';

// Starting a render (and its refund on failure) must not be cut off after the charge.
export const maxDuration = 300;

/** Reference images one render can take (Seedance 2.0 takes up to 9). */
const MAX_REFERENCE_IMAGES = 9;

/** What the new take carries over from the one it was edited from. */
const CARRIED = ['aspectRatio', 'cameraFixed', 'needsAudio', 'lastFramePinned', 'sensitive', 'videoStyle', 'madeStyle', 'exactGarment', 'modelledOn', 'referenceVideoIds', 'projectId', 'productTitle'];

/**
 * A new draft of a video with small changes: the take the user was watching is rendered again
 * as a draft with their edited prompt and images (replaced, removed or added; their own uploads
 * only), at its length or another one the engine renders. It becomes another take of the same video, so it can be compared and upgraded like
 * any other. Charged like a draft, and refunded if it doesn't render.
 */
export async function POST(request: NextRequest) {
  let charged: { userId: string; credits: number } | null = null;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { operationId?: unknown; prompt?: unknown; negativePrompt?: unknown; frames?: unknown; durationSeconds?: unknown };
    const operationId = typeof body.operationId === 'string' ? body.operationId : '';
    const written = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 6000) : '';
    if (!operationId || !written) return NextResponse.json({ error: 'operationId and a prompt are required.' }, { status: 400 });

    const { data } = await createServiceClient()
      .from('usage_logs')
      .select('id,metadata')
      .eq('feature', 'video_generation')
      .eq('user_id', user.id)
      .contains('metadata', { operationIds: [operationId] })
      .limit(1);
    const meta = (data?.[0]?.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) return NextResponse.json({ error: 'This video was not found in your account.' }, { status: 404 });
    const text = (key: string) => (typeof meta[key] === 'string' && (meta[key] as string) ? (meta[key] as string) : undefined);
    const model = text('requestedVideoModel') ?? text('videoModel');
    const heroUrl = text('heroUrl');
    if (!model || !heroUrl) return NextResponse.json({ error: 'This video was made before edits existed. Plan it again instead.' }, { status: 400 });
    const engine: VideoEngine = (text('videoEngine') as VideoEngine | undefined) ?? videoEngineOf(model) ?? 'veo';
    if (!isVideoEngineConfigured(engine)) {
      return NextResponse.json({ error: `Video generation is not configured yet (set ${videoEngineSetup(engine)}).` }, { status: 500 });
    }

    // The images it used, or the user's own uploads in their place, in the order sent (the
    // prompt's "Image k" numbers follow it).
    const used = Array.isArray(meta.referenceImageUrls)
      ? (meta.referenceImageUrls as unknown[]).filter((url): url is string => typeof url === 'string')
      : [];
    const reference = used.length > 0;
    const allowed = (url: string) => url === heroUrl || used.includes(url) || isOwnStorageUrl(url);
    const sent = Array.isArray(body.frames)
      ? [...new Set((body.frames as unknown[]).filter((url): url is string => typeof url === 'string'))]
      : null;
    if (sent?.some((url) => !allowed(url))) return NextResponse.json({ error: 'Images must be uploaded first.' }, { status: 400 });
    const kept = reference ? (sent?.length ? sent : used).slice(0, MAX_REFERENCE_IMAGES) : [sent?.[0] ?? heroUrl];
    if (!kept.length) return NextResponse.json({ error: 'Keep at least one image.' }, { status: 400 });
    // A first frame the user swapped in may show a real person.
    const replacedFirstFrame = !reference && kept[0] !== heroUrl;
    const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 1500) : text('negativePrompt');
    // The take's length, or another one the engine renders; the shots are timed to match.
    const asked = Number(body.durationSeconds);
    const durationSeconds = videoModelOptions(model).durations.includes(asked) ? asked : Number(meta.durationSeconds) || 8;
    const prompt = promptSeconds(written) === durationSeconds ? written : retimePrompt(written, durationSeconds);
    // Veo pins a last frame only on 8-second clips.
    const lastFramePinned = meta.lastFramePinned === true && (engine !== 'veo' || durationSeconds === 8);
    const aspectRatio = text('aspectRatio') ?? '9:16';

    const credits = videoCredits(model, 'draft', durationSeconds, aspectRatio);
    if (!(await deductCreditsForUser(user.id, credits))) {
      return NextResponse.json({ error: `Insufficient credits. Need ${credits} credits.` }, { status: 402 });
    }
    charged = { userId: user.id, credits };

    const job = await submitVideoJob({
      engine,
      // Veo picks its own draft model.
      model: engine === 'veo' ? undefined : model,
      quality: 'draft',
      duration: durationSeconds,
      aspectRatio,
      imageUrl: kept[0],
      lastFrameUrl: !reference && lastFramePinned ? kept[0] : undefined,
      referenceImageUrls: reference ? kept : undefined,
      prompt,
      negativePrompt,
      promptIsFinal: true,
      cameraFixed: meta.cameraFixed === true,
      realFace: meta.realFace === true || replacedFirstFrame,
      needsAudio: meta.needsAudio === true,
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
        lastFramePinned,
        // Grouped with its video like an upgrade; `redraft` marks it as an edited take.
        mode: 'video_upgrade',
        redraft: true,
        upgradedFrom: operationId,
        operationId: job.operationName,
        // What /api/video-status needs to retry a refused or filtered take once, or refund it,
        // and /api/video/upgrade to render this exact take in full quality.
        operationIds: [job.operationName],
        retries: 0,
        heroUrl: kept[0],
        referenceImageUrls: reference ? kept : null,
        prompt,
        approvedPrompt: prompt,
        negativePrompt: negativePrompt ?? null,
        promptIsFinal: true,
        realFace: meta.realFace === true || replacedFirstFrame,
        videoEngine: job.engine,
        videoModel: job.model,
        requestedVideoModel: model,
        durationSeconds: job.durationSeconds,
        quality: job.quality,
        draft: job.quality === 'draft',
        nativeDraft: job.nativeDraft === true,
        seed: job.seed ?? null,
        resolution: job.resolution,
        notice: job.notice ?? null,
        approvedAt: new Date().toISOString(),
        chargedServerSide: true,
      },
    }).catch((error) => console.error('Redraft usage logging failed:', error));

    return NextResponse.json({
      operationId: job.operationName,
      video: { model: job.model, engine: job.engine, quality: job.quality, durationSeconds: job.durationSeconds, nativeDraft: job.nativeDraft === true },
      creditsDeducted: creditsKept,
      notice: job.notice,
    });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits).catch(() => undefined);
    console.error('Video redraft failed to start:', error);
    const message = error instanceof Error ? error.message : 'The new draft could not start';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
