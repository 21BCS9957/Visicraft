import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductIdentity, validateProductIdentity } from '@/lib/banana/api';
import { buildExactCanvas, closestFormat, extendCanvasPrompt, mannequinPrompt } from '@/lib/server/exactFrame';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { inspectReferenceImages } from '@/lib/server/referenceImages';

export const maxDuration = 300;

/**
 * Development-only: the hero frame the pipeline makes for intimate wear worn by a model — the
 * store photo with its model turned into a mannequin, at the photo's own shape (and with
 * `extend`, taken to 9:16 for first-frame engines) — with the same product check and person
 * check the pipeline runs. Nothing is charged.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as { imageUrls?: string[]; extend?: boolean };
  const imageUrls = body.imageUrls ?? [];
  if (!imageUrls.length) return NextResponse.json({ error: 'imageUrls is required' }, { status: 400 });
  const started = Date.now();
  try {
    const identity = await analyzeProductIdentity(imageUrls);
    const heroBase = imageUrls[identity.heroReferenceIndex] ?? imageUrls[identity.canonicalReferenceIndex] ?? imageUrls[0];
    const format = await closestFormat(heroBase);
    const generated = await runImageGeneration({
      mode: 'generate',
      referenceImages: [heroBase],
      prompt: mannequinPrompt({}),
      model: 'nano-banana-pro',
      aspectRatio: format,
      resolution: '2K',
      persistToGenerationsTable: false,
      referencePolicy: 'balanced',
    });
    const url = generated.images[0];
    if (!url) return NextResponse.json({ error: 'No image returned', ms: Date.now() - started }, { status: 502 });
    const detailViews = identity.detailReferenceIndexes.map((i) => imageUrls[i]).filter((u): u is string => Boolean(u) && u !== heroBase);
    const [check, people] = await Promise.all([
      validateProductIdentity(heroBase, url, identity.manifest, { overlayTextExpected: false, productKind: identity.productKind, detailImageUrls: detailViews }),
      inspectReferenceImages([url]),
    ]);
    // What a first-frame engine (Veo, Seedance 1.x) gets: the frame extended to 9:16.
    let extendedUrl: string | null = null;
    if (body.extend && format !== '9:16') {
      const tall = await buildExactCanvas(url, '9:16');
      const extended = await runImageGeneration({
        mode: 'generate',
        referenceImages: [tall.url],
        prompt: extendCanvasPrompt(),
        model: 'nano-banana-pro',
        aspectRatio: '9:16',
        resolution: '2K',
        persistToGenerationsTable: false,
        referencePolicy: 'balanced',
      });
      extendedUrl = extended.images[0] ?? null;
    }
    return NextResponse.json({
      ms: Date.now() - started,
      productKind: identity.productKind,
      onModel: identity.onModel,
      sensitive: identity.sensitive,
      heroBase,
      format,
      url,
      extendedUrl,
      productCheck: { passed: check.passed, score: check.score, reason: check.reason },
      personLeft: people.images[0]?.person ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, { status: 500 });
  }
}
