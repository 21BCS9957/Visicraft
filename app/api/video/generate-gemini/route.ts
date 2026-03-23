import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Video Generation using Google Gemini API (Veo 3.1)
 * This is a simpler alternative to Vertex AI that uses API key authentication
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, prompt, duration, aspectRatio, style, mood, model, userId } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    console.log('\n========================================');
    console.log('🎬 VIDEO GENERATION REQUEST (Gemini API)');
    console.log('========================================');
    console.log('💬 Prompt:', prompt);
    console.log('🖼️  Source Image:', imageUrl || 'None (text-to-video)');
    console.log('⏱️  Duration:', duration || '8s');
    console.log('📐 Aspect Ratio:', aspectRatio || '16:9');
    console.log('🎨 Style:', style || 'cinematic');
    console.log('😌 Mood:', mood || 'energetic');
    console.log('🤖 Model:', model || 'veo-3.1');
    console.log('👤 User ID:', userId);
    console.log('========================================\n');

    const durationValue = parseInt(duration?.replace('s', '') || '8');
    const aspectRatioValue = aspectRatio === '9:16' ? '9:16' : '16:9';
    
    const enhancedPrompt = `${prompt}. Create a ${style || 'cinematic'} style video with ${mood || 'energetic'} mood. Make it dynamic with smooth transitions and professional cinematography.`;

    // Prepare the request payload for Gemini API
    const requestPayload: any = {
      model: 'models/veo-3.1-generate-preview',
      contents: [{
        parts: [{
          text: enhancedPrompt
        }]
      }],
      generationConfig: {
        responseModalities: ['VIDEO'],
        videoConfig: {
          durationSeconds: durationValue,
          aspectRatio: aspectRatioValue,
          generateAudio: true,
        }
      }
    };

    // Add image if provided (image-to-video mode)
    if (imageUrl) {
      console.log('🖼️ Adding image for image-to-video generation...');
      
      // If it's a public URL, we need to fetch and convert to base64
      if (imageUrl.startsWith('http')) {
        try {
          const imageResponse = await fetch(imageUrl);
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString('base64');
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
          
          requestPayload.contents[0].parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          });
        } catch (err) {
          console.error('⚠️ Failed to fetch image, continuing with text-to-video:', err);
        }
      }
    }

    console.log('📡 Calling Gemini API...');
    console.log('🔗 Endpoint:', `${GEMINI_API_BASE}/models/veo-3.1-generate-preview:generateContent`);

    // Call Gemini API
    const endpoint = `${GEMINI_API_BASE}/models/veo-3.1-generate-preview:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    const result = await response.json();
    console.log('📥 Gemini API Response Status:', response.status);
    console.log('📥 Gemini API Response:', JSON.stringify(result, null, 2));

    // Check for errors
    if (!response.ok) {
      console.error('❌ Gemini API Error:', response.status, result);
      
      // Create a failed job in database
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: job } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: userId,
          prompt: prompt,
          source_image_url: imageUrl,
          status: 'error',
          model: 'gemini-veo-3.1',
          duration: durationValue,
          aspect_ratio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          metadata: { 
            error: result.error?.message || JSON.stringify(result),
            httpStatus: response.status
          },
        })
        .select()
        .single();

      return NextResponse.json({
        success: false,
        jobId: job?.id || null,
        status: 'error',
        error: result.error?.message || 'Gemini API error: ' + response.status,
        details: result,
      });
    }

    // Check if we got an operation name (async generation)
    if (result.name) {
      console.log('📋 Operation Name:', result.name);
      console.log('⏳ Video generation started - will poll for completion');
      
      // Create a job record in database
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: job } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: userId,
          prompt: prompt,
          source_image_url: imageUrl,
          status: 'processing',
          model: 'gemini-veo-3.1',
          duration: durationValue,
          aspect_ratio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          operation_name: result.name,
          metadata: { operationName: result.name },
        })
        .select()
        .single();

      return NextResponse.json({
        success: true,
        jobId: job?.id,
        operationName: result.name,
        status: 'processing',
        message: 'Video generation started. Will poll for completion.',
        requiresPolling: true,
        metadata: {
          duration: duration || '8s',
          durationValue,
          aspectRatio: aspectRatioValue,
          style: style || 'cinematic',
          mood: mood || 'energetic',
          model: 'gemini-veo-3.1',
          prompt: prompt,
        },
      });
    }

    // Check for immediate result
    if (result.candidates && result.candidates[0]) {
      const candidate = result.candidates[0];
      console.log('📦 Candidate data:', JSON.stringify(candidate, null, 2));
      
      let videoUrl = null;
      
      // Extract video from response
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.fileData?.fileUri) {
            videoUrl = part.fileData.fileUri;
            console.log('📹 Video URI:', videoUrl);
            break;
          } else if (part.inlineData) {
            // Handle inline video data
            const buffer = Buffer.from(part.inlineData.data, 'base64');
            const timestamp = Date.now();
            const videoPath = `videos/${timestamp}.mp4`;
            videoUrl = await uploadVideoToStorage(buffer, videoPath);
            console.log('✅ Video uploaded to:', videoUrl);
            break;
          }
        }
      }

      // Create completed job
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: job } = await supabase
        .from('video_generation_jobs')
        .insert({
          user_id: userId,
          prompt: prompt,
          source_image_url: imageUrl,
          status: videoUrl ? 'completed' : 'no_video',
          model: 'gemini-veo-3.1',
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
        return NextResponse.json({
          success: true,
          jobId: job?.id,
          status: 'completed',
          videoUrl: videoUrl,
          message: 'Video generated successfully!',
          requiresPolling: false,
        });
      } else {
        return NextResponse.json({
          success: false,
          jobId: job?.id,
          status: 'no_video',
          error: 'No video generated. API response did not contain video data.',
          apiResponse: result,
        });
      }
    }

    // No operation name and no immediate result
    return NextResponse.json({
      success: false,
      status: 'error',
      error: 'Unexpected API response format',
      apiResponse: result,
    });

  } catch (error) {
    console.error('❌ Video generation exception:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Video generation failed.',
      error: error instanceof Error ? error.message : 'Video generation failed',
    }, { status: 500 });
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
  console.log('🔄 POLLING FOR VIDEO STATUS (Gemini API)');
  console.log('========================================');
  console.log('📋 Job ID:', jobId);
  console.log('📋 Operation Name:', operationName);

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If we have operationName, poll the Gemini API
    if (operationName) {
      console.log('📡 Polling Gemini API for operation:', operationName);
      
      // Poll the operation endpoint
      const endpoint = `${GEMINI_API_BASE}/${operationName}?key=${GEMINI_API_KEY}`;
      console.log('🔗 Polling Endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'GET',
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

        // Extract video from response
        let videoUrl = null;
        
        if (operation.response?.candidates?.[0]?.content?.parts) {
          for (const part of operation.response.candidates[0].content.parts) {
            if (part.fileData?.fileUri) {
              videoUrl = part.fileData.fileUri;
              break;
            } else if (part.inlineData) {
              const buffer = Buffer.from(part.inlineData.data, 'base64');
              const videoPath = `videos/${Date.now()}.mp4`;
              videoUrl = await uploadVideoToStorage(buffer, videoPath);
              break;
            }
          }
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
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
