import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';
import { requireAuth } from '@/lib/api-auth';
import { deductCreditsAtomic, getCreditCostForFeature } from '@/lib/credits/server';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const creditCost = getCreditCostForFeature('upscale');
    const newBalance = await deductCreditsAtomic(user.id, creditCost);
    if (newBalance === null) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    const body = await request.json();
    const { imageUrl, model } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    console.log('🔍 ========================================');
    console.log('🔍 UPSCALE REQUEST RECEIVED');
    console.log('🔍 ========================================');
    console.log('🖼️  Image URL:', imageUrl);
    console.log('🤖 Model:', model || 'nano-banana-pro (default)');
    console.log('🔍 ========================================');

    // Use the generate API with upscale-specific prompt
    const upscaledImages = await generateThumbnail(
      imageUrl,
      [imageUrl],
      'Upscale this image to 4x resolution while preserving all details and quality. Enhance sharpness and clarity.',
      model
    );

    return NextResponse.json({
      success: true,
      images: upscaledImages,
      creditsRemaining: newBalance,
    });
  } catch (error) {
    console.error('Upscale error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upscale failed' },
      { status: 500 }
    );
  }
}
