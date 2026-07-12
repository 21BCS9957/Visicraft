import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import {
  deductCreditsForUser,
  estimateGoogleVideoCostUsd,
  getServerVideoCreditCost,
  logUsage,
  parseDurationSeconds,
  refundCreditsForUser,
  requireAuthenticatedUser,
} from '@/lib/server/usage';
// Need a valid way to handle video encoding for input to Vertex if vid2vid is required.
// For now, we will assume source video logic translates to the same LRO polling approach.

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let chargedCredits = 0;
  try {
    const user = await requireAuthenticatedUser();
    const body = await request.json();
    const { videoUrl, prompt, model, numResults, aspectRatio, duration, resolution, negativePrompt } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

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

    const location = 'us-central1';
    
    const targetModel = model && model.includes('veo') ? model : 'veo-2.0-generate-001';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${targetModel}:predictLongRunning`;

    // Download the video from Supabase and convert it to Base64 since Veo doesn't accept public HTTP URIs natively
    console.log(`Downloading source video from ${videoUrl}...`);
    const videoDataRes = await fetch(videoUrl);
    if (!videoDataRes.ok) {
        throw new Error(`Failed to download source video from storage: ${videoDataRes.statusText}`);
    }
    const videoBuffer = await videoDataRes.arrayBuffer();
    const base64Data = Buffer.from(videoBuffer).toString('base64');

    const payload = {
      instances: [
        {
          prompt: prompt || "A smooth cinematic transition",
          negativePrompt: negativePrompt || undefined,
          video: {
             bytesBase64Encoded: base64Data,
             mimeType: 'video/mp4' // Defaulting to mp4, adjust based on extension if needed
          }
        }
      ],
      parameters: {
        sampleCount: numResults || 1,
        duration: duration || '5s',
        resolution: '720p', // Locked to 720p due to Veo preview engine specifications.
        aspectRatio: aspectRatio || '16:9'
      }
    };

    console.log('🎬 Submitting vid2vid task to Vertex PredictLongRunning API...');

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
    const operationName = data.name; 
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
        mode: 'vid2vid',
        operationId: operationName,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '720p',
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
    console.error('Video-to-Video API Error:', error);
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Authentication required') ? 401 : 500 }
    );
  }
}
