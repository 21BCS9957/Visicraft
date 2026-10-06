import { NextRequest, NextResponse } from 'next/server';
import { groundVideoStoryboard, planVideoStoryboard } from '@/lib/server/videoStoryboard';
import { describeGarmentSpec } from '@/lib/server/productSpec';
import { submitVeoJob } from '@/lib/server/veo';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/referenceVideos';
import type { VideoStyle } from '@/lib/videoStyles';

export const maxDuration = 300;

/**
 * Development-only harness: reference sequences (`referenceDesigns`) → storyboard → Veo prompt,
 * and with `frameUrl` + `submit` a real Veo job from that first frame.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productContext?: ShopifyProductContext;
    durationSeconds?: number;
    /** The video's shape (Veo: 9:16 or 16:9). */
    aspectRatio?: string;
    videoStyle?: VideoStyle;
    productKind?: 'packaged' | 'apparel' | 'object';
    frameUrl?: string;
    submit?: boolean;
    /** Pin the last frame to the first (garment fidelity). */
    pinLastFrame?: boolean;
    /** Skip planning: submit this exact prompt (e.g. to A/B the last-frame pin). */
    prompt?: string;
    resolution?: string;
    negativePrompt?: string;
    /** Garments: store photos for the exact pattern spec (main photo first, then close-ups). */
    specImageUrls?: string[];
    /** Reference sequences given directly, to test Claude's writing alone. */
    referenceDesigns?: AdDesign[];
    productImages?: string[];
    guidelines?: string;
  };
  const started = Date.now();
  try {
    if (body.prompt && body.frameUrl && body.submit) {
      const job = await submitVeoJob({ imageUrl: body.frameUrl, lastFrameUrl: body.pinLastFrame ? body.frameUrl : undefined, prompt: body.prompt, negativePrompt: body.negativePrompt, aspectRatio: '9:16', duration: 8, resolution: body.resolution });
      return NextResponse.json({ job });
    }
    const spec = body.specImageUrls?.length ? await describeGarmentSpec(body.specImageUrls) : null;
    const draft = await planVideoStoryboard({
      context: body.productContext,
      referenceDesigns: body.referenceDesigns,
      productImages: body.productImages,
      guidelines: body.guidelines,
      durationSeconds: body.durationSeconds ?? 8,
      aspectRatio: body.aspectRatio,
      style: body.videoStyle,
      productKind: body.productKind,
      productSpec: spec?.json,
      never: spec?.never,
    });
    const grounded = body.frameUrl
      ? await groundVideoStoryboard(draft.storyboard, { heroUrl: body.frameUrl, aspectRatio: body.aspectRatio, productSpec: spec?.json, never: spec?.never, garment: body.productKind === 'apparel' })
      : null;
    const planned = grounded ?? draft;
    const job = body.submit && body.frameUrl
      ? await submitVeoJob({ imageUrl: body.frameUrl, lastFrameUrl: body.pinLastFrame ? body.frameUrl : undefined, prompt: planned.storyboard.prompt, negativePrompt: planned.storyboard.negativePrompt, aspectRatio: '9:16', duration: body.durationSeconds ?? 8 })
      : null;
    return NextResponse.json({
      totalMs: Date.now() - started,
      draftPrompt: draft.storyboard.promptJson,
      grounded: Boolean(grounded),
      storyboard: planned.storyboard,
      promptChars: planned.storyboard.prompt.length,
      job,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
