import { NextRequest, NextResponse } from 'next/server';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { compositeProduct, cutoutProduct, locateProduct } from '@/lib/server/productComposite';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';
import { submitVeoJob } from '@/lib/server/veo';

/**
 * Development-only harness: a person (reference photo) using the product, as a
 * product-locked video. Hero frame from Gemini 3 Pro Image with both references,
 * real product pixels pasted in, storyboard, then Veo animates the frame.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    personImageUrl: string;
    productImageUrl: string;
    productContext?: { title?: string; vendor?: string; description?: string };
    scene?: string;
    direction?: string;
    durationSeconds?: number;
    skipVideo?: boolean;
  };
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string, t: number) => { timings[label] = Date.now() - t; };
  try {
    const title = body.productContext?.title || 'the product';
    const scene = body.scene || 'a calm, softly lit modern Indian living room in late-afternoon light';

    // 1. Hero frame: the person + the product, composed by the image model.
    let t = Date.now();
    const heroPrompt = `Create one finished, photoreal 9:16 vertical Meta ad frame.

REFERENCE IMAGE 1 is a real person and the subject of this ad. Keep their identity exactly: face, skin tone, hair, beard, body build, and their outfit (the same shirt and trousers). Do not beautify, slim, age or restyle them. Natural, relaxed, genuine expression; correct hands.
REFERENCE IMAGE 2 is the product package (${title}). Copy it exactly; it is placed in the scene, never redrawn.

Scene: ${scene}. The person from reference 1 sits comfortably, holding a clear glass cup of vivid blue butterfly-pea tea in both hands close to their chest, a moment before sipping, eyes soft, a hint of a smile. On the table in front of them, the product package from reference 2 stands upright, front-facing, fully visible and unobstructed, roughly one third of the frame height, with a true contact shadow. A small saucer or a few dried blue flowers may sit nearby; nothing covers the package.

Photography: 50mm lens, shallow but believable depth of field, one motivated window key light with soft fill, honest colour, fine grain; premium D2C campaign look, not stock. Keep the top 14% and bottom 20% of the frame free of the face and package. No text, logos, captions or graphics anywhere. Output only the image.`;
    const hero = await runImageGeneration({
      mode: 'generate',
      referenceImages: [body.personImageUrl, body.productImageUrl],
      prompt: heroPrompt,
      model: 'nano-banana-pro',
      aspectRatio: '9:16',
      resolution: '2K',
      persistToGenerationsTable: false,
      referencePolicy: 'balanced',
    });
    mark('heroMs', t);
    const heroRaw = hero.images[0];
    if (!heroRaw) throw new Error('No hero frame generated');

    // 2. Paste the real product pixels over the model's rendition.
    t = Date.now();
    const cut = await cutoutProduct(body.productImageUrl);
    let heroFinal = heroRaw;
    let composited = false;
    if (cut.cutout) {
      const located = await locateProduct(heroRaw);
      if (located.box) {
        heroFinal = await compositeProduct(heroRaw, cut.cutout, located.box);
        composited = true;
      }
    }
    mark('compositeMs', t);

    // 3. Storyboard + prompt for the video model.
    t = Date.now();
    const planned = await planVideoStoryboard({
      context: body.productContext,
      userDirection: body.direction || `The person in the first frame (keep their face, beard and outfit identical) lifts the glass cup, takes a slow, satisfying sip of the blue tea, closes their eyes for a beat, exhales and gives a small contented smile; the package stays on the table, unchanged and fully visible.`,
      durationSeconds: body.durationSeconds ?? 8,
    });
    mark('storyboardMs', t);

    // 4. Veo.
    let job: { operationName: string; model: string; provider: string } | null = null;
    if (!body.skipVideo) {
      t = Date.now();
      job = await submitVeoJob({
        imageUrl: heroFinal,
        prompt: planned.storyboard.prompt,
        negativePrompt: planned.storyboard.negativePrompt,
        aspectRatio: '9:16',
        duration: body.durationSeconds ?? 8,
      });
      mark('submitMs', t);
    }

    return NextResponse.json({
      totalMs: Date.now() - started,
      timings,
      heroRaw,
      heroFinal,
      composited,
      cutoutReason: cut.reason,
      storyboard: planned.storyboard,
      job,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), timings, ms: Date.now() - started }, { status: 500 });
  }
}
