import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductIdentity } from '@/lib/banana/api';
import { isVideoEngineConfigured, pickVideoEngine, resolveVideoModel, submitVideoJob, videoEngineSetup, videoOutputResolution } from '@/lib/server/video';
import { normalizeVideoQuality, snapVideoDuration, videoCostUsd, videoCredits } from '@/lib/videoModels';
import { buildMetaVideoPrompt } from '@/lib/prompts/shopifyCreative';
import {
  deductCreditsForUser,
  logUsage,
  refundCreditsForUser,
  requireAuthenticatedUser,
} from '@/lib/server/usage';

// Picking the product frame and starting the render must not be cut off after the charge.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let chargedCredits = 0;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json();
    const { model, aspectRatio, duration, resolution, negativePrompt } = body;
    let { imageUrl, prompt } = body;
    const referenceImages: string[] = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
      : [];
    if (!imageUrl && referenceImages.length > 0) imageUrl = referenceImages[0];

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // The picked model sets the engine: Veo, or Seedance for a Seedance model id.
    const engine = pickVideoEngine(typeof model === 'string' ? model : undefined);
    if (!isVideoEngineConfigured(engine)) {
      return NextResponse.json({ error: `Video generation is not configured yet (set ${videoEngineSetup(engine)}).` }, { status: 500 });
    }

    // Length and quality (draft, 720p, 1080p or 4k) snapped to what the model renders, priced from its cost.
    const videoModel = resolveVideoModel(engine, typeof model === 'string' ? model : undefined);
    const seconds = snapVideoDuration(videoModel, parseFloat(String(duration ?? '')) || undefined);
    const quality = normalizeVideoQuality(videoModel, typeof body.quality === 'string' ? body.quality : resolution ?? videoOutputResolution(engine, videoModel));
    const ratio = typeof aspectRatio === 'string' ? aspectRatio : '16:9';
    const creditCost = videoCredits(videoModel, quality, seconds, ratio);
    const deducted = await deductCreditsForUser(user.id, creditCost);
    if (!deducted) {
      return NextResponse.json(
        { error: `Insufficient credits. Need ${creditCost} credits.` },
        { status: 402 }
      );
    }
    chargedUserId = user.id;
    chargedCredits = creditCost;

    // Product-link videos: lock onto the clearest front-facing product image, not just the first one.
    if (referenceImages.length > 1) {
      const identity = await analyzeProductIdentity(referenceImages).catch((error) => {
        console.warn('Canonical product selection failed, using first image:', error);
        return null;
      });
      if (identity) imageUrl = referenceImages[identity.canonicalReferenceIndex] ?? imageUrl;
    }
    if (body.productContext && typeof body.productContext === 'object') {
      prompt = buildMetaVideoPrompt({
        context: {
          title: typeof body.productContext.title === 'string' ? body.productContext.title : undefined,
          vendor: typeof body.productContext.vendor === 'string' ? body.productContext.vendor : undefined,
        },
        userDirection: typeof prompt === 'string' ? prompt : undefined,
        adPatterns: typeof body.adPatterns === 'string' ? body.adPatterns : undefined,
      });
    }

    console.log(`🎬 Submitting img2vid task (${engine})...`);
    const job = await submitVideoJob({
      engine,
      imageUrl,
      prompt,
      negativePrompt,
      model: videoModel,
      aspectRatio: ratio,
      duration: seconds,
      quality,
    });
    const { operationName, model: targetModel } = job;
    console.log(`✅ Video job created successfully! Operation ID: ${operationName}`);
    // Rendered for less than was charged (a fallback model): refund the difference.
    const actualCredits = videoCredits(targetModel, job.quality, job.durationSeconds, ratio);
    const creditsKept = Math.min(creditCost, actualCredits);
    if (creditsKept < creditCost) await refundCreditsForUser(user.id, creditCost - creditsKept);
    chargedUserId = null;
    const videoSeconds = job.durationSeconds;
    const estimatedCostUsd = Number(videoCostUsd(targetModel, job.quality, job.durationSeconds, ratio).toFixed(4));

    await logUsage({
      user,
      model: targetModel,
      feature: 'video_generation',
      videoSeconds,
      estimatedCostUsd,
      creditCost: creditsKept,
      metadata: {
        mode: 'img2vid',
        operationId: operationName,
        // What /api/video-status needs to retry or refund, and /api/video/upgrade to re-render it.
        operationIds: [operationName],
        retries: 0,
        heroUrl: imageUrl,
        prompt: typeof prompt === 'string' ? prompt : '',
        negativePrompt: typeof negativePrompt === 'string' ? negativePrompt : undefined,
        aspectRatio: ratio,
        resolution: job.resolution,
        videoEngine: job.engine,
        videoModel: targetModel,
        durationSeconds: job.durationSeconds,
        quality: job.quality,
        draft: job.quality === 'draft',
        nativeDraft: job.nativeDraft === true,
        seed: job.seed ?? null,
        notice: job.notice ?? null,
        chargedServerSide: true,
      },
    }).catch((error) => console.error('Video usage logging failed:', error));

    // Step 2: Return Operation ID Immediately for the client to begin polling
    return NextResponse.json({
      success: true,
      operationId: operationName,
      video: { model: targetModel, engine: job.engine, quality: job.quality, durationSeconds: job.durationSeconds, nativeDraft: job.nativeDraft === true },
      notice: job.notice,
      usage: {
        videoSeconds,
        estimatedCostUsd,
        creditsDeducted: creditsKept,
      },
    });
  } catch (error) {
    if (chargedUserId && chargedCredits > 0) {
      await refundCreditsForUser(chargedUserId, chargedCredits);
    }
    console.error('Image-to-Video API Error:', error);
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Authentication required') ? 401 : 500 }
    );
  }
}
