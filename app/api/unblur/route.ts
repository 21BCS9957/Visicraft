import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, model, prompt } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    console.log('👁️ ========================================');
    console.log('👁️ UNBLUR REQUEST RECEIVED');
    console.log('👁️ ========================================');
    console.log('🖼️  Image URL:', imageUrl);
    console.log('🤖 Model:', model || 'nano-banana-pro (default)');
    console.log('💬 Custom Prompt:', prompt || 'Using default');
    console.log('👁️ ========================================');

    // Use the generate API with unblur-specific prompt
    const enhancedPrompt = prompt 
      ? `Sharpen and deblur this image. ${prompt}`
      : 'Sharpen and deblur this image. Remove blur, enhance details, improve clarity and focus. Make the image crystal clear.';

    const unblurredImages = await generateThumbnail(
      imageUrl,
      [imageUrl],
      enhancedPrompt,
      model
    );

    return NextResponse.json({
      success: true,
      images: unblurredImages,
    });
  } catch (error) {
    console.error('Unblur error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unblur failed' },
      { status: 500 }
    );
  }
}
