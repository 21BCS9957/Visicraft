import { NextRequest, NextResponse } from 'next/server';
import { describeProductNiche, researchWinningAds, type AdMediaType } from '@/lib/server/metaAdResearch';
import { writePromptsFromWinners } from '@/lib/server/winnerPrompts';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { VideoStyle } from '@/lib/videoStyles';

/** Development-only harness for the winning-ad research pipeline. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: ShopifyProductContext;
    mediaType?: AdMediaType;
    country?: string;
    imageUrls?: string[];
    /** When set, also run the winner → prompt writer for four slots with this product photo. */
    productImageUrl?: string;
    /** Only detect niche, competitors and price tier (no scraping). */
    nicheOnly?: boolean;
    videoStyle?: VideoStyle;
  };
  const started = Date.now();
  try {
  if (body.nicheOnly) {
    const niche = await describeProductNiche(body.productContext ?? {}, body.imageUrls ?? [], body.videoStyle);
    return NextResponse.json({ ms: Date.now() - started, niche: niche.niche, tier: niche.tier, keywords: niche.keywords, competitors: niche.competitors, styleKeywords: niche.styleKeywords });
  }
  const result = await researchWinningAds(body.productContext ?? {}, body.mediaType === 'video' ? 'video' : 'image', body.country ?? 'IN', { imageUrls: body.imageUrls ?? [], videoStyle: body.videoStyle });
  let prompts: unknown;
  if (body.productImageUrl) {
    const t = Date.now();
    const written = await writePromptsFromWinners({
      winners: result.ads,
      designs: result.designs,
      slots: [0, 1, 2, 3],
      productImageUrl: body.productImageUrl,
      context: body.productContext,
    });
    prompts = {
      ms: Date.now() - t,
      failed: written.failed,
      models: written.usages.map((u) => u.providerModel),
      angles: written.angles.map((a) => ({ name: a.name, modelledOn: a.modelledOn, referenceImage: a.referenceImage, withText: a.withText, headline: a.headline, subline: a.subline, brief: a.brief })),
    };
  }
  return NextResponse.json({
    prompts,
    ms: Date.now() - started,
    niche: result.niche,
    tier: result.tier,
    keywords: result.keywords,
    videoStyle: result.videoStyle,
    styleFallback: result.styleFallback,
    ads: result.ads.map((ad) => ({ page: ad.pageName, days: ad.daysRunning, variants: ad.collationCount, kind: ad.mediaKind, style: ad.style, styleConfirmed: ad.styleConfirmed, domain: ad.landingDomain, title: ad.title, hasImage: Boolean(ad.imageUrl), imageUrl: ad.imageUrl, videoUrl: ad.videoUrl })),
    designs: result.designs,
    patterns: result.patterns,
  });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
