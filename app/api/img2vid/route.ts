import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { imageToBase64 } from '@/lib/banana/api';
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
    const { imageUrl, prompt, model, numResults, aspectRatio, duration, resolution, negativePrompt } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    const supportedModels = new Set(['veo-2.0-generate-001', 'veo-3.1-generate-001']);
    if (typeof model === 'string' && !supportedModels.has(model)) {
      return NextResponse.json(
        { error: `Unsupported video model: ${model}. Choose Veo 3.1 or Veo 2.` },
        { status: 400 }
      );
    }
    const targetModel = typeof model === 'string' ? model : 'veo-3.1-generate-001';
    const isVeo3 = targetModel.startsWith('veo-3');
    const requestedResolution = typeof resolution === 'string' ? resolution : '720p';
    if (requestedResolution === '4K') {
      return NextResponse.json(
        { error: 'Direct 4K generation is not supported by the Vertex Veo API. Choose 1080p with Veo 3.1.' },
        { status: 400 }
      );
    }
    if (!isVeo3 && requestedResolution !== '720p') {
      return NextResponse.json(
        { error: 'Veo 2 supports 720p output only. Choose Veo 3.1 for 1080p.' },
        { status: 400 }
      );
    }

    const selectedResolution = isVeo3 && requestedResolution === '1080p' ? '1080p' : '720p';
    const selectedAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
    const requestedDuration = Math.round(parseDurationSeconds(duration, isVeo3 ? 8 : 5));
    const selectedDuration = isVeo3
      ? ([4, 6, 8].includes(requestedDuration) ? requestedDuration : 8)
      : Math.min(8, Math.max(5, requestedDuration));
    const sampleCount = Math.min(4, Math.max(1, Math.round(Number(numResults) || 1)));

    const serviceAccountJsonStr = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJsonStr) {
      return NextResponse.json({ error: 'Video generation is not configured yet (missing GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON).' }, { status: 500 });
    }

    const credentials = JSON.parse(serviceAccountJsonStr);
    const projectId = credentials.project_id;

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken) {
      throw new Error('Failed to obtain access token from Google Auth.');
    }

    const creditCost = getServerVideoCreditCost({
      model: targetModel,
      duration: selectedDuration,
      resolution: selectedResolution,
      numResults: sampleCount,
    });
    const deducted = await deductCreditsForUser(user.id, creditCost);
    if (!deducted) {
      return NextResponse.json(
        { error: `Insufficient credits. Need ${creditCost} credits.` },
        { status: 402 }
      );
    }
    chargedUserId = user.id;
    chargedCredits = creditCost;

    const dataUrl = await imageToBase64(imageUrl);
    const imageMatch = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,([\s\S]+)$/);
    if (!imageMatch) {
      throw new Error('Could not prepare the source image as JPEG or PNG for Veo.');
    }
    const [, imageMimeType, base64Data] = imageMatch;

    const location = 'us-central1';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${targetModel}:predictLongRunning`;

    const payload = {
      instances: [
        {
          prompt: prompt || "A smooth cinematic tracking shot",
          image: {
             bytesBase64Encoded: base64Data,
             mimeType: imageMimeType
          }
        }
      ],
      parameters: {
        sampleCount,
        durationSeconds: selectedDuration,
        aspectRatio: selectedAspectRatio,
        negativePrompt: typeof negativePrompt === 'string' && negativePrompt.trim()
          ? negativePrompt.trim()
          : undefined,
        ...(isVeo3 ? { resolution: selectedResolution, resizeMode: 'crop' } : {}),
      }
    };

    console.log('🎬 Submitting img2vid task to Vertex PredictLongRunning API...');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to submit Vertex job: ${response.status} ${errText}`);
    }
    
    const data = await response.json();
    const operationName = data.name; // e.g. "projects/.../locations/.../operations/..."
    console.log(`✅ LRO Job created successfully! Operation ID: ${operationName}`);
    const videoSeconds = selectedDuration * sampleCount;
    const estimatedCostUsd = estimateGoogleVideoCostUsd({
      model: targetModel,
      duration: selectedDuration,
      numResults: sampleCount,
    });

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
        aspectRatio: selectedAspectRatio,
        resolution: selectedResolution,
        sourceImageMimeType: imageMimeType,
        chargedServerSide: true,
      },
    });

    // Step 2: Return Operation ID Immediately for the client to begin polling
    return NextResponse.json({
      success: true,
      operationId: operationName,
      usage: {
        videoSeconds,
        resolution: selectedResolution,
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
