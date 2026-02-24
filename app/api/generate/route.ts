import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';
import { supabase } from '@/lib/supabase/client';
import { requireAuth } from '@/lib/api-auth';
import { deductCreditsAtomic, getCreditCostForFeature } from '@/lib/credits/server';
import { calculateCredits, getModelName, getResolutionName } from '@/lib/credits/calculator';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const body = await request.json();
    const {
      referenceImage,
      sourceImages,
      prompt,
      model,
      aspectRatio,
      resolution,
    } = body;
    const creditCost =
      model && resolution
        ? calculateCredits(getModelName(model), getResolutionName(resolution))
        : getCreditCostForFeature('generate');
    const newBalance = await deductCreditsAtomic(user.id, creditCost);
    if (newBalance === null) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    // Flexible validation: Need at least one image
    if (!referenceImage && (!sourceImages || sourceImages.length === 0)) {
      return NextResponse.json(
        { error: 'At least one image (reference or source) is required' },
        { status: 400 }
      );
    }

    // Prompt is mandatory when using only one type of image
    const hasReference = !!referenceImage;
    const hasSource = sourceImages && sourceImages.length > 0;
    
    if ((hasReference && !hasSource) || (!hasReference && hasSource)) {
      if (!prompt) {
        return NextResponse.json(
          { error: 'Please provide a prompt to describe what you want to generate' },
          { status: 400 }
        );
      }
    }

    console.log('🎨 ========================================');
    console.log('🎨 GENERATION REQUEST RECEIVED');
    console.log('🎨 ========================================');
    console.log('🤖 Model:', model || 'gemini-3-pro (default)');
    console.log('📐 Aspect Ratio:', aspectRatio || '16:9 (default)');
    console.log('🎬 Resolution:', resolution || '1080p (default)');
    console.log('💬 Prompt:', prompt?.substring(0, 50) || 'Using default prompt');
    console.log('🖼️  Has Reference:', !!referenceImage);
    console.log('📸 Has Source:', !!(sourceImages && sourceImages.length > 0));
    console.log('🎨 ========================================');

    // Generate thumbnails using Gemini API with selected parameters
    const generatedThumbnails = await generateThumbnail(
      referenceImage,
      sourceImages,
      prompt,
      model,
      aspectRatio,
      resolution
    );

    // Save generation to database (optional - comment out if table doesn't exist)
    try {
      const { data, error } = await supabase
        .from('generations')
        .insert({
          reference_image_url: referenceImage,
          source_images_urls: sourceImages,
          generated_thumbnails: generatedThumbnails,
          prompt: prompt || null,
          model: model || 'gemini-3-pro',
          aspect_ratio: aspectRatio || '16:9',
          resolution: resolution || '2K',
        })
        .select()
        .single();

      if (error) {
        console.warn('Database save failed (non-critical):', error);
      }
    } catch (dbError) {
      console.warn('Database operation failed (non-critical):', dbError);
    }

    return NextResponse.json({
      success: true,
      images: generatedThumbnails,
      creditsRemaining: newBalance,
    });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
