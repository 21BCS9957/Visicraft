import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api-auth';
import { deductCreditsAtomic, getCreditCostForVideo } from '@/lib/credits/server';

/** Veo supports only 4, 6, or 8 seconds. Image-to-video supports only 8 seconds. */
const VEO_DURATIONS = [4, 6, 8] as const;
const VEO_DURATION_IMAGE_TO_VIDEO = 8;

function getProjectId(): string {
  const raw = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return json.project_id || '';
  } catch {
    return '';
  }
}

function toVeoDurationSeconds(durationStr: string | undefined, hasImage: boolean): number {
  if (hasImage) return VEO_DURATION_IMAGE_TO_VIDEO;
  const num = parseInt(String(durationStr || '8').replace(/\s/g, '').replace('s', ''), 10) || 8;
  if (VEO_DURATIONS.includes(num as 4 | 6 | 8)) return num;
  if (num <= 5) return 6;
  return 8;
}

async function imageUrlToBase64(imageUrl: string): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString('base64');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  return { bytesBase64Encoded: base64, mimeType };
}

async function getAccessToken(): Promise<string> {
  const { JWT } = await import('google-auth-library');
  const serviceAccount = JSON.parse(process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON || '{}');
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get Google access token');
  return token.token;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const body = await request.json();
    const { imageUrl, prompt, duration, aspectRatio, style, mood, model } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const durationId = duration && typeof duration === 'string' ? duration.replace(/\s/g, '') : '8s';
    const creditCost = getCreditCostForVideo(durationId);
    const newBalance = await deductCreditsAtomic(user.id, creditCost);
    if (newBalance === null) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    console.log('\n========================================');
    console.log('🎬 VIDEO GENERATION REQUEST (Veo 3.1)');
    console.log('========================================');
    console.log('💬 Prompt:', prompt);
    console.log('🖼️  Source Image:', imageUrl || 'None (text-to-video)');
    console.log('⏱️  Duration:', duration || '8s');
    console.log('📐 Aspect Ratio:', aspectRatio || '16:9');
    console.log('🎨 Style:', style || 'cinematic');
    console.log('😌 Mood:', mood || 'energetic');
    console.log('🤖 Model:', model || 'veo-3.1');
    console.log('👤 User ID:', user.id);
    console.log('========================================\n');

    const projectId = getProjectId();
    if (!projectId) {
      return NextResponse.json(
        { error: 'Google Cloud project not configured. Set GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON with project_id.' },
        { status: 500 }
      );
    }
    const location = 'us-central1';
    const durationValue = toVeoDurationSeconds(duration, !!imageUrl);
    const aspectRatioValue = aspectRatio === '9:16' ? '9:16' : '16:9';

    console.log('⏱️  Veo duration (4/6/8s):', durationValue, imageUrl ? '(image-to-video: 8s only)' : '');

    const enhancedPrompt = `${prompt}. Create a ${style || 'cinematic'} style video with ${mood || 'energetic'} mood. Make it dynamic with smooth transitions and professional cinematography.`;

    const accessToken = await getAccessToken();
    console.log('✅ Got access token successfully');

    const modelId = model === 'veo-3.1' ? 'veo-3.1-generate-001' : 'veo-3.0-generate-001';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    type VeoImage = { gcsUri: string } | { bytesBase64Encoded: string; mimeType: string };
    const requestPayload: { prompt: string; image?: VeoImage } = {
      prompt: enhancedPrompt,
    };

    if (imageUrl) {
      console.log('🖼️ Processing image for video generation...');
      if (imageUrl.startsWith('gs://')) {
        requestPayload.image = { gcsUri: imageUrl };
      } else if (imageUrl.startsWith('http')) {
        try {
          const { bytesBase64Encoded, mimeType } = await imageUrlToBase64(imageUrl);
          requestPayload.image = { bytesBase64Encoded, mimeType };
          console.log('✅ Image loaded from URL (base64)');
        } catch (e) {
          console.error('⚠️ Failed to fetch image, falling back to text-to-video:', e);
        }
      }
    }

    const requestConfig = {
      sampleCount: 1,
      durationSeconds: durationValue,
      aspectRatio: aspectRatioValue,
      generateAudio: true, // Required for Veo 3 models
      // Add quality settings for better results
      compressionQuality: 'optimized',
    };

    console.log('📡 Calling Google Veo API...');
    console.log('🔗 Endpoint:', endpoint);
    console.log('📝 Request Payload:', JSON.stringify({
      instances: [requestPayload],
      parameters: requestConfig
    }, null, 2));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [requestPayload],
        parameters: requestConfig,
      }),
    });

    const result = await response.json();
    console.log('📥 Veo API Response Status:', response.status);
    console.log('📥 Veo API Response:', JSON.stringify(result, null, 2));

    // Check for errors
    if (!response.ok) {
      console.error('❌ Veo API Error:', response.status, result);
      
      const supabase = createServiceClient();
      
      const { data: job } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: user.id,
          prompt: prompt,
          source_image_url: imageUrl,
          status: 'error',
          model: model || 'veo-3.1',
          duration: durationValue,
          aspect_ratio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          metadata: { 
            error: result.error?.message || result.message || JSON.stringify(result),
            httpStatus: response.status
          },
        })
        .select()
        .single();

      return NextResponse.json({
        success: false,
        jobId: job?.id || null,
        status: 'error',
        error: result.error?.message || result.message || 'Veo API error: ' + response.status,
        details: result,
        apiResponse: result,
      });
    }

    // Check if we got a Long-Running Operation (LRO)
    let operationName = result.name;
    let videoUrl = null;

    if (operationName) {
      console.log('📋 LRO Operation Name:', operationName);
      console.log('⏳ Video generation started - will poll for completion');
      
      const supabase = createServiceClient();
      const { data: job } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: user.id,
          prompt: prompt,
          source_image_url: imageUrl,
          status: 'processing',
          model: model || 'veo-3.1',
          duration: durationValue,
          aspect_ratio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          operation_name: operationName,
          metadata: { operationName, result: JSON.stringify(result) },
        })
        .select()
        .single();

      return NextResponse.json({
        success: true,
        jobId: job?.id,
        operationName: operationName,
        status: 'processing',
        message: 'Video generation started. Will poll for completion.',
        requiresPolling: true,
        metadata: {
          duration: duration || '8s',
          durationValue,
          aspectRatio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          model: model || 'veo-3.1',
          prompt: prompt,
        },
      });
    }

    // Check for immediate result (no LRO needed)
    console.log('📦 Checking for immediate video result...');
    if (result.predictions && result.predictions[0]) {
      const prediction = result.predictions[0];
      console.log('📦 Prediction data:', JSON.stringify(prediction, null, 2));
      
      if (prediction.bytesBase64Encoded) {
        console.log('📹 Video data received as base64, processing...');
        const buffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
        const timestamp = Date.now();
        const videoPath = `videos/${timestamp}.mp4`;
        
        console.log('💾 Saving video to Supabase Storage...');
        videoUrl = await uploadVideoToStorage(buffer, videoPath);
        console.log('✅ Video uploaded to:', videoUrl);
      } else if (prediction.gcsUri) {
        videoUrl = prediction.gcsUri.replace('gs://', 'https://storage.googleapis.com/');
        console.log('📹 Video GCS URI:', videoUrl);
      } else if (prediction.uri) {
        videoUrl = prediction.uri;
        console.log('📹 Video URI:', videoUrl);
      } else if (prediction.video) {
        // Handle nested video object
        if (prediction.video.bytesBase64Encoded) {
          const buffer = Buffer.from(prediction.video.bytesBase64Encoded, 'base64');
          const timestamp = Date.now();
          const videoPath = `videos/${timestamp}.mp4`;
          videoUrl = await uploadVideoToStorage(buffer, videoPath);
        } else if (prediction.video.gcsUri) {
          videoUrl = prediction.video.gcsUri.replace('gs://', 'https://storage.googleapis.com/');
        }
      }
    } else {
      console.log('⚠️ No predictions in response, checking other fields...');
      console.log('⚠️ Full response keys:', Object.keys(result));
    }

    const supabase = createServiceClient();
    const { data: job } = await supabase
      .from('video_generation_jobs')
      .insert({
        user_id: user.id,
        prompt: prompt,
        source_image_url: imageUrl,
        status: videoUrl ? 'completed' : 'no_video',
        model: model || 'veo-3.1',
        duration: durationValue,
        aspect_ratio: aspectRatioValue,
        style: style || 'cinematic',
        mood: mood || 'energetic',
        output_url: videoUrl,
        metadata: { result: JSON.stringify(result) },
      })
      .select()
      .single();

    if (videoUrl) {
      console.log('✅ Video generation completed - DIRECT RESULT');
      console.log('🎬 Video URL:', videoUrl);

      return NextResponse.json({
        success: true,
        jobId: job?.id,
        status: 'completed',
        videoUrl: videoUrl,
        message: 'Video generated successfully!',
        requiresPolling: false,
        creditsRemaining: newBalance,
        metadata: {
          duration: duration || '8s',
          durationValue,
          aspectRatio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          model: model || 'veo-3.1',
          prompt: prompt,
        },
      });
    } else {
      console.log('⚠️ No video URL found in response');
      return NextResponse.json({
        success: false,
        jobId: job?.id,
        status: 'no_video',
        error: 'No video generated. API response did not contain video data.',
        apiResponse: result,
      });
    }
  } catch (error) {
    console.error('❌ Video generation exception:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Video generation failed.',
      error: error instanceof Error ? error.message : 'Video generation failed',
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const operationName = searchParams.get('operationName');

  if (!jobId && !operationName) {
    return NextResponse.json(
      { error: 'jobId or operationName is required' },
      { status: 400 }
    );
  }

  console.log('\n========================================');
  console.log('🔄 POLLING FOR VIDEO STATUS');
  console.log('========================================');
  console.log('📋 Job ID:', jobId);
  console.log('📋 Operation Name:', operationName);

  try {
    const supabase = createServiceClient();

    // If we have operationName, poll the LRO
    if (operationName) {
      console.log('📡 Polling Google API for operation:', operationName);
      
      const accessToken = await getAccessToken();
      const projectId = getProjectId();
      const location = 'us-central1';
      if (!projectId) {
        return NextResponse.json({ status: 'error', error: 'Project not configured' }, { status: 500 });
      }
      
      // Get operation status
      const operationEndpoint = `https://${location}-aiplatform.googleapis.com/v1/${operationName}`;
      console.log('🔗 Polling Endpoint:', operationEndpoint);
      
      const response = await fetch(operationEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Operation polling HTTP error:', response.status, errorText);
        
        return NextResponse.json({
          status: 'processing',
          message: 'Still processing...',
        });
      }

      const operation = await response.json();
      console.log('📋 Operation Response:', JSON.stringify(operation, null, 2).substring(0, 1000));

      // Check if done
      if (operation.done) {
        console.log('✅ Operation completed!');
        
        if (operation.error) {
          console.error('❌ Operation error:', operation.error);
          
          if (jobId) {
            await supabase
              .from('video_generation_jobs')
              .update({ status: 'error', metadata: { error: operation.error } })
              .eq('id', jobId);
          }
          
          return NextResponse.json({
            status: 'error',
            error: operation.error.message || 'Video generation failed',
          });
        }

        // Get the generated video from response (Veo may use predictions[] or other shapes)
        console.log('📦 Extracting video from operation response...');
        let videoUrl = null;
        const responseData = operation.response || operation;

        const extractVideoFrom = async (obj: Record<string, unknown> | null): Promise<string | null> => {
          if (!obj) return null;
          if (obj.bytesBase64Encoded && typeof obj.bytesBase64Encoded === 'string') {
            const buffer = Buffer.from(obj.bytesBase64Encoded, 'base64');
            return uploadVideoToStorage(buffer, `videos/${Date.now()}.mp4`);
          }
          if (typeof obj.gcsUri === 'string') return obj.gcsUri.replace('gs://', 'https://storage.googleapis.com/');
          if (typeof obj.uri === 'string') return obj.uri;
          if (obj.video && typeof obj.video === 'object') return extractVideoFrom(obj.video as Record<string, unknown>);
          return null;
        };

        if (responseData.predictions?.[0]) {
          const prediction = responseData.predictions[0] as Record<string, unknown>;
          console.log('📦 Prediction keys:', Object.keys(prediction));
          videoUrl = await extractVideoFrom(prediction);
        }
        if (!videoUrl && (responseData as Record<string, unknown>).generatedSamples?.[0]) {
          const sample = (responseData as Record<string, unknown>).generatedSamples[0] as Record<string, unknown>;
          videoUrl = await extractVideoFrom(sample);
        }

        console.log('🎬 Final Video URL:', videoUrl);

        if (jobId) {
          await supabase
            .from('video_generation_jobs')
            .update({ status: videoUrl ? 'completed' : 'error', output_url: videoUrl })
            .eq('id', jobId);
        }

        if (videoUrl) {
          return NextResponse.json({
            status: 'completed',
            videoUrl: videoUrl,
          });
        } else {
          return NextResponse.json({
            status: 'error',
            error: 'No video URL found in completed operation',
          });
        }
      }

      // Still processing
      const progress = operation.metadata?.progressPercent || 0;
      console.log('⏳ Still processing... Progress:', progress);
      
      return NextResponse.json({
        status: 'processing',
        message: `Video is being generated... (${progress}% complete)`,
        progress: progress,
      });
    }

    // Check job status from database
    const { data: job, error } = await supabase
      .from('video_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: job.status,
      videoUrl: job.output_url,
      operationName: job.operation_name,
      metadata: job.metadata,
      createdAt: job.created_at,
    });
  } catch (error) {
    console.error('❌ Polling exception:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to check status',
    });
  }
}

async function uploadVideoToStorage(buffer: Buffer, path: string): Promise<string> {
  const supabase = createServiceClient();
  
  console.log('💾 Uploading video to:', path);
  
  const { data, error } = await supabase.storage
    .from('generated-videos')
    .upload(path, buffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) {
    console.error('❌ Storage upload error:', error);
    throw new Error(`Failed to upload video: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('generated-videos')
    .getPublicUrl(path);

  console.log('✅ Video uploaded successfully:', urlData.publicUrl);
  return urlData.publicUrl;
}
