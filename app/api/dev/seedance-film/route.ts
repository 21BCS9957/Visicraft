import { NextRequest, NextResponse } from 'next/server';
import { buildSeedanceReferences, type ReferenceImage } from '@/lib/server/referenceImages';
import { compileSeedanceFilm, writeSeedanceFilm } from '@/lib/server/seedanceFilm';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/referenceVideos';
import type { ReferenceFrame } from '@/lib/server/videoWriter';
import type { VideoStyle } from '@/lib/videoStyles';

export const maxDuration = 300;

/**
 * Development-only: the Seedance 2.x reference film the pipeline would propose for these
 * product photos (people-free references, then Claude Opus 5.5's shot list and the exact
 * prompt), without rendering anything. Pass referenceDesigns (as Gemini watched the reference
 * videos) and referenceFrames to see Claude turn a reference's sequence into the film, and
 * sceneImages to let it ask for scene images (they are only listed here, not made).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    imageUrls?: string[];
    productContext?: ShopifyProductContext;
    style?: VideoStyle;
    durationSeconds?: number;
    /** The video's shape (9:16 unless given). */
    aspectRatio?: string;
    apparel?: boolean;
    referenceDesigns?: AdDesign[];
    referenceFrames?: ReferenceFrame[];
    sceneImages?: boolean;
    adPatterns?: string;
    guidelines?: string;
    userDirection?: string;
    /** People-free references given directly, skipping the Gemini check (tests Claude alone). */
    references?: ReferenceImage[];
    /** The references show the product on a display mannequin. */
    onMannequin?: boolean;
    sensitive?: boolean;
  };
  if (!body.imageUrls?.length && !body.references?.length) return NextResponse.json({ error: 'imageUrls or references is required' }, { status: 400 });
  const started = Date.now();
  const found = body.references?.length
    ? { references: body.references }
    : await buildSeedanceReferences(body.imageUrls ?? [], { garment: body.apparel === true });
  const durationSeconds = body.durationSeconds ?? 15;
  if (found.references.length === 0) return NextResponse.json({ references: [], note: 'No people-free view of the product was found.' });
  const written = await writeSeedanceFilm({
    context: body.productContext,
    durationSeconds,
    aspectRatio: body.aspectRatio,
    style: body.style ?? 'cinematic',
    productKind: body.apparel ? 'apparel' : 'object',
    referenceDesigns: body.referenceDesigns,
    referenceFrames: body.referenceFrames,
    allowSceneImages: body.sceneImages === true,
    adPatterns: body.adPatterns,
    guidelines: body.guidelines,
    userDirection: body.userDirection,
    onMannequin: body.onMannequin,
    sensitive: body.sensitive,
    references: found.references,
  });
  return NextResponse.json({
    seconds: Math.round((Date.now() - started) / 1000),
    references: found.references,
    style: written.style,
    writer: written.writer,
    usage: written.usage,
    film: written.film,
    prompt: compileSeedanceFilm(written.film, { durationSeconds, aspectRatio: body.aspectRatio, opening: false, family: '2.5', audio: true, mannequin: body.onMannequin, sensitive: body.sensitive }),
  });
}
