import { NextRequest, NextResponse } from 'next/server';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { buildMetaAdCreativePrompt, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import { writePromptsFromWinners } from '@/lib/server/winnerPrompts';
import { judgeAdCreative } from '@/lib/server/adJudge';

/**
 * Development-only harness: one winning ad + our product → the creative director's
 * prompt → one render, with the winner passed to the image model as a style reference
 * (or not, with `styleReference: false`, to compare against the old behaviour).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    winnerImageUrl: string;
    productImageUrl: string;
    context?: ShopifyProductContext;
    productKind?: 'packaged' | 'apparel' | 'object';
    pageName?: string;
    daysRunning?: number;
    styleReference?: boolean;
    judge?: boolean;
  };
  const started = Date.now();
  try {
    const written = await writePromptsFromWinners({
      winners: [{
        id: 'dev-winner',
        pageName: body.pageName ?? 'Reference brand',
        startDate: new Date(Date.now() - (body.daysRunning ?? 90) * 86400000).toISOString(),
        daysRunning: body.daysRunning ?? 90,
        imageUrl: body.winnerImageUrl,
        mediaKind: 'image',
        collationCount: 1,
        winScore: 0,
        libraryUrl: '',
      }],
      slots: [0],
      productImageUrl: body.productImageUrl,
      context: body.context,
      productKind: body.productKind,
    });
    if (written.failed) throw new Error('Prompt writer failed');
    const styled = body.styleReference !== false;
    const angle = styled ? written.angles[0] : { ...written.angles[0], referenceImage: undefined };
    const prompt = buildMetaAdCreativePrompt({ context: body.context, angle, withText: Boolean(angle.withText), productKind: body.productKind });
    const writtenMs = Date.now() - started;
    const result = await runImageGeneration({
      mode: 'generate',
      referenceImages: styled ? [body.productImageUrl, body.winnerImageUrl] : [body.productImageUrl],
      prompt,
      model: 'nano-banana-pro',
      aspectRatio: angle.aspectRatio ?? '9:16',
      resolution: '2K',
      persistToGenerationsTable: false,
      referencePolicy: styled ? 'product-plus-style' : 'product-lock',
    });
    const url = result.images[0];
    const verdict = body.judge && url
      ? await judgeAdCreative({ imageUrl: url, context: body.context, angle, withText: Boolean(angle.withText), productKind: body.productKind, referenceImageUrl: styled ? body.winnerImageUrl : undefined })
      : undefined;
    return NextResponse.json({ ms: Date.now() - started, writtenMs, url, angle, prompt, verdict });
  } catch (error) {
    return NextResponse.json({ ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
