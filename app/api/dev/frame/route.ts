import { NextRequest, NextResponse } from 'next/server';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { buildMetaAdCreativePrompt, safeCompositionBrief } from '@/lib/prompts/shopifyCreative';

/** Development-only harness: render one creative frame with the real prompt builder. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    productImageUrl: string;
    productKind?: 'packaged' | 'apparel' | 'object';
    title?: string;
    brief?: string;
    safe?: boolean;
  };
  const kind = body.productKind ?? 'packaged';
  const brief = body.safe ? safeCompositionBrief(kind, body.title) : body.brief ?? '';
  const prompt = buildMetaAdCreativePrompt({
    context: { title: body.title },
    angle: { name: 'Test frame', scene: brief, brief, modelledOn: body.safe ? 'Safe composition' : 'Test', withText: false },
    withText: false,
    productKind: kind,
  });
  const started = Date.now();
  try {
    const result = await runImageGeneration({
      mode: 'generate',
      referenceImages: [body.productImageUrl],
      prompt,
      model: 'nano-banana-pro',
      aspectRatio: '9:16',
      resolution: '2K',
      persistToGenerationsTable: false,
      referencePolicy: 'product-lock',
    });
    return NextResponse.json({ ms: Date.now() - started, url: result.images[0] });
  } catch (error) {
    return NextResponse.json({ ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
