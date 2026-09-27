import { NextRequest, NextResponse } from 'next/server';
import { researchWinningAds, type AdMediaType } from '@/lib/server/metaAdResearch';
import { writePromptsFromWinners } from '@/lib/server/winnerPrompts';

/** Development-only harness for the winning-ad research pipeline. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: { title?: string; vendor?: string; description?: string };
    mediaType?: AdMediaType;
    country?: string;
    imageUrls?: string[];
    /** When set, also run the winner → prompt writer for four slots with this product photo. */
    productImageUrl?: string;
  };
  const started = Date.now();
  try {
  const result = await researchWinningAds(body.productContext ?? {}, body.mediaType === 'video' ? 'video' : 'image', body.country ?? 'IN', { imageUrls: body.imageUrls ?? [] });
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
    keywords: result.keywords,
    ads: result.ads.map((ad) => ({ page: ad.pageName, days: ad.daysRunning, variants: ad.collationCount, kind: ad.mediaKind, domain: ad.landingDomain, title: ad.title, hasImage: Boolean(ad.imageUrl), imageUrl: ad.imageUrl })),
    designs: result.designs,
    patterns: result.patterns,
  });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
