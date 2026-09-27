import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeReferenceImages,
  runImageGeneration,
  type ImageGenMode,
} from '@/lib/server/imageGeneration';
import { analyzeProductIdentity, validateProductIdentity } from '@/lib/banana/api';
import {
  buildMetaAdCreativePrompt,
  CREATIVE_SLOTS,
  formatPrice,
  priceTier,
  safeCompositionBrief,
  type AdAngle,
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
import { planAdAngles } from '@/lib/server/adAngles';
import { writePromptsFromWinners } from '@/lib/server/winnerPrompts';
import { compositeProduct, compositeProductPerspective, cutoutProduct, locateProductQuad } from '@/lib/server/productComposite';
import { describeProductNiche, researchWinningAds, type AdDesign, type WinningAd } from '@/lib/server/metaAdResearch';
import { groundVideoStoryboard, heroFrameDirection, planVideoStoryboard, resolveVideoStyle } from '@/lib/server/videoStoryboard';
import { cropGarmentDetails, describeGarmentSpec } from '@/lib/server/productSpec';
import { trimPaddedBands } from '@/lib/server/paddedBands';
import { exactGarmentFramePrompt } from '@/lib/server/garmentRepair';
import { parseVideoStyle, videoStyleLabel, type VideoStyle } from '@/lib/videoStyles';
import { judgeAdCreative } from '@/lib/server/adJudge';
import { isVideoGenerationConfigured, resolveVeoModel, submitVeoJob } from '@/lib/server/veo';
import type { ProviderUsage } from '@/lib/server/usage';
import {
  deductCreditsForUser,
  estimateGoogleImageCostUsd,
  estimateGoogleVideoCostUsd,
  getServerVideoCreditCost,
  estimateGoogleProductAnalysisCostUsd,
  getServerImageCreditCost,
  logUsage,
  refundCreditsForUser,
  requireAuthenticatedUser,
  sumUsage,
} from '@/lib/server/usage';

const MAX_ATTEMPTS_PER_SLOT = 3;
const REQUEST_BUDGET_MS = 280_000;
const MIN_TIME_FOR_ATTEMPT_MS = 75_000;
// A video renders one frame and writes its storyboard in parallel, so an attempt needs less headroom.
const MIN_TIME_FOR_VIDEO_ATTEMPT_MS = 55_000;

const MODES: ImageGenMode[] = ['generate', 'thumbnail', 'edit', 'upscale', 'unblur'];

export const maxDuration = 300;

function parseMode(raw: unknown): ImageGenMode {
  if (typeof raw === 'string' && MODES.includes(raw as ImageGenMode)) {
    return raw as ImageGenMode;
  }
  return 'generate';
}

function readProductContext(raw: unknown): ShopifyProductContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const price = Number(value.price);
  return {
    title: typeof value.title === 'string' ? value.title : undefined,
    vendor: typeof value.vendor === 'string' ? value.vendor : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    currency: typeof value.currency === 'string' && /^[A-Za-z]{3}$/.test(value.currency) ? value.currency.toUpperCase() : undefined,
  };
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let chargedCredits = 0;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const mode = parseMode(body.mode);

    const referenceImages = normalizeReferenceImages(body);
    if (referenceImages.length === 0) {
      return NextResponse.json(
        { error: 'At least one image (referenceImages or legacy referenceImage/sourceImages/imageUrl) is required' },
        { status: 400 }
      );
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt : undefined;
    const model = typeof body.model === 'string' ? body.model : undefined;
    const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;
    const resolution = typeof body.resolution === 'string' ? body.resolution : undefined;
    const creativeSet = body.creativeSet === true && mode === 'generate';
    const productContext = readProductContext(body.productContext);
    // Video ad: one clean hero frame (real product pasted in) + one Veo clip animated from it.
    const videoAd = creativeSet && body.videoAd === true;
    const videoModel = resolveVeoModel(typeof body.videoModel === 'string' ? body.videoModel : undefined);
    const videoDurationSeconds = 8;
    const perImageCost = getServerImageCreditCost(mode, model, resolution);
    const videoCost = videoAd ? getServerVideoCreditCost({ model: videoModel, duration: `${videoDurationSeconds}s` }) : 0;
    const creditCost = videoAd
      ? perImageCost + videoCost
      : creativeSet
        ? perImageCost * CREATIVE_SLOTS.length
        : perImageCost;
    const deducted = await deductCreditsForUser(user.id, creditCost);

    if (!deducted) {
      return NextResponse.json(
        { error: `Insufficient credits. Need ${creditCost} credits.` },
        { status: 402 }
      );
    }

    chargedUserId = user.id;
    chargedCredits = creditCost;

    if (creativeSet) {
      // Ownership of the charge moves into the stream, which refunds unfilled slots itself.
      chargedUserId = null;
      chargedCredits = 0;
      return streamCreativeSet({
        user,
        mode,
        referenceImages,
        userDirection: prompt,
        model,
        resolution,
        productContext,
        adPatterns: typeof body.adPatterns === 'string' ? body.adPatterns.slice(0, 2500) : undefined,
        research: body.research === true,
        country: typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : 'IN',
        video: videoAd
          ? { model: videoModel, durationSeconds: videoDurationSeconds, cost: videoCost, style: parseVideoStyle(body.videoStyle) ?? 'any' }
          : undefined,
        perImageCost,
        creditCost,
      });
    }

    const generated = await runImageGeneration({
      mode,
      referenceImages,
      prompt,
      model,
      aspectRatio,
      resolution,
      persistToGenerationsTable: mode === 'generate',
      userId: user.id,
    });
    const estimatedCostUsd = estimateGoogleImageCostUsd({
      model: generated.usage.providerModel || model,
      resolution: resolution || '2K',
      imageCount: generated.images.length,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
    });

    await logUsage({
      user,
      model: generated.usage.providerModel || model || 'nano-banana-pro',
      feature: 'image_generation',
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens,
      imageCount: generated.images.length,
      estimatedCostUsd,
      creditCost,
      metadata: {
        mode,
        creativeSet: false,
        uiModel: model || 'nano-banana-pro',
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '2K',
        referenceCount: referenceImages.length,
        chargedServerSide: true,
      },
    });

    return NextResponse.json({
      success: true,
      images: generated.images,
      usage: {
        ...generated.usage,
        estimatedCostUsd,
        creditsDeducted: creditCost,
      },
    });
  } catch (error) {
    if (chargedUserId && chargedCredits > 0) {
      await refundCreditsForUser(chargedUserId, chargedCredits);
    }
    console.error('Generation error:', error);
    const message = error instanceof Error ? error.message : 'Generation failed';
    const status = message.includes('Authentication required')
      ? 401
      : message.includes('required') || message.includes('prompt')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

type AuthenticatedUser = Awaited<ReturnType<typeof requireAuthenticatedUser>>;

/** The user-facing reason when no creative survived, based on why each one failed. */
function failureSummary(
  reasons: Array<'product' | 'generation' | 'safety' | 'quality'>,
  verifierErrors: number,
  productKind: 'packaged' | 'apparel' | 'object',
  video: boolean,
  /** What the product check found on the last rejected render, in its own words. */
  lastProductIssue?: string
): string {
  const what = video ? 'the hero frame for your video' : 'any creative';
  const found = lastProductIssue ? ` The last check found: ${lastProductIssue.replace(/\s+/g, ' ').trim().slice(0, 220)}` : '';
  const count = (r: string) => reasons.filter((x) => x === r).length;
  if (reasons.length === 0 || (verifierErrors > 0 && count('product') === reasons.length)) {
    return 'The product check service was unavailable, so nothing could be verified. Your credits were refunded; please try again in a minute.';
  }
  if (count('safety') >= Math.ceil(reasons.length / 2)) {
    return `Google's image safety filter blocked ${what}, including a still-life version without a person. Your credits were refunded. ${productKind === 'apparel' ? 'Intimate-wear products trip this filter often; a product photo on a hanger or flat lay (no model) as the first store image usually gets through.' : 'Try again, or add a direction in the prompt box that keeps the scene simple.'}`;
  }
  if (count('generation') >= Math.ceil(reasons.length / 2)) {
    return `Image generation failed for ${what} (the model returned no image). Your credits were refunded; please try again.`;
  }
  if (count('quality') >= Math.ceil(reasons.length / 2)) {
    return `No version of ${what} passed our creative review. Your credits were refunded; try again or add a direction in the prompt box.`;
  }
  return productKind === 'apparel'
    ? `Every version of ${what} changed the garment, so nothing was kept and your credits were refunded.${found} Close-up store photos of the fabric, border and blouse help the model copy fine patterns exactly.`
    : `Every version of ${what} changed the product packaging, so nothing was kept and your credits were refunded.${found} A clear, front-facing product image helps.`;
}

/** The identity-defining details from the product manifest, for the "locked" chips in the UI. */
function lockedElements(manifest: string): string[] {
  const lines = manifest.split(/\n+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean);
  const start = lines.findIndex((l) => /forbidden|do not change|must not change|never change/i.test(l));
  const picked = (start >= 0 ? lines.slice(start + 1) : lines.filter((l) => /logo|text|word|colou?r|badge|label|silhouette|shape/i.test(l))).slice(0, 5);
  return picked.map((l) => l.slice(0, 90));
}

interface CreativeSetOptions {
  user: AuthenticatedUser;
  mode: ImageGenMode;
  referenceImages: string[];
  userDirection?: string;
  model?: string;
  resolution?: string;
  productContext?: ShopifyProductContext;
  adPatterns?: string;
  /** Run Meta winning-ad research inside the stream (overlaps product analysis). */
  research?: boolean;
  country?: string;
  /** Present for a video ad: one hero frame is generated, then animated with Veo in the chosen style. */
  video?: { model: string; durationSeconds: number; cost: number; style: VideoStyle };
  perImageCost: number;
  creditCost: number;
}

/**
 * Generates the 4-slot Meta ad set and streams NDJSON events as each slot passes
 * the product-identity check. Failed slots are repaired, then regenerated, before
 * giving up; unfilled slots are refunded.
 */
function streamCreativeSet(options: CreativeSetOptions): Response {
  const { user, mode, referenceImages, userDirection, model, resolution, productContext, research, country, video, perImageCost, creditCost } = options;
  // A video ad needs exactly one clean frame; use the clean "lifestyle" slot as the hero.
  const slotIndexes = video ? [2] : CREATIVE_SLOTS.map((_, index) => index);
  const researchMediaType = video ? 'video' as const : 'image' as const;
  let adPatterns = options.adPatterns;
  let winningDesigns: AdDesign[] = [];
  let winnerImages: string[] = [];
  let winnerAds: WinningAd[] = [];
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  const minTimeForAttempt = video ? MIN_TIME_FOR_VIDEO_ATTEMPT_MS : MIN_TIME_FOR_ATTEMPT_MS;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const generationUsages: ProviderUsage[] = [];
      const analysisUsages: ProviderUsage[] = [];
      const validationScores: Array<{ slot: number; attempt: number; score: number; passed: boolean; checks: Record<string, boolean>; composited: boolean; reason: string }> = [];
      let billedImageCount = 0;
      let acceptedCount = 0;
      let verifierErrors = 0;
      const acceptedUrls = new Map<number, string>();
      const slotFailReasons = new Map<number, 'product' | 'generation' | 'safety' | 'quality'>();
      let videoCreditsRefunded = 0;

      try {
        const stageStarted: Record<string, number> = {};
        const stage = (id: string, status: 'active' | 'done' | 'failed' | 'skipped', detail?: string, data?: unknown) => {
          if (status === 'active' && !stageStarted[id]) stageStarted[id] = Date.now();
          send({ type: 'stage', id, status, detail, data, elapsedMs: stageStarted[id] ? Date.now() - stageStarted[id] : undefined });
        };

        // 2. Understand the product: identity spec (what to lock) and niche/competitors, from the photos.
        stage('understand', 'active', 'Reading the product photos and listing');
        const nichePromise = productContext
          ? describeProductNiche(productContext, referenceImages.slice(0, 3), video?.style).catch((error: unknown) => {
              console.warn('Niche detection failed:', error);
              return null;
            })
          : Promise.resolve(null);

        // 3. Winning-ad research runs concurrently with product analysis and cutout.
        const researchPromise = research && productContext
          ? (async () => {
              const nicheInfo = await nichePromise;
              stage('research', 'active', 'Searching the Meta Ad Library', { scraped: 0, designed: 0, relevant: 0, winners: 0 });
              const styleName = video && video.style !== 'any' ? videoStyleLabel(video.style) : undefined;
              return researchWinningAds(productContext, researchMediaType, country ?? 'IN', {
                imageUrls: referenceImages.slice(0, 3),
                niche: nicheInfo ?? undefined,
                videoStyle: video?.style,
                onProgress: (progress) => {
                  if (progress.phase === 'scraped') stage('research', 'active', `${progress.scraped} ads scraped, ${progress.designed} designed creatives`, progress);
                  if (progress.phase === 'screened') stage('research', 'active', `${progress.relevant} sell the same category${styleName && progress.styled !== undefined ? `, ${progress.styled} look like ${styleName}` : ''}, ${progress.winners} winners`, progress);
                  if (progress.phase === 'analyzing') { stage('research', 'done', `${progress.winners} winners`, progress); stage('analyze', 'active', researchMediaType === 'video' ? 'Watching the winning videos' : 'Studying the winning ads'); }
                },
              })
                .then((result) => ({ result, error: null as Error | null }))
                .catch((error: unknown) => ({ result: null, error: error instanceof Error ? error : new Error('Ad research failed') }));
            })()
          : null;
        send({
          type: 'status',
          message: researchPromise
            ? 'Finding the longest-running ads in this niche and locking your product...'
            : 'Locking the exact product from your store images...',
        });
        const identity = await analyzeProductIdentity(referenceImages);
        const nicheInfo = await nichePromise;
        if (nicheInfo) analysisUsages.push(nicheInfo.usage);
        // Every prompt from here on positions the product at its category-relative tier.
        if (productContext && nicheInfo?.tier) productContext.tier = nicheInfo.tier;
        analysisUsages.push(identity.usage);
        const canonicalImage = referenceImages[identity.canonicalReferenceIndex] ?? referenceImages[0];
        // Closer store views (fabric, border, back): the image model copies fine detail from
        // them instead of inventing it, and the product check judges against them too.
        const detailImages = identity.detailReferenceIndexes
          .map((i) => referenceImages[i])
          .filter((url): url is string => Boolean(url) && url !== canonicalImage);
        // Garments with few store close-ups: enlarged crops of the pattern-carrying parts (blouse,
        // border, pallu) from the main photo, so their motifs can be read, copied and checked.
        const autoCrops = identity.productKind === 'apparel' && detailImages.length < 2
          ? await cropGarmentDetails(canonicalImage, 2 - detailImages.length).catch((error) => {
              console.warn('Garment detail crops failed:', error instanceof Error ? error.message : error);
              return null;
            })
          : null;
        if (autoCrops?.usage) analysisUsages.push(autoCrops.usage);
        const detailViews = [...detailImages, ...(autoCrops?.crops.map((c) => c.url) ?? [])];
        const productRefs = [canonicalImage, ...detailViews];
        console.log(`Product references: canonical #${identity.canonicalReferenceIndex + 1}${detailImages.length ? `, close-ups #${identity.detailReferenceIndexes.map((i) => i + 1).join(', #')}` : ', no close-ups in the store images'}${autoCrops?.crops.length ? `, enlarged crops: ${autoCrops.crops.map((c) => c.piece).join(', ')}` : ''}`);
        // Garments: an exact pattern spec (motifs, their size and arrangement, borders, colours)
        // for every prompt and for the product check; runs while research is still going.
        const garmentSpec = identity.productKind === 'apparel'
          ? await describeGarmentSpec(productRefs, identity.manifest, [
              'main photo',
              ...detailImages.map(() => 'store close-up'),
              ...(autoCrops?.crops.map((c) => `enlarged crop of the ${c.piece}`) ?? []),
            ]).catch((error) => {
              console.warn('Garment spec failed:', error instanceof Error ? error.message : error);
              return null;
            })
          : null;
        if (garmentSpec) {
          analysisUsages.push(garmentSpec.usage);
          console.log(`Garment spec: ${garmentSpec.signature.join('; ')} | never: ${garmentSpec.never.join('; ')}`);
        }

        // Real product pixels get pasted over the model's rendition so label text stays exact.
        // Only the analyzer's packshot is trusted as the paste source: other store images
        // may be infographics or lifestyle collages that merely contain a plain background.
        // Real pixels are pasted only for packaged goods; a garment on a body cannot be pasted.
        const cut: Awaited<ReturnType<typeof cutoutProduct>> = identity.productKind === 'packaged'
          ? await cutoutProduct(canonicalImage).catch((error) => {
              console.warn('Product cutout failed:', error);
              return { cutout: null, reason: 'error' };
            })
          : { cutout: null, reason: `${identity.productKind} product: no paste` };
        if (cut.usage) analysisUsages.push(cut.usage);
        const cutout = cut.cutout;
        console.log(cutout
          ? `Product cutout ready (${cutout.width}x${cutout.height}) from ${canonicalImage}`
          : `Cutout skipped (${cut.reason}); relying on model rendering for ${canonicalImage}`);
        stage('understand', 'done', nicheInfo ? `${nicheInfo.niche}` : 'Product identity locked', {
          canonicalImage,
          title: productContext?.title,
          brand: productContext?.vendor,
          niche: nicheInfo?.niche,
          price: formatPrice(productContext) || undefined,
          tier: priceTier(productContext),
          keywords: nicheInfo?.keywords ?? [],
          competitors: nicheInfo?.competitors ?? [],
          locked: lockedElements(identity.manifest),
          productPasted: Boolean(cutout),
          productKind: identity.productKind,
          sensitive: identity.sensitive,
        });
        if (!researchPromise) { stage('research', 'skipped', 'Research not requested'); stage('analyze', 'skipped'); }

        if (researchPromise) {
          const research = await researchPromise;
          if (research.result) {
            adPatterns = research.result.patterns;
            winningDesigns = research.result.designs;
            winnerImages = research.result.ads.map((ad) => ad.imageUrl).filter((url): url is string => Boolean(url));
            winnerAds = research.result.ads.filter((ad) => Boolean(ad.imageUrl));
            stage('analyze', 'done', `${research.result.designs.length} winning ${researchMediaType} ads broken down`, {
              designs: research.result.designs.map((d) => ({ pageName: d.pageName, format: d.format, hook: d.hook, daysRunning: d.daysRunning, sequence: d.sequence })),
            });
            send({
              type: 'research',
              research: {
                niche: research.result.niche,
                keywords: research.result.keywords,
                ads: research.result.ads,
                patterns: research.result.patterns,
                mock: research.result.mock,
                videoStyle: research.result.videoStyle,
                styleFallback: research.result.styleFallback,
              },
            });
            if (research.result.styleFallback && video) {
              send({ type: 'notice', message: `No long-running ${videoStyleLabel(video.style)} ads were confirmed in this niche, so the research follows the closest winning video ads; your video is still made in ${videoStyleLabel(video.style)} style.` });
            } else if (research.result.styleTierRelaxed && video) {
              send({ type: 'notice', message: `No ${research.result.tier ?? 'same-tier'} brands run ${videoStyleLabel(video.style)} ads in this niche, so the format comes from ${videoStyleLabel(video.style)} ads at other price points; your product keeps its premium look.` });
            }
            await logUsage({
              user,
              model: research.result.usage.providerModel || 'gemini-3.8-flash',
              feature: 'image_generation',
              inputTokens: research.result.usage.inputTokens,
              outputTokens: research.result.usage.outputTokens,
              totalTokens: research.result.usage.totalTokens,
              imageCount: 0,
              estimatedCostUsd: estimateGoogleProductAnalysisCostUsd({ ...research.result.usage, model: research.result.usage.providerModel }),
              creditCost: 0,
              metadata: {
                operation: 'meta_winning_ad_research',
                mediaType: researchMediaType,
                country: country ?? 'IN',
                niche: research.result.niche,
                keywords: research.result.keywords,
                adCount: research.result.ads.length,
                mock: research.result.mock,
                videoStyle: research.result.videoStyle ?? null,
                styleFallback: research.result.styleFallback ?? null,
              },
            }).catch((error) => console.error('Research usage logging failed:', error));
          } else {
            console.error('Ad research failed, continuing without it:', research.error);
            stage('research', 'failed', research.error?.message ?? 'Ad research failed');
            stage('analyze', 'skipped');
            send({ type: 'research_failed', message: research.error?.message ?? 'Ad research failed' });
          }
        }

        // Video: the style to make (the user's pick, or the top winner's for "any") stages the hero frame.
        const madeStyle = video ? resolveVideoStyle(video.style, winningDesigns, identity.sensitive) : undefined;
        if (video && identity.sensitive && (video.style === 'ugc' || video.style === 'talking_head' || video.style === 'demo')) {
          send({ type: 'notice', message: `The video model does not allow a person on screen with this product, so instead of ${videoStyleLabel(video.style)} you get a product-only film.` });
        }
        const creativeDirection = [userDirection, madeStyle ? heroFrameDirection(madeStyle, identity.productKind) : '']
          .filter(Boolean)
          .join('\n') || undefined;

        stage('plan', 'active', winnerAds.length
          ? `Writing ${video ? 'the hero-frame prompt' : 'a prompt from each winning ad'}`
          : (video ? 'Writing the hero-frame brief' : 'Writing four ad briefs'));
        send({ type: 'status', message: 'Planning four ad angles...', canonicalImage });
        // Winners available: each winning ad image → Gemini writes our prompt from it.
        // Otherwise the planner writes clean briefs from the product alone.
        let plan: { angles: AdAngle[] } = { angles: [] };
        if (winnerAds.length) {
          const written = await writePromptsFromWinners({
            winners: winnerAds,
            designs: winningDesigns,
            slots: slotIndexes,
            productImageUrl: canonicalImage,
            context: productContext,
            identityManifest: identity.manifest,
            productKind: identity.productKind,
            userDirection: creativeDirection,
            productSpec: garmentSpec?.json,
          });
          written.usages.forEach((u) => analysisUsages.push(u));
          plan = { angles: written.angles };
          if (written.failed === slotIndexes.length) {
            console.warn('Every winner prompt failed; falling back to the planner');
            plan = { angles: [] };
          }
        }
        if (plan.angles.length === 0) {
          const planned = await planAdAngles({
            context: productContext,
            identityManifest: identity.manifest,
            userDirection: creativeDirection,
            adPatterns,
            winningDesigns,
            winnerImages,
            productKind: identity.productKind,
          });
          if (planned.usage) analysisUsages.push(planned.usage);
          plan = { angles: planned.angles };
        }
        send({
          type: 'angles',
          angles: slotIndexes.map((index) => ({
            index,
            name: plan.angles[index].name,
            withText: plan.angles[index].withText ?? CREATIVE_SLOTS[index].withText,
            modelledOn: plan.angles[index].modelledOn,
            aspectRatio: video ? '9:16' : plan.angles[index].aspectRatio ?? '9:16',
          })),
        });
        stage('plan', 'done', slotIndexes.map((i) => plan.angles[i].name).join(' · '), {
          angles: slotIndexes.map((index) => ({
            index,
            name: plan.angles[index].name,
            promise: plan.angles[index].promise,
            headline: plan.angles[index].headline,
            subline: plan.angles[index].subline,
            kicker: plan.angles[index].kicker,
            cta: plan.angles[index].cta,
            withText: plan.angles[index].withText ?? CREATIVE_SLOTS[index].withText,
            modelledOn: plan.angles[index].modelledOn,
            referenceImage: plan.angles[index].referenceImage,
            brief: plan.angles[index].brief,
            shot: plan.angles[index].shot,
          })),
        });
        stage('generate', 'active', video ? 'Generating the hero frame' : `Generating ${slotIndexes.length} creatives with the real product locked in`, { passed: 0, withheld: 0 });
        send({ type: 'status', message: video ? 'Generating the hero frame for your video...' : 'Generating four Meta ad creatives...' });

        const produceSlot = async (index: number) => {
          const angle = plan.angles[index];
          const slot = { withText: video ? false : (angle.withText ?? CREATIVE_SLOTS[index].withText) };
          let failReason: 'product' | 'generation' | 'safety' | 'quality' = 'generation';
          let qualityRerolls = 0;
          let safetyBlocks = 0;
          let rejectedUrl: string | null = null;
          let critique: string | undefined;
          // After two safety-filter blocks, stop asking for the same kind of shot: switch to a
          // composition without a person, which the filter allows and still sells the product.
          const safeAngle = (): typeof angle => ({
            ...angle,
            name: `${angle.name} (still life)`,
            brief: safeCompositionBrief(identity.productKind, productContext?.title),
            modelledOn: angle.modelledOn ?? 'Safe composition',
            withText: false,
            headline: undefined,
            subline: undefined,
            kicker: undefined,
            cta: undefined,
            typography: undefined,
            // A person-free shot must not follow a reference built around a model.
            referenceImage: undefined,
          });
          // Video models refuse people in intimate wear, so a sensitive product's hero frame
          // starts as a still life rather than spending renders on a frame Veo will reject.
          const stillLife = () => safetyBlocks >= 2 || (Boolean(video) && identity.sensitive);
          const activeAngle = () => (stillLife() ? safeAngle() : angle);
          const promptFor = () => {
            const active = activeAngle();
            return buildMetaAdCreativePrompt({
              context: productContext,
              // A still life has no person, so it drops the style's staging of one.
              userDirection: stillLife() ? userDirection : creativeDirection,
              identityManifest: identity.manifest,
              angle: active,
              withText: stillLife() ? false : slot.withText,
              critique: safetyBlocks >= 2 ? undefined : critique,
              // A mirrored winner decides its own camera angle; the perspective paste follows it.
              frontalProduct: Boolean(cutout) && !active.modelledOn,
              productKind: identity.productKind,
              productSpec: garmentSpec?.json,
            });
          };

          // With the real product pasted in, a failure means occlusion or a bad box, so
          // one clean regeneration is enough; without it, allow a repair pass too. A garment
          // is never "repaired": editing the rejected frame drifts or pads it, so it gets a
          // fresh render told exactly what the product check found.
          const maxAttempts = cutout ? 2 : MAX_ATTEMPTS_PER_SLOT;
          // A garment worn in the store photo: editing that photo (new setting, same person and
          // garment) keeps the design exact, where a redrawn garment loses its weave. A video
          // starts that way; an image slot tries a fresh scene first, for variety, and switches
          // after a garment failure.
          const canExact = identity.productKind === 'apparel' && identity.onModel && !identity.sensitive;
          let exactNext = canExact && Boolean(video);
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0 && deadline - Date.now() < minTimeForAttempt) break;
            const exact = exactNext && !stillLife();
            const repair = !exact && !cutout && identity.productKind !== 'apparel' && attempt === 1 && rejectedUrl !== null;
            // An exact edit carries no ad copy.
            const withCopy = exact ? false : slot.withText;
            try {
              // Mirroring a winner: the image model sees our product (1) and the winning ad (2)
              // as a layout & style reference, and renders in the winner's format.
              const current = activeAngle();
              const styleRef = !repair && !exact && current.referenceImage ? current.referenceImage : undefined;
              const format = video ? '9:16' : current.aspectRatio ?? '9:16';
              if (exact) console.log(`Slot ${index + 1} attempt ${attempt + 1}: exact-garment edit of the store photo`);
              const generated = await runImageGeneration({
                mode,
                referenceImages: exact
                  ? [canonicalImage]
                  : repair
                    ? [canonicalImage, rejectedUrl as string]
                    : styleRef ? [...productRefs, styleRef] : productRefs,
                prompt: exact
                  ? exactGarmentFramePrompt({
                      shot: current.shot,
                      brief: current.brief,
                      format,
                      // Never tighter than the store photo: its pixels are all the detail there is.
                      framing: 'full length or three-quarter length, never tighter than image 1',
                    })
                  : promptFor(),
                model,
                aspectRatio: format,
                resolution,
                persistToGenerationsTable: false,
                referencePolicy: exact ? 'subject-lock' : repair ? 'product-repair' : styleRef ? 'product-plus-style' : 'product-lock',
                userId: user.id,
              });
              generationUsages.push(generated.usage);
              billedImageCount += generated.images.length;
              let imageUrl = generated.images[0];
              if (!imageUrl) continue;
              let composited = false;

              // The model sometimes keeps a reference photo's shape and fills the rest of the frame
              // with a blurred, stretched strip. Trim it back to full bleed; a frame with copy is
              // re-rendered instead, since trimming could cut the text.
              const padded = await trimPaddedBands(imageUrl).catch((error) => {
                console.warn(`Slot ${index + 1}: padded-band check failed:`, error);
                return null;
              });
              if (padded && (padded.trimmed || padded.tooLarge)) {
                const hasCopy = withCopy && !stillLife();
                console.log(`Slot ${index + 1} attempt ${attempt + 1}: padded band (top ${padded.bands.top.toFixed(2)}, bottom ${padded.bands.bottom.toFixed(2)}); ${padded.trimmed && !hasCopy ? 'trimmed' : 're-rendering'}`);
                if (padded.trimmed && !hasCopy) {
                  imageUrl = padded.url;
                } else {
                  failReason = 'quality';
                  critique = 'The previous render filled part of the frame with a blurred, stretched strip. Compose one new, full-bleed photograph that fills the whole frame edge to edge.';
                  send({ type: 'retry', index, attempt: attempt + 1, reason: 'quality' });
                  continue;
                }
              }

              const verify = (url: string) => validateProductIdentity(
                canonicalImage,
                url,
                identity.manifest,
                {
                  overlayTextExpected: withCopy,
                  productKind: identity.productKind,
                  detailImageUrls: detailViews,
                  garmentChecks: garmentSpec ? { signature: garmentSpec.signature, never: garmentSpec.never } : undefined,
                }
              ).catch((error) => {
                console.error(`Slot ${index + 1} verification failed:`, error);
                verifierErrors += 1;
                return null;
              });

              // The model's own rendering is the most natural result; keep it when the
              // packaging already passes. Paste real pixels only when it does not.
              let validation = await verify(imageUrl);
              if (validation) analysisUsages.push(validation.usage);
              if (validation && !validation.passed && cutout) {
                try {
                  const located = await locateProductQuad(imageUrl);
                  analysisUsages.push(located.usage);
                  if (located.quad) {
                    imageUrl = await compositeProductPerspective(imageUrl, cutout, located.quad);
                    composited = true;
                  } else if (located.box) {
                    imageUrl = await compositeProduct(imageUrl, cutout, located.box);
                    composited = true;
                  } else {
                    console.warn(`Slot ${index + 1}: product not located in generated image; keeping model rendering`);
                  }
                } catch (error) {
                  console.warn(`Slot ${index + 1}: compositing failed, keeping model rendering:`, error);
                }
                if (composited) {
                  console.log(`Slot ${index + 1} attempt ${attempt + 1}: render failed the product check (${validation.reason}); real product pasted in`);
                  validation = await verify(imageUrl);
                }
              }
              // The checker itself failed (not the image): retrying generation would only burn credits.
              if (!validation) break;
              if (validation) {
                validationScores.push({
                  slot: index + 1,
                  attempt: attempt + 1,
                  score: validation.score,
                  passed: validation.passed,
                  checks: validation.checks,
                  composited,
                  reason: validation.reason,
                });
              }

              if (validation?.passed) {
                // Product is right; now judge it as a media buyer would. One re-roll with fixes.
                const verdict = await judgeAdCreative({
                  imageUrl,
                  context: productContext,
                  angle: activeAngle(),
                  withText: stillLife() ? false : withCopy,
                  productKind: identity.productKind,
                  // An exact edit keeps the store photo's pose, so it is not judged on the winner's layout.
                  referenceImageUrl: exact ? undefined : activeAngle().referenceImage,
                  videoStyle: video && !stillLife() ? madeStyle : undefined,
                }).catch((error) => {
                  console.warn(`Slot ${index + 1} creative review unavailable:`, error);
                  return null;
                });
                if (verdict) {
                  analysisUsages.push(verdict.usage);
                  console.log(`Slot ${index + 1} attempt ${attempt + 1} review: ${verdict.score}/10`, verdict.scores, verdict.critical.length ? `critical: ${verdict.critical.join('; ')}` : '');
                }
                const canReroll = attempt < maxAttempts - 1 && deadline - Date.now() >= minTimeForAttempt;
                const hasDealBreaker = Boolean(verdict && verdict.critical.length > 0);
                // Deal-breakers (artifacts, duplicated heads, padded bands) are never kept; a merely
                // weak creative gets one re-roll and is kept after that. An exact-garment edit is
                // kept unless it has a deal-breaker: its product is the point.
                if (verdict && !verdict.passed && canReroll && (hasDealBreaker || (qualityRerolls < 1 && !exact))) {
                  qualityRerolls += 1;
                  critique = [verdict.critical.length ? `Deal-breakers: ${verdict.critical.join('; ')}.` : '', verdict.fixes].filter(Boolean).join(' ');
                  failReason = 'quality';
                  send({ type: 'retry', index, attempt: attempt + 1, reason: 'quality' });
                  continue;
                }
                if (hasDealBreaker) {
                  console.log(`Slot ${index + 1}: last attempt still has deal-breakers (${verdict?.critical.join('; ')}); not kept`);
                  failReason = 'quality';
                  break;
                }
                acceptedCount += 1;
                acceptedUrls.set(index, imageUrl);
                send({
                  type: 'creative',
                  index,
                  url: imageUrl,
                  angle: angle.name,
                  withText: withCopy,
                  attempts: attempt + 1,
                  score: verdict?.score,
                  exactGarment: exact,
                });
                return imageUrl;
              }
              rejectedUrl = imageUrl;
              failReason = 'product';
              console.log(`Slot ${index + 1} attempt ${attempt + 1}: product check failed (${validation.score}/100): ${validation.reason}`);
              // A redrawn garment that lost its design switches to the exact edit; if an exact
              // edit ever fails, the next attempt goes back to a fresh scene.
              exactNext = canExact && !exact;
              if (identity.productKind === 'apparel' && validation.reason) {
                critique = `The product check rejected the previous render because the garment changed: ${validation.reason} Copy every one of these details exactly from the product photos, and frame the garment no tighter than those photos show it.`;
              }
              send({ type: 'retry', index, attempt: attempt + 1 });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error(`Slot ${index + 1} attempt ${attempt + 1} failed:`, message);
              if (/safety|PROHIBITED_CONTENT|IMAGE_OTHER/i.test(message)) {
                // Re-roll with an explicitly tasteful direction; after a second block, promptFor()
                // switches to a composition without a person.
                failReason = 'safety';
                safetyBlocks += 1;
                if (safetyBlocks === 2) console.log(`Slot ${index + 1}: blocked twice by the safety filter; switching to a still-life composition`);
                critique = 'The previous version was blocked by the platform safety filter. Make it unmistakably tasteful editorial photography: adult model, natural relaxed posing, no suggestive gestures, no nudity, product fully shown; if in doubt, show less skin and more of the product and setting.';
                send({ type: 'retry', index, attempt: attempt + 1, reason: 'safety' });
              } else {
                failReason = 'generation';
              }
            }
          }

          slotFailReasons.set(index, failReason);
          send({ type: 'slot_failed', index, reason: failReason });
          return null;
        };

        // The storyboard does not depend on the hero frame, so it is written while the frame renders.
        const storyboardPromise = video
          ? planVideoStoryboard({
              context: productContext,
              identityManifest: identity.manifest,
              userDirection,
              adPatterns,
              winningDesigns,
              durationSeconds: video.durationSeconds,
              sensitive: identity.sensitive,
              style: video.style,
              productKind: identity.productKind,
              productSpec: garmentSpec?.json,
              never: garmentSpec?.never,
            })
          : null;

        await Promise.all(slotIndexes.map((index) => produceSlot(index)));

        const failedSlots = slotIndexes.length - acceptedCount;
        stage('generate', acceptedCount > 0 ? 'done' : 'failed', `${acceptedCount} of ${slotIndexes.length} passed the product check`, { passed: acceptedCount, withheld: failedSlots });
        if (failedSlots > 0) await refundCreditsForUser(user.id, perImageCost * failedSlots);

        // Video ad: storyboard modelled on the winning sequences, then animate the hero frame.
        let operationId: string | undefined;
        let videoWarning: string | undefined;
        if (video) {
          const heroUrl = acceptedUrls.get(slotIndexes[0]);
          let planned = await (storyboardPromise as NonNullable<typeof storyboardPromise>);
          if (planned.usage) analysisUsages.push(planned.usage);
          // Match the JSON prompt to the frame Veo will animate, when there is time for it.
          if (heroUrl && deadline - Date.now() > 40_000) {
            const grounded = await groundVideoStoryboard(planned.storyboard, {
              heroUrl,
              productSpec: garmentSpec?.json,
              never: garmentSpec?.never,
              sensitive: identity.sensitive,
              garment: identity.productKind === 'apparel',
            }).catch((error) => {
              console.warn('Video prompt grounding failed; using the draft:', error instanceof Error ? error.message : error);
              return null;
            });
            if (grounded) {
              planned = grounded;
              if (grounded.usage) analysisUsages.push(grounded.usage);
            }
          }
          console.log(`Veo prompt (${planned.storyboard.prompt.length} chars, ${planned.storyboard.promptJson ? 'JSON' : 'text'}): ${planned.storyboard.prompt.slice(0, 300)}…`);
          if (!heroUrl) {
            videoCreditsRefunded = video.cost;
            await refundCreditsForUser(user.id, video.cost);
          } else {
            stage('storyboard', 'active', 'Writing the storyboard from the winning video ads');
            send({ type: 'status', message: 'Writing the storyboard from the winning video ads...' });
            send({ type: 'storyboard', storyboard: planned.storyboard });
            stage('storyboard', 'done', planned.storyboard.hook, { storyboard: planned.storyboard });

            if (!isVideoGenerationConfigured()) {
              videoCreditsRefunded = video.cost;
              await refundCreditsForUser(user.id, video.cost);
              videoWarning = 'Video generation is not configured on this server yet (a GEMINI_API_KEY with billing, or GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON). The hero frame and storyboard were kept; video credits were refunded.';
              stage('render', 'skipped', 'Video generation not configured');
            } else {
              try {
                stage('render', 'active', 'Rendering with Veo');
                send({ type: 'status', message: 'Rendering your video with Veo...' });
                const job = await submitVeoJob({
                  imageUrl: heroUrl,
                  prompt: planned.storyboard.prompt,
                  negativePrompt: planned.storyboard.negativePrompt,
                  model: video.model,
                  aspectRatio: '9:16',
                  duration: `${video.durationSeconds}s`,
                });
                operationId = job.operationName;
                await logUsage({
                  user,
                  model: job.model,
                  feature: 'video_generation',
                  videoSeconds: video.durationSeconds,
                  estimatedCostUsd: estimateGoogleVideoCostUsd({ model: job.model, duration: `${video.durationSeconds}s`, numResults: 1 }),
                  creditCost: video.cost,
                  metadata: {
                    mode: 'product_video_ad',
                    operationId,
                    // What /api/video-status needs to retry a filtered take once, or refund it.
                    operationIds: [operationId],
                    heroUrl,
                    retries: 0,
                    sensitive: identity.sensitive,
                    videoStyle: video.style,
                    madeStyle: planned.storyboard.style ?? null,
                    aspectRatio: '9:16',
                    resolution: job.model.includes('veo-3') ? '1080p' : '720p',
                    metaAdResearch: Boolean(adPatterns),
                    modelledOn: planned.storyboard.modelledOn ?? null,
                    chargedServerSide: true,
                  },
                }).catch((error) => console.error('Video usage logging failed:', error));
                send({ type: 'video_submitted', operationId });
              } catch (error) {
                console.error('Veo submission failed:', error);
                videoCreditsRefunded = video.cost;
                await refundCreditsForUser(user.id, video.cost);
                videoWarning = `The video could not be started (${error instanceof Error ? error.message : 'unknown error'}). The hero frame was kept; video credits were refunded.`;
                stage('render', 'failed', error instanceof Error ? error.message : 'Veo submission failed');
              }
            }
          }
        }

        send({
          type: 'done',
          acceptedCount,
          operationId,
          creditsDeducted: perImageCost * acceptedCount + (video ? video.cost - videoCreditsRefunded : 0),
          warning: acceptedCount === 0
            ? failureSummary([...slotFailReasons.values()], verifierErrors, identity.productKind, Boolean(video), validationScores.filter((v) => !v.passed).at(-1)?.reason)
            : videoWarning
              ? videoWarning
              : failedSlots > 0
                ? `${acceptedCount} of ${slotIndexes.length} ads passed the product check. Credits for the other ${failedSlots} were refunded.`
                : undefined,
        });
      } catch (error) {
        console.error('Creative set error:', error);
        const unfilled = slotIndexes.length - acceptedCount;
        const pendingVideo = video ? video.cost - videoCreditsRefunded : 0;
        await refundCreditsForUser(user.id, perImageCost * unfilled + pendingVideo).catch(() => undefined);
        send({ type: 'error', message: error instanceof Error ? error.message : 'Generation failed' });
      } finally {
        await logCreativeSetUsage({
          user,
          model,
          resolution,
          mode,
          referenceCount: referenceImages.length,
          generationUsages,
          analysisUsages,
          billedImageCount,
          acceptedCount,
          perImageCost,
          creditCost,
          validationScores,
          researched: Boolean(adPatterns),
          videoCreditsKept: video ? video.cost - videoCreditsRefunded : 0,
        }).catch((error) => console.error('Usage logging failed:', error));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function logCreativeSetUsage(input: {
  user: AuthenticatedUser;
  model?: string;
  resolution?: string;
  mode: ImageGenMode;
  referenceCount: number;
  generationUsages: ProviderUsage[];
  analysisUsages: ProviderUsage[];
  billedImageCount: number;
  acceptedCount: number;
  perImageCost: number;
  creditCost: number;
  validationScores: unknown[];
  researched: boolean;
  videoCreditsKept: number;
}) {
  const analysis = sumUsage(input.analysisUsages);
  const analysisModel = input.analysisUsages[0]?.providerModel || 'gemini-2.5-flash';
  await logUsage({
    user: input.user,
    model: analysisModel,
    feature: 'image_generation',
    ...analysis,
    imageCount: 0,
    estimatedCostUsd: estimateGoogleProductAnalysisCostUsd({ ...analysis, model: analysisModel }),
    creditCost: 0,
    metadata: {
      operation: 'creative_set_analysis_and_validation',
      calls: input.analysisUsages.length,
      chargedServerSide: true,
    },
  });

  const usage = sumUsage(input.generationUsages);
  const providerModel = input.generationUsages[0]?.providerModel || input.model || 'nano-banana-pro';
  await logUsage({
    user: input.user,
    model: providerModel,
    feature: 'image_generation',
    ...usage,
    imageCount: input.billedImageCount,
    estimatedCostUsd: estimateGoogleImageCostUsd({
      model: providerModel,
      resolution: input.resolution || '2K',
      imageCount: input.billedImageCount,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    }),
    creditCost: input.perImageCost * input.acceptedCount,
    metadata: {
      mode: input.mode,
      creativeSet: true,
      metaAdResearch: input.researched,
      uiModel: input.model || 'nano-banana-pro',
      aspectRatio: '9:16',
      resolution: input.resolution || '2K',
      referenceCount: input.referenceCount,
      acceptedImageCount: input.acceptedCount,
      creditsCharged: input.creditCost,
      creditsRefunded: input.creditCost - input.perImageCost * input.acceptedCount - input.videoCreditsKept,
      validationScores: input.validationScores,
      chargedServerSide: true,
    },
  });
}
