import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductIdentity } from '@/lib/banana/api';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';
import { submitVeoJob } from '@/lib/server/veo';

/** Development-only harness: identity flag + storyboard + a real Veo job from a given frame. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as { productImageUrl?: string; frameUrl?: string; title?: string; submit?: boolean };
  try {
    const identity = body.productImageUrl ? await analyzeProductIdentity([body.productImageUrl]) : null;
    const planned = await planVideoStoryboard({
      context: { title: body.title },
      identityManifest: identity?.manifest,
      sensitive: identity?.sensitive ?? true,
      durationSeconds: 8,
    });
    const job = body.submit && body.frameUrl
      ? await submitVeoJob({ imageUrl: body.frameUrl, prompt: planned.storyboard.prompt, negativePrompt: planned.storyboard.negativePrompt, aspectRatio: '9:16', duration: 8 })
      : null;
    return NextResponse.json({ productKind: identity?.productKind, sensitive: identity?.sensitive, prompt: planned.storyboard.prompt, negativePrompt: planned.storyboard.negativePrompt, job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
