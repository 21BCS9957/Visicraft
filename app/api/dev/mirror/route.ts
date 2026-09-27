import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductIdentity, validateProductIdentity } from '@/lib/banana/api';
import { runImageGeneration } from '@/lib/server/imageGeneration';
import { buildMetaAdCreativePrompt, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import { writePromptsFromWinners } from '@/lib/server/winnerPrompts';
import { judgeAdCreative } from '@/lib/server/adJudge';
import { heroFrameDirection, resolveVideoStyle } from '@/lib/server/videoStoryboard';
import { cropGarmentDetails, describeGarmentSpec } from '@/lib/server/productSpec';
import { buildExactCanvas, exactCanvasPrompt } from '@/lib/server/exactFrame';
import { trimPaddedBands } from '@/lib/server/paddedBands';
import type { VideoStyle } from '@/lib/videoStyles';

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
    /** Video hero frame: extra staging direction, no text, fixed 9:16. */
    userDirection?: string;
    videoFrame?: boolean;
    /** Video hero frame staged for this style, as the generate route does. */
    videoStyle?: VideoStyle;
    /** Judge this already rendered image instead of rendering a new one. */
    existingImageUrl?: string;
    /** All store photos: identity analysis picks the canonical and close-ups, as the route does, and the product check runs. */
    storeImageUrls?: string[];
    /** Stop after the identity analysis. */
    identityOnly?: boolean;
    /** Exact-garment test: edit the main store photo into this setting (person and garment kept). */
    exactEditSetting?: string;
    /** Exact-garment edit driven by a creative's JSON shot spec, as the generate route does. */
    exactShot?: Record<string, unknown>;
    /** Hand-made exact edit: this store photo as the base, this prompt, this resolution. */
    exactBaseUrl?: string;
    exactPrompt?: string;
    resolution?: string;
  };
  const started = Date.now();
  const direction = [body.userDirection, body.videoStyle ? heroFrameDirection(resolveVideoStyle(body.videoStyle), body.productKind) : '']
    .filter(Boolean)
    .join('\n') || undefined;
  try {
    // As the generate route: canonical + close-up views from the store photos, then the product check.
    const identity = body.storeImageUrls?.length ? await analyzeProductIdentity(body.storeImageUrls) : null;
    const canonical = identity && body.storeImageUrls ? body.storeImageUrls[identity.canonicalReferenceIndex] : body.productImageUrl;
    const storeDetails = identity && body.storeImageUrls ? identity.detailReferenceIndexes.map((i) => body.storeImageUrls![i]) : [];
    const crops = identity?.productKind === 'apparel' && storeDetails.length < 2 ? (await cropGarmentDetails(canonical, 2 - storeDetails.length)).crops : [];
    const details = [...storeDetails, ...crops.map((c) => c.url)];
    const productRefs = [canonical, ...details];
    const spec = identity?.productKind === 'apparel'
      ? await describeGarmentSpec(productRefs, identity.manifest, ['main photo', ...storeDetails.map(() => 'store close-up'), ...crops.map((c) => `enlarged crop of the ${c.piece}`)])
      : null;
    if (body.identityOnly) {
      return NextResponse.json({ canonical, details, crops, productKind: identity?.productKind, manifest: identity?.manifest, spec });
    }
    if ((body.exactEditSetting || body.exactShot || body.exactPrompt || body.exactBaseUrl) && identity) {
      // As the generate route: the base photo at its own scale on a 9:16 canvas, strips painted.
      const base = body.exactBaseUrl ?? (body.storeImageUrls?.[identity.heroReferenceIndex] ?? canonical);
      const canvas = body.exactPrompt ? { url: base, padded: false } : await buildExactCanvas(base, '9:16');
      const setting = typeof body.exactShot?.setting === 'string' ? body.exactShot.setting : body.exactEditSetting;
      const edited = await runImageGeneration({
        mode: 'generate',
        referenceImages: [canvas.url],
        prompt: body.exactPrompt ?? exactCanvasPrompt({ padded: canvas.padded, garment: spec?.signature.join('; '), setting }),
        model: 'nano-banana-pro',
        aspectRatio: '9:16',
        resolution: body.resolution ?? '2K',
        persistToGenerationsTable: false,
        referencePolicy: 'subject-lock',
      });
      let editedUrl = edited.images[0];
      const trimmed = editedUrl ? await trimPaddedBands(editedUrl) : null;
      if (trimmed?.trimmed) editedUrl = trimmed.url;
      const check = editedUrl
        ? await validateProductIdentity(base, editedUrl, identity.manifest, {
            productKind: identity.productKind,
            detailImageUrls: details,
            garmentChecks: spec ? { signature: spec.signature, never: spec.never } : undefined,
          })
        : undefined;
      return NextResponse.json({
        ms: Date.now() - started,
        url: editedUrl,
        spec: spec ? { signature: spec.signature, never: spec.never } : undefined,
        bands: trimmed?.bands,
        check: check ? { passed: check.passed, score: check.score, checks: check.checks, reason: check.reason } : undefined,
      });
    }
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
      productImageUrl: canonical,
      context: body.context,
      identityManifest: identity?.manifest,
      productKind: identity?.productKind ?? body.productKind,
      userDirection: direction,
      productSpec: spec?.json,
    });
    if (written.failed) throw new Error('Prompt writer failed');
    const styled = body.styleReference !== false;
    const angle = styled ? written.angles[0] : { ...written.angles[0], referenceImage: undefined };
    const withText = body.videoFrame ? false : Boolean(angle.withText);
    const prompt = buildMetaAdCreativePrompt({ context: body.context, angle, withText, userDirection: direction, identityManifest: identity?.manifest, productKind: identity?.productKind ?? body.productKind, productSpec: spec?.json });
    const writtenMs = Date.now() - started;
    const result = body.existingImageUrl ? { images: [body.existingImageUrl] } : await runImageGeneration({
      mode: 'generate',
      referenceImages: styled ? [...productRefs, body.winnerImageUrl] : productRefs,
      prompt,
      model: 'nano-banana-pro',
      aspectRatio: body.videoFrame ? '9:16' : angle.aspectRatio ?? '9:16',
      resolution: '2K',
      persistToGenerationsTable: false,
      referencePolicy: styled ? 'product-plus-style' : 'product-lock',
    });
    const url = result.images[0];
    const check = identity && url
      ? await validateProductIdentity(canonical, url, identity.manifest, {
          productKind: identity.productKind,
          detailImageUrls: details,
          garmentChecks: spec ? { signature: spec.signature, never: spec.never } : undefined,
        })
      : undefined;
    const verdict = body.judge && url
      ? await judgeAdCreative({ imageUrl: url, context: body.context, angle, withText, productKind: body.productKind, referenceImageUrl: styled ? body.winnerImageUrl : undefined, videoStyle: body.videoStyle ? resolveVideoStyle(body.videoStyle) : undefined })
      : undefined;
    return NextResponse.json({
      ms: Date.now() - started,
      writtenMs,
      url,
      angle,
      prompt,
      verdict,
      identity: identity ? { canonical, details, productKind: identity.productKind } : undefined,
      spec: spec ? { signature: spec.signature, never: spec.never, json: spec.json } : undefined,
      check: check ? { passed: check.passed, score: check.score, checks: check.checks, reason: check.reason } : undefined,
    });
  } catch (error) {
    return NextResponse.json({ ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
