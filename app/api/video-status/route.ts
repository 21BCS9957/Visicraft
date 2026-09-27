import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { isGeminiOperation, pollGeminiVeoJob } from '@/lib/server/veo';
import { handleFailedVideo } from '@/lib/server/videoJobs';

export async function POST(request: NextRequest) {
  try {
    const { operationId } = await request.json();

    if (!operationId) {
      return NextResponse.json({ error: 'Operation ID is required' }, { status: 400 });
    }

    // Jobs submitted through the Gemini API (same GEMINI_API_KEY, no service account).
    if (typeof operationId === 'string' && isGeminiOperation(operationId)) {
      const poll = await pollGeminiVeoJob(operationId);
      // Filtered or failed: retry once with a neutral prompt, otherwise refund the credits.
      return NextResponse.json(poll.error ? await handleFailedVideo(operationId, poll.error) : poll);
    }

    const serviceAccountJsonStr = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJsonStr) {
      return NextResponse.json({ error: 'Video generation is not configured yet.' }, { status: 500 });
    }

    const credentials = JSON.parse(serviceAccountJsonStr);
    
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

    const parts = operationId.split('/');
    const locationIndex = parts.indexOf('locations') + 1;
    const location = parts[locationIndex] || 'us-central1';
    
    // Preview models like Veo strictly require the v1beta1 fetchPredictOperation endpoint
    // We dynamically extract the "model path" from the operation string to build the endpoint.
    const endpointPath = operationId.split('/operations/')[0];
    const pollEndpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/${endpointPath}:fetchPredictOperation`;

    const pollRes = await fetch(pollEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ operationName: operationId })
    });

    if (!pollRes.ok) {
      const errText = await pollRes.text();
      return NextResponse.json({ error: `Polling failed: ${errText}` }, { status: pollRes.status });
    }

    const pollData = await pollRes.json();

    if (pollData.error) {
      return NextResponse.json(await handleFailedVideo(operationId, pollData.error.message || 'Generation failed'));
    }

    if (pollData.done) {
      let videoUrl = '';
      
      console.log('✅ Vertex LRO completed! Parsing response...');
      
      if (pollData.response && pollData.response.videos && pollData.response.videos.length > 0) {
        console.log('🎥 Extracted base64 video bytes from Vertex GenerateVideoResponse!');
        videoUrl = `data:video/mp4;base64,${pollData.response.videos[0].bytesBase64Encoded}`;
      } else if (pollData.response && pollData.response.predictions && pollData.response.predictions[0]) {
        const pred = pollData.response.predictions[0];
        
        if (pred.videoUri) {
          videoUrl = pred.videoUri; // If Google returns a GCS URL
        } else if (pred.bytesBase64Encoded) {
          console.log('🎥 Extracted base64 video bytes from Vertex predictions!');
          videoUrl = `data:video/mp4;base64,${pred.bytesBase64Encoded}`;
        }
      } else if (pollData.response && pollData.response.bytesBase64Encoded) {
          console.log('🎥 Extracted base64 video bytes directly from response!');
          videoUrl = `data:video/mp4;base64,${pollData.response.bytesBase64Encoded}`;
      } else {
        console.warn('⚠️ Could not find video bytes in response object:', JSON.stringify(pollData).substring(0, 500));
      }
      if (!videoUrl) {
        // No video came back (usually Vertex's safety filter): never hand the client a placeholder.
        const reason = pollData.response?.raiMediaFilteredReasons?.[0] || 'Veo finished without a video (filtered by the safety policy)';
        return NextResponse.json(await handleFailedVideo(operationId, String(reason)));
      }
      
      return NextResponse.json({
        done: true,
        progress: 100,
        url: videoUrl
      });
    }

    // Google Vertex AI LROs conventionally put progress in metadata
    let progressPercentage = 0;
    if (pollData.metadata && typeof pollData.metadata.progressPercentage === 'number') {
      progressPercentage = pollData.metadata.progressPercentage;
    }

    return NextResponse.json({
      done: false,
      progress: progressPercentage
    });
    
  } catch (error) {
    console.error('Video status polling error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Polling failed' },
      { status: 500 }
    );
  }
}
