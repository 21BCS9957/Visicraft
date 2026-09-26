import { NextRequest, NextResponse } from 'next/server';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { analyzePersonIdentity, validatePersonIdentity, type PersonVerdict } from '@/lib/server/personIdentity';
import { compositeProduct, cutoutProduct, locateProduct } from '@/lib/server/productComposite';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';
import { submitVeoJob } from '@/lib/server/veo';

const MAX_FRAME_ATTEMPTS = 3;

/**
 * Development-only harness: a real person using the product, as a product-locked
 * video. The person's photo is the base of an EDIT (identity spec from Gemini, face
 * verified against the photo, re-rolled on drift), the real product pixels are
 * pasted in, then a storyboard drives Veo from that frame.
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
    /** Default true: only swap the phone for tea and add the product; keep everything else. */
    minimalEdit?: boolean;
    /** Skip frame generation: storyboard + Veo straight from this approved frame. */
    fromHeroUrl?: string;
  };
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string, t: number) => { timings[label] = Date.now() - t; };
  const attempts: Array<{ url: string; verdict: PersonVerdict | null }> = [];
  try {
    const title = body.productContext?.title || 'the product';
    const scene = body.scene || 'a calm, softly lit modern Indian living room by a window in late-afternoon light';

    // 1. Identity spec written by Gemini from the photo.
    let t = Date.now();
    const identity = await analyzePersonIdentity(body.personImageUrl);
    mark('identityMs', t);

    if (body.fromHeroUrl) {
      const planned = await planVideoStoryboard({
        context: body.productContext,
        userDirection: `${body.direction || 'The person in the first frame lifts the glass cup, takes a slow, satisfying sip of the blue tea, closes their eyes for a beat, exhales and gives a small contented smile; the package stays on the table, unchanged and fully visible.'} The person must remain exactly the individual in the first frame throughout: ${identity.manifest.slice(0, 600)}`,
        durationSeconds: body.durationSeconds ?? 8,
      });
      const job = await submitVeoJob({
        imageUrl: body.fromHeroUrl,
        prompt: planned.storyboard.prompt,
        negativePrompt: planned.storyboard.negativePrompt,
        aspectRatio: '9:16',
        duration: body.durationSeconds ?? 8,
      });
      return NextResponse.json({ totalMs: Date.now() - started, heroFinal: body.fromHeroUrl, storyboard: planned.storyboard, job });
    }

    // 2. Edit the photo: same person, new setting, tea in hand, product on the table. Verify, re-roll on drift.
    let critique = '';
    void critique;
    let heroRaw: string | null = null;
    let verdict: PersonVerdict | null = null;
    for (let attempt = 0; attempt < MAX_FRAME_ATTEMPTS; attempt++) {
      t = Date.now();
      const heroPrompt = body.minimalEdit === false
        ? `PHOTO EDIT of reference image 1. Produce one finished, photoreal 9:16 vertical frame.

THE PERSON (immutable, from reference image 1). Identity spec, every item must hold in the result:
${identity.manifest}

CHANGES TO MAKE (and nothing else):
- Remove the phone and the mirror. Both hands now hold a clear glass cup of vivid, luminous blue butterfly-pea tea at chest height, a moment before sipping; natural relaxed expression, eyes open, looking just past the camera.
- Replace the background with: ${scene}. Seat the person naturally (sofa or chair), framed from mid-thigh up, facing the camera as in the photo.
- Place the product package from reference image 2 (${title}) on a table in front of them, standing upright, front-facing, fully visible, unobstructed, about one third of the frame height, with a true contact shadow.

KEEP: the exact face, hair, beard, skin tone, build, and the exact clothes with their exact print and graphics. Do not tidy, restyle, slim, brighten or "improve" the person. No text, logos, captions or graphics anywhere. Output only the image.`
        : `MINIMAL PHOTO EDIT of reference image 1. Keep the photograph exactly as it is: the same person with the same face, hair, beard, skin tone, body, pose, framing, lighting, the same plain lavender wall and floor, and the SAME SHIRT WITH ITS EXACT PRINT (the artwork, emblem and lettering on the shirt are copied pixel for pixel, not redrawn).

Make only these two changes:
1. The phone disappears. The raised hand instead holds a clear glass cup of vivid, luminous blue butterfly-pea tea, at the same height, fingers naturally around the glass; the other hand stays in the pocket; the face, now fully visible where the phone was, matches the identity spec below exactly.
2. A small, low wooden side table appears in the lower left of the frame, beside the person's leg, with the product package from reference image 2 (${title}) standing on it upright, front-facing, fully visible, unobstructed, about a quarter of the frame height, lit like the room, with a true contact shadow.

Identity spec (every item must hold):
${identity.manifest}

Photoreal, same camera and lens as the original, honest colour. No text, logos, captions or graphics added anywhere. Output only the image, 9:16.`;
      const hero = await runImageGeneration({
        mode: 'generate',
        referenceImages: [body.personImageUrl, body.productImageUrl],
        prompt: heroPrompt,
        model: 'nano-banana-pro',
        aspectRatio: '9:16',
        resolution: '2K',
        persistToGenerationsTable: false,
        referencePolicy: 'subject-lock',
      });
      mark(`heroMs_${attempt + 1}`, t);
      const url = hero.images[0];
      if (!url) continue;

      t = Date.now();
      verdict = await validatePersonIdentity(body.personImageUrl, url, identity.manifest).catch((error) => {
        console.warn('Person verification failed:', error);
        return null;
      });
      mark(`verifyMs_${attempt + 1}`, t);
      attempts.push({ url, verdict });
      heroRaw = url;
      if (!verdict || verdict.passed) break;
      // Feeding the critique back made the model drift further; fresh samples do better.
      critique = '';
    }
    if (!heroRaw) throw new Error('No hero frame generated');

    // Best attempt if none passed: highest score.
    const best = attempts.reduce((acc, cur) => ((cur.verdict?.score ?? 0) > (acc.verdict?.score ?? 0) ? cur : acc), attempts[0]);
    heroRaw = best.url;
    verdict = best.verdict;

    // 3. Paste the real product pixels over the model's rendition.
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

    // 4. Storyboard, carrying the identity spec so the video keeps the person too.
    t = Date.now();
    const planned = await planVideoStoryboard({
      context: body.productContext,
      userDirection: `${body.direction || 'The person in the first frame lifts the glass cup, takes a slow, satisfying sip of the blue tea, closes their eyes for a beat, exhales and gives a small contented smile; the package stays on the table, unchanged and fully visible.'} The person must remain exactly the individual in the first frame throughout: ${identity.manifest.slice(0, 600)}`,
      durationSeconds: body.durationSeconds ?? 8,
    });
    mark('storyboardMs', t);

    // 5. Veo, only from a frame that passed the identity check.
    let job: { operationName: string; model: string; provider: string } | null = null;
    let videoSkipped: string | undefined;
    if (body.skipVideo) {
      videoSkipped = 'skipVideo requested';
    } else if (verdict && !verdict.passed) {
      videoSkipped = `identity check did not pass (score ${verdict.score}); frame returned for review instead of spending a render`;
    } else {
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
      identityManifest: identity.manifest,
      attempts: attempts.map((a) => ({ url: a.url, score: a.verdict?.score, passed: a.verdict?.passed, checks: a.verdict?.checks, reason: a.verdict?.reason })),
      heroRaw,
      heroFinal,
      composited,
      cutoutReason: cut.reason,
      storyboard: planned.storyboard,
      job,
      videoSkipped,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), timings, attempts, ms: Date.now() - started }, { status: 500 });
  }
}
