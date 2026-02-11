import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      referenceImage, 
      sourceImages, 
      prompt,
      model,
    } = body;

    // Validation: Need at least one image
    if (!referenceImage && (!sourceImages || sourceImages.length === 0)) {
      return NextResponse.json(
        { error: 'At least one image (reference or source) is required' },
        { status: 400 }
      );
    }

    console.log('🎬 ========================================');
    console.log('🎬 THUMBNAIL GENERATION REQUEST');
    console.log('🎬 ========================================');
    console.log('🤖 Model:', model || 'nano-banana-pro (default)');
    console.log('💬 Prompt:', prompt?.substring(0, 50) || 'Using default thumbnail prompt');
    console.log('🖼️  Has Reference:', !!referenceImage);
    console.log('📸 Has Source:', sourceImages && sourceImages.length > 0);
    console.log('🎬 ========================================');

    // Enhanced prompt specifically for thumbnails
    const thumbnailPrompt = prompt 
      ? `Create an eye-catching, professional YouTube thumbnail. ${prompt}. Make it vibrant, attention-grabbing with bold elements and clear focal points. Optimize for small screen viewing.`
      : 'Create an eye-catching, professional YouTube thumbnail. Make it vibrant and attention-grabbing with bold text, clear focal points, and high contrast. Optimize for small screen viewing and maximum click-through rate.';

    // Generate thumbnails using Gemini API
    const generatedThumbnails = await generateThumbnail(
      referenceImage,
      sourceImages,
      thumbnailPrompt,
      model,
    );

    return NextResponse.json({
      success: true,
      images: generatedThumbnails,
    });
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Thumbnail generation failed' },
      { status: 500 }
    );
  }
}
