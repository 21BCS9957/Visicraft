import { NextRequest, NextResponse } from 'next/server';
import { researchWinningAds } from '@/lib/server/metaAdResearch';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';
import { submitVeoJob } from '@/lib/server/veo';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { VideoStyle } from '@/lib/videoStyles';

/**
 * Development-only harness: video-ad research (optionally for one style) → timed sequences →
 * storyboard → Veo prompt, and with `frameUrl` + `submit` a real Veo job from that first frame.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: ShopifyProductContext;
    imageUrls?: string[];
    country?: string;
    research?: boolean;
    durationSeconds?: number;
    videoStyle?: VideoStyle;
    productKind?: 'packaged' | 'apparel' | 'object';
    frameUrl?: string;
    submit?: boolean;
  };
  const started = Date.now();
  try {
    const research = body.research === false
      ? null
      : await researchWinningAds(body.productContext ?? {}, 'video', body.country ?? 'IN', { imageUrls: body.imageUrls ?? [], videoStyle: body.videoStyle });
    const researchMs = Date.now() - started;
    const planned = await planVideoStoryboard({
      context: body.productContext,
      adPatterns: research?.patterns,
      winningDesigns: research?.designs,
      durationSeconds: body.durationSeconds ?? 8,
      style: body.videoStyle,
      productKind: body.productKind,
    });
    const job = body.submit && body.frameUrl
      ? await submitVeoJob({ imageUrl: body.frameUrl, prompt: planned.storyboard.prompt, negativePrompt: planned.storyboard.negativePrompt, aspectRatio: '9:16', duration: body.durationSeconds ?? 8 })
      : null;
    return NextResponse.json({
      researchMs,
      totalMs: Date.now() - started,
      niche: research?.niche,
      styleFallback: research?.styleFallback,
      styleTierRelaxed: research?.styleTierRelaxed,
      ads: research?.ads.map((ad) => ({ page: ad.pageName, days: ad.daysRunning, kind: ad.mediaKind, style: ad.style, styleConfirmed: ad.styleConfirmed, hasVideo: Boolean(ad.videoUrl), videoUrl: ad.videoUrl, imageUrl: ad.imageUrl })),
      sequences: research?.designs.map((d) => ({ page: d.pageName, style: d.style, watched: d.watched, format: d.format, audio: d.audio, sequence: d.sequence })),
      storyboard: planned.storyboard,
      job,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
