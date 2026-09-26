import { NextRequest, NextResponse } from 'next/server';
import { researchWinningAds } from '@/lib/server/metaAdResearch';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';

/** Development-only harness: video-ad research → timed sequences → storyboard → Veo prompt. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: { title?: string; vendor?: string; description?: string };
    imageUrls?: string[];
    country?: string;
    research?: boolean;
    durationSeconds?: number;
  };
  const started = Date.now();
  try {
    const research = body.research === false
      ? null
      : await researchWinningAds(body.productContext ?? {}, 'video', body.country ?? 'IN', { imageUrls: body.imageUrls ?? [] });
    const researchMs = Date.now() - started;
    const planned = await planVideoStoryboard({
      context: body.productContext,
      adPatterns: research?.patterns,
      winningDesigns: research?.designs,
      durationSeconds: body.durationSeconds ?? 8,
    });
    return NextResponse.json({
      researchMs,
      totalMs: Date.now() - started,
      niche: research?.niche,
      ads: research?.ads.map((ad) => ({ page: ad.pageName, days: ad.daysRunning, kind: ad.mediaKind, hasVideo: Boolean(ad.videoUrl) })),
      sequences: research?.designs.map((d) => ({ page: d.pageName, format: d.format, audio: d.audio, sequence: d.sequence })),
      storyboard: planned.storyboard,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
