import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductIdentity } from '@/lib/banana/api';
import { isVideoGenerationConfigured, submitVeoJob } from '@/lib/server/veo';
import { buildMetaVideoPrompt } from '@/lib/prompts/shopifyCreative';
import {
  deductCreditsForUser,
  estimateGoogleVideoCostUsd,
  getServerVideoCreditCost,
  logUsage,
  parseDurationSeconds,
  refundCreditsForUser,
  requireAuthenticatedUser,
} from '@/lib/server/usage';

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let chargedCredits = 0;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json();
    const { model, numResults, aspectRatio, duration, resolution, negativePrompt } = body;
    let { imageUrl, prompt } = body;
    const referenceImages: string[] = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
      : [];
    if (!imageUrl && referenceImages.length > 0) imageUrl = referenceImages[0];

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    if (!isVideoGenerationConfigured()) {
      return NextResponse.json({ error: 'Video generation is not configured yet (set GEMINI_API_KEY with billing enabled, or GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON).' }, { status: 500 });
    }

    const creditCost = getServerVideoCreditCost({ model, duration, resolution, numResults });
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

    console.log('🎬 Submitting img2vid task to Vertex PredictLongRunning API...');
    const { operationName, model: targetModel } = await submitVeoJob({
      imageUrl,
      prompt,
      negativePrompt,
      model,
      aspectRatio,
      duration,
      numResults,
    });
    console.log(`✅ LRO Job created successfully! Operation ID: ${operationName}`);
    const videoSeconds = parseDurationSeconds(duration, 5) * Math.max(1, Number(numResults) || 1);
    const estimatedCostUsd = estimateGoogleVideoCostUsd({ model: targetModel, duration, numResults });

    await logUsage({
      user,
      model: targetModel,
      feature: 'video_generation',
      videoSeconds,
      estimatedCostUsd,
      creditCost,
      metadata: {
        mode: 'img2vid',
        operationId: operationName,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || (targetModel.includes('veo-3') ? '1080p' : '720p'),
        chargedServerSide: true,
      },
    });

    // Step 2: Return Operation ID Immediately for the client to begin polling
    return NextResponse.json({
      success: true,
      operationId: operationName,
      usage: {
        videoSeconds,
        estimatedCostUsd,
        creditsDeducted: creditCost,
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
