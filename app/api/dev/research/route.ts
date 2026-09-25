import { NextRequest, NextResponse } from 'next/server';
import { researchWinningAds, type AdMediaType } from '@/lib/server/metaAdResearch';

/** Development-only harness for the winning-ad research pipeline. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: { title?: string; vendor?: string; description?: string };
    mediaType?: AdMediaType;
    country?: string;
  };
  const started = Date.now();
  try {
  const result = await researchWinningAds(body.productContext ?? {}, body.mediaType === 'video' ? 'video' : 'image', body.country ?? 'IN');
  return NextResponse.json({
    ms: Date.now() - started,
    niche: result.niche,
    keywords: result.keywords,
    ads: result.ads.map((ad) => ({ page: ad.pageName, days: ad.daysRunning, domain: ad.landingDomain, title: ad.title, hasImage: Boolean(ad.imageUrl) })),
    designs: result.designs,
    patterns: result.patterns,
  });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
