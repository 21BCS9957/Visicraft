import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnail } from '@/lib/banana/api';
import { requireAuth } from '@/lib/api-auth';
import { deductCreditsAtomic, getCreditCostForFeature } from '@/lib/credits/server';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const creditCost = getCreditCostForFeature('edit');
    const newBalance = await deductCreditsAtomic(user.id, creditCost);
    if (newBalance === null) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    const body = await request.json();
    const { imageUrl, model, prompt } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Edit instructions (prompt) are required' },
        { status: 400 }
      );
    }

    console.log('✏️ ========================================');
    console.log('✏️ EDIT REQUEST RECEIVED');
    console.log('✏️ ========================================');
    console.log('🖼️  Image URL:', imageUrl);
    console.log('🤖 Model:', model || 'nano-banana-pro (default)');
    console.log('💬 Edit Instructions:', prompt.substring(0, 100));
    console.log('✏️ ========================================');

    // Use the generate API with edit-specific prompt
    const editedImages = await generateThumbnail(
      imageUrl,
      [imageUrl],
      `Edit this image: ${prompt}. Maintain the overall composition and quality while making the requested changes.`,
      model
    );

    return NextResponse.json({
      success: true,
      images: editedImages,
      creditsRemaining: newBalance,
    });
  } catch (error) {
    console.error('Edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    );
  }
}
