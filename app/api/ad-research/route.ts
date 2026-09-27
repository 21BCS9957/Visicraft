import { NextRequest, NextResponse } from 'next/server';
import { researchWinningAds, type AdMediaType } from '@/lib/server/metaAdResearch';
import {
  estimateGoogleProductAnalysisCostUsd,
  logUsage,
  requireAuthenticatedUser,
} from '@/lib/server/usage';

export const maxDuration = 240;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const mediaType: AdMediaType = body.mediaType === 'video' ? 'video' : 'image';
    const country = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : 'IN';
    const raw = body.productContext && typeof body.productContext === 'object'
      ? body.productContext as Record<string, unknown>
      : {};
    const price = Number(raw.price);
    const product = {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      vendor: typeof raw.vendor === 'string' ? raw.vendor : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      price: Number.isFinite(price) && price > 0 ? price : undefined,
      currency: typeof raw.currency === 'string' ? raw.currency : undefined,
    };

    if (!product.title && !product.description) {
      return NextResponse.json({ error: 'Product title or description is required for ad research' }, { status: 400 });
    }

    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url)).slice(0, 3)
      : [];
    const result = await researchWinningAds(product, mediaType, country, { imageUrls });

    await logUsage({
      user,
      model: result.usage.providerModel || 'gemini-2.5-flash',
      feature: 'image_generation',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      imageCount: 0,
      estimatedCostUsd: estimateGoogleProductAnalysisCostUsd({ ...result.usage, model: result.usage.providerModel }),
      creditCost: 0,
      metadata: {
        operation: 'meta_winning_ad_research',
        mediaType,
        country,
        niche: result.niche,
        keywords: result.keywords,
        adCount: result.ads.length,
        mock: result.mock,
      },
    });

    return NextResponse.json({
      success: true,
      niche: result.niche,
      keywords: result.keywords,
      country: result.country,
      ads: result.ads,
      patterns: result.patterns,
      designs: result.designs,
      mock: result.mock,
    });
  } catch (error) {
    console.error('Ad research error:', error);
    const message = error instanceof Error ? error.message : 'Ad research failed';
    const status = message.includes('Authentication required')
      ? 401
      : message.includes('not configured')
        ? 503
        : message.includes('No active')
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
