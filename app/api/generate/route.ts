import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referenceImageUrl, sourceImageUrls, prompt } = body;

    if (!referenceImageUrl || !sourceImageUrls || sourceImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Nano Banana API expects URLs directly, not base64
    // Generate thumbnails using Banana API
    const generatedThumbnails = await generateThumbnail(
      referenceImageUrl,
      sourceImageUrls,
      prompt
    );

    // Save generation to database
    const { data, error } = await supabase
      .from('generations')
      .insert({
        reference_image_url: referenceImageUrl,
        source_images_urls: sourceImageUrls,
        generated_thumbnails: generatedThumbnails,
        prompt: prompt || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save generation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      thumbnails: generatedThumbnails,
      generationId: data.id,
    });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
