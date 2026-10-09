import { NextRequest, NextResponse } from 'next/server';
import { FOUR_K_OFF } from '@/lib/playground/models';
import {
  normalizeReferenceImages,
  runImageGeneration,
  type ImageGenMode,
} from '@/lib/server/imageGeneration';
import { analyzeProductIdentity, validateProductIdentity } from '@/lib/banana/api';
import {
  adCopyBlock,
  buildMetaAdCreativePrompt,
  CREATIVE_SLOTS,
  formatPrice,
  priceTier,
  safeCompositionBrief,
  sceneStillPrompt,
  type AdAngle,
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
import { planAdAngles } from '@/lib/server/adAngles';
import { compositeProduct, compositeProductPerspective, cutoutProduct, locateProductQuad } from '@/lib/server/productComposite';
import {
  analyzeReferenceVideo,
  loadLibraryVideos,
  referenceFramesFor,
  saveReferenceAnalysis,
  type AdDesign,
  type LibraryReferenceVideo,
  type ReferenceVideoAnalysis,
} from '@/lib/server/referenceVideos';
import { groundVideoStoryboard, heroFrameDirection, MAX_SEEDANCE_PROMPT_CHARS, planVideoStoryboard, resolveVideoStyle, type VideoStoryboard } from '@/lib/server/videoStoryboard';
import { buildSeedanceReferences, inspectReferenceImages, type ReferenceImage } from '@/lib/server/referenceImages';
import { compileSeedanceFilm, filmStoryboard, MAX_SCENE_IMAGES, writeSeedanceFilm, type SeedanceFilm } from '@/lib/server/seedanceFilm';
import { seedancePrompt } from '@/lib/server/seedance';
import { saveVideoReview, type VideoReview, type VideoReviewFrame, type VideoReviewOutline, type VideoReviewReference } from '@/lib/server/videoReview';
import { CLAUDE_VIDEO_MODEL, claudeCostUsd } from '@/lib/server/claude';
import type { ReferenceFrame, VideoWriter } from '@/lib/server/videoWriter';
import { createServiceClient } from '@/lib/supabase/server';
import { loadVideoProject } from '@/lib/server/playground/db';
import { cropGarmentDetails, describeGarmentSpec } from '@/lib/server/productSpec';
import { trimPaddedBands } from '@/lib/server/paddedBands';
import { buildExactCanvas, closestFormat, exactCanvasPrompt, extendCanvasPrompt, mannequinPrompt, type FrameFormat } from '@/lib/server/exactFrame';
import { validatePersonIdentity } from '@/lib/server/personIdentity';
import { parseVideoStyle, videoStyleLabel, type VideoStyle } from '@/lib/videoStyles';
import { judgeAdCreative } from '@/lib/server/adJudge';
import { isVideoEngineConfigured, pickVideoEngine, resolveVideoModel, videoEngineLabel, videoEngineSetup, videoOutputResolution } from '@/lib/server/video';
import { normalizeVideoQuality, seedanceSpec, snapVideoAspect, snapVideoDuration, videoCredits, type VideoAspect, type VideoEngine, type VideoQuality } from '@/lib/videoModels';
import type { ProviderUsage } from '@/lib/server/usage';
import {
  deductCreditsForUser,
  estimateGoogleImageCostUsd,
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
// How long planning waits for Gemini to watch a reference video it hasn't seen before.
const REFERENCE_WATCH_MS = 90_000;
// A scene image is only started with this much of the request left.
const MIN_TIME_FOR_SCENE_IMAGE_MS = 50_000;

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
    // 4K images are turned off. A 4K video ad still renders its own 4K frame (from videoQuality).
    if (resolution?.toUpperCase() === '4K') {
      return NextResponse.json({ error: `${FOUR_K_OFF}. Pick 2K instead.` }, { status: 400 });
    }
    const creativeSet = body.creativeSet === true && mode === 'generate';
    const productContext = readProductContext(body.productContext);
    // Video ad: one clean hero frame (real product pasted in) + one clip animated from it.
    // The video model picked in the app sets the engine (Veo or Seedance).
    const videoAd = creativeSet && body.videoAd === true;
    const requestedVideoModel = typeof body.videoModel === 'string' ? body.videoModel : undefined;
    const videoEngine = pickVideoEngine(requestedVideoModel);
    const videoModel = resolveVideoModel(videoEngine, requestedVideoModel);
    // The length and quality picked in the app, snapped to what the model renders. A draft is a
    // cheap test render that can be upgraded later without redoing the frame or the storyboard.
    const videoDurationSeconds = snapVideoDuration(videoModel, Number(body.videoDuration) || undefined);
    const videoQuality = normalizeVideoQuality(videoModel, typeof body.videoQuality === 'string' ? body.videoQuality : videoOutputResolution(videoEngine, videoModel));
    // The video's shape (Veo renders only 9:16 and 16:9); the frames and prompts are made for it.
    const videoAspectRatio = snapVideoAspect(videoModel, typeof body.videoAspectRatio === 'string' ? body.videoAspectRatio : undefined);
    const perImageCost = getServerImageCreditCost(mode, model, resolution);
    // Priced from the model's cost for this length and quality (lib/videoModels.ts). The video
    // itself is charged when the user approves it (POST /api/video/render); here only its frame.
    const videoCost = videoAd ? videoCredits(videoModel, videoQuality, videoDurationSeconds, videoAspectRatio) : 0;
    const creditCost = videoAd
      ? perImageCost
      : creativeSet
        ? perImageCost * CREATIVE_SLOTS.length
        : perImageCost;
    // A video made in a video project: checked before anything is charged.
    const videoProject = videoAd && body.projectId ? await loadVideoProject(user.id, body.projectId) : null;
    if (videoAd && body.projectId && !videoProject) {
      return NextResponse.json({ error: 'This video project was not found.' }, { status: 404 });
    }
    // The user's reference videos (Library), whose shots the video copies: checked before charging.
    const referenceVideos = videoAd ? await loadLibraryVideos(user.id, body.referenceVideoIds) : [];
    if (videoAd && Array.isArray(body.referenceVideoIds) && body.referenceVideoIds.length && !referenceVideos.length) {
      return NextResponse.json({ error: 'The reference videos you picked are no longer in your Library. Remove them from this video, or pick others.' }, { status: 404 });
    }
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
        referenceVideos,
        video: videoAd
          ? { engine: videoEngine, model: videoModel, durationSeconds: videoDurationSeconds, quality: videoQuality, aspectRatio: videoAspectRatio, cost: videoCost, style: parseVideoStyle(body.videoStyle) ?? 'any', project: videoProject ?? undefined }
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
    ? `Every version of ${what} changed the garment, so nothing was kept and your credits were refunded.${found} Close-up store photos of the fabric and its details (lace, embroidery, trims) help the model copy fine patterns exactly; for lingerie, a photo of the set on its own (a flat lay or on a hanger) works best.`
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
  /** Videos from the user's Library whose shots the video copies (Gemini watches them). */
  referenceVideos: LibraryReferenceVideo[];
  /** Present for a video ad: one hero frame is generated, then animated by Veo or Seedance in the chosen style. */
  video?: {
    engine: VideoEngine;
    model: string;
    durationSeconds: number;
    /** draft, 720p, 1080p or 4k. */
    quality: VideoQuality;
    /** The shape the whole video is made in: hero frame, scene images, prompts and render. */
    aspectRatio: VideoAspect;
    cost: number;
    style: VideoStyle;
    /** The video project it is made in: its guidelines go to Claude, the video is listed in it. */
    project?: { id: string; guidelines: string };
  };
  perImageCost: number;
  creditCost: number;
}

/**
 * Gemini's analysis of each reference video: the one saved with the Library video, or watched
 * now and saved. A video Gemini is still watching after REFERENCE_WATCH_MS is left out of this
 * plan; its analysis is still saved when it finishes.
 */
async function watchReferenceVideos(
  userId: string,
  videos: LibraryReferenceVideo[],
  usages: ProviderUsage[]
): Promise<Array<{ video: LibraryReferenceVideo; analysis: ReferenceVideoAnalysis | null; error?: string }>> {
  return Promise.all(videos.map(async (video) => {
    if (video.analysis) return { video, analysis: video.analysis };
    const watching = analyzeReferenceVideo({ id: video.id, name: video.name, url: video.url }).then(async ({ analysis, usage }) => {
      usages.push(usage);
      await saveReferenceAnalysis(userId, video.id, analysis);
      return analysis;
    });
    watching.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const analysis = await Promise.race([
        watching,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('it is still being read and will be ready for your next video')), REFERENCE_WATCH_MS);
        }),
      ]);
      return { video, analysis };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'it could not be read';
      console.warn(`Reference video ${video.id} was not used:`, message);
      return { video, analysis: null, error: message };
    } finally {
      clearTimeout(timer);
    }
  }));
}

/**
 * Generates the 4-slot Meta ad set and streams NDJSON events as each slot passes
 * the product-identity check. Failed slots are repaired, then regenerated, before
 * giving up; unfilled slots are refunded. A video ad makes one hero frame, or for a
 * Seedance 2.x film none: Claude writes the film first and may ask for scene images.
 */
function streamCreativeSet(options: CreativeSetOptions): Response {
  const { user, mode, referenceImages, userDirection, model, resolution, productContext, referenceVideos, video, perImageCost, creditCost } = options;
  // A video ad needs exactly one clean frame; use the clean "lifestyle" slot as the hero.
  const slotIndexes = video ? [2] : CREATIVE_SLOTS.map((_, index) => index);
  // What Gemini saw in the reference videos: their briefs, timed sequences, posters and frames.
  let adPatterns: string | undefined;
  let referenceDesigns: AdDesign[] = [];
  let referencePosters: string[] = [];
  let referenceFrames: ReferenceFrame[] = [];
  let usedReferences: VideoReviewReference[] = [];
  // Seedance 2.x builds its film from reference images, so it needs no hero frame: Claude
  // writes the film first and may ask for scene images. Intimate wear on a model keeps the
  // hero-frame path, whose mannequin edit is the film's only possible reference.
  const seedanceFamily = video?.engine === 'seedance' ? seedanceSpec(video.model).family : null;
  const referenceFilm = seedanceFamily === '2.0' || seedanceFamily === '2.5';
  let claudeLedFilm = false;
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
      // Claude writes the video prompts; logged on its own, at Anthropic's prices.
      const claudeUsages: ProviderUsage[] = [];
      let savedReviewId: string | null = null;
      const validationScores: Array<{ slot: number; attempt: number; score: number; passed: boolean; checks: Record<string, boolean>; composited: boolean; reason: string }> = [];
      let billedImageCount = 0;
      let acceptedCount = 0;
      let verifierErrors = 0;
      // Credits charged for this request and not refunded yet, so no path refunds twice.
      let chargedCredits = creditCost;
      let heldCredits = creditCost;
      const refund = async (credits: number) => {
        const amount = Math.min(credits, heldCredits);
        if (amount <= 0) return;
        heldCredits -= amount;
        await refundCreditsForUser(user.id, amount);
      };
      const acceptedUrls = new Map<number, string>();
      const slotFailReasons = new Map<number, 'product' | 'generation' | 'safety' | 'quality'>();

      try {
        const stageStarted: Record<string, number> = {};
        const stage = (id: string, status: 'active' | 'done' | 'failed' | 'skipped', detail?: string, data?: unknown) => {
          if (status === 'active' && !stageStarted[id]) stageStarted[id] = Date.now();
          send({ type: 'stage', id, status, detail, data, elapsedMs: stageStarted[id] ? Date.now() - stageStarted[id] : undefined });
        };

        // 2. Understand the product: the identity spec (what to lock), from the photos.
        stage('understand', 'active', 'Reading the product photos and listing');
        // 3. Gemini watches the reference videos meanwhile. Each is watched once: the result is
        // kept with the Library video (the Studio usually starts it as soon as a video is added).
        const watchPromise = referenceVideos.length ? watchReferenceVideos(user.id, referenceVideos, analysisUsages) : null;
        if (watchPromise) {
          const count = referenceVideos.length === 1 ? 'your reference video' : `your ${referenceVideos.length} reference videos`;
          stage('analyze', 'active', referenceVideos.some((reference) => !reference.analysis) ? `Reading the shots of ${count}` : `Using the shots of ${count}`);
        }
        send({
          type: 'status',
          message: watchPromise
            ? 'Locking your product and reading your reference videos...'
            : 'Locking the exact product from your store images...',
        });
        const identity = await analyzeProductIdentity(referenceImages);
        analysisUsages.push(identity.usage);
        const apparel = identity.productKind === 'apparel';
        claudeLedFilm = referenceFilm && !(apparel && identity.onModel && identity.sensitive);
        // Seedance 2.x takes no photo of a real person: its film is built from person-free
        // product references (crops where the product is worn or held), found while the rest of
        // the product is read. This is how the Neeksha film was made.
        const referencesPromise = video && referenceFilm
          ? buildSeedanceReferences(referenceImages, { garment: apparel }).catch((error) => {
              console.warn('Seedance references failed:', error instanceof Error ? error.message : error);
              return null;
            })
          : null;
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
        // Garments worn by a model: the photo a video animates (face visible, garment largest)
        // and the model shots that image creatives are edited from, one per slot.
        const heroBase = referenceImages[identity.heroReferenceIndex] ?? canonicalImage;
        const modelShots = identity.modelShotIndexes.map((i) => referenceImages[i]).filter((url): url is string => Boolean(url));
        const exactCanvases = new Map<string, Promise<{ url: string; padded: boolean }>>();
        const exactCanvas = (photo: string, format: FrameFormat) => {
          const key = `${photo}|${format}`;
          if (!exactCanvases.has(key)) {
            exactCanvases.set(key, buildExactCanvas(photo, format).catch((error) => {
              // Without a canvas the edit still keeps the person and garment; it only reframes less precisely.
              console.warn('Exact canvas failed; editing the store photo as it is:', error instanceof Error ? error.message : error);
              return { url: photo, padded: false };
            }));
          }
          return exactCanvases.get(key) as Promise<{ url: string; padded: boolean }>;
        };
        const acceptedExact = new Set<number>();
        // Hero frames where the store photo's model became a mannequin (no person, the garment's own pixels).
        const acceptedMannequin = new Set<number>();
        console.log(`Product references: canonical #${identity.canonicalReferenceIndex + 1}${detailImages.length ? `, close-ups #${identity.detailReferenceIndexes.map((i) => i + 1).join(', #')}` : ', no close-ups in the store images'}${autoCrops?.crops.length ? `, enlarged crops: ${autoCrops.crops.map((c) => c.piece).join(', ')}` : ''}`);
        // Garments: an exact pattern spec (motifs, their size and arrangement, borders, colours)
        // for every prompt and for the product check; runs while Gemini watches the reference videos.
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
        stage('understand', 'done', 'Product identity locked', {
          canonicalImage,
          title: productContext?.title,
          brand: productContext?.vendor,
          price: formatPrice(productContext) || undefined,
          tier: priceTier(productContext),
          locked: lockedElements(identity.manifest),
          productPasted: Boolean(cutout),
          productKind: identity.productKind,
          sensitive: identity.sensitive,
        });

        if (watchPromise) {
          const watched = await watchPromise;
          // The Library name wins over the one saved with the analysis (the video may be renamed).
          const analysed = watched.flatMap((entry) => (entry.analysis
            ? [{ video: entry.video, analysis: { ...entry.analysis, design: { ...entry.analysis.design, id: entry.video.id, pageName: entry.video.name } } }]
            : []));
          referenceDesigns = analysed.map((entry) => entry.analysis.design);
          adPatterns = analysed
            .map((entry, i) => (entry.analysis.brief ? `#${i + 1} "${entry.video.name}": ${entry.analysis.brief}` : ''))
            .filter(Boolean)
            .join('\n') || undefined;
          referencePosters = analysed
            .map((entry) => entry.video.posterUrl ?? entry.video.frames[0]?.url)
            .filter((url): url is string => Boolean(url));
          referenceFrames = referenceFramesFor(analysed.map((entry) => entry.video), referenceDesigns);
          usedReferences = analysed.map((entry) => ({
            id: entry.video.id,
            name: entry.video.name,
            posterUrl: entry.video.posterUrl,
            url: entry.video.url,
            shots: entry.analysis.design.sequence?.length ?? 0,
          }));
          const shots = referenceDesigns.reduce((total, design) => total + (design.sequence?.length ?? 0), 0);
          stage('analyze', analysed.length ? 'done' : 'skipped', analysed.length
            ? `${analysed.length === 1 ? '1 reference video' : `${analysed.length} reference videos`} · ${shots} shots`
            : 'No reference video could be used', {
            designs: referenceDesigns.map((design) => ({ pageName: design.pageName, format: design.format, hook: design.hook, style: design.style, sequence: design.sequence })),
          });
          for (const entry of watched) {
            if (!entry.analysis) send({ type: 'notice', message: `"${entry.video.name}" was left out of this video: ${entry.error ?? 'it could not be read'}.` });
          }
        } else if (video) {
          stage('analyze', 'skipped', 'No reference videos picked');
        }

        // Video: the style to make (the user's pick, or the first reference video's for "any") stages the hero frame.
        const madeStyle = video ? resolveVideoStyle(video.style, referenceDesigns, identity.sensitive) : undefined;
        if (video && identity.sensitive && (video.style === 'ugc' || video.style === 'talking_head' || video.style === 'demo')) {
          send({ type: 'notice', message: `The video model does not allow a person on screen with this product, so instead of ${videoStyleLabel(video.style)} you get a product-only film.` });
        }
        const creativeDirection = [userDirection, madeStyle ? heroFrameDirection(madeStyle, identity.productKind, identity.sensitive, video?.aspectRatio) : '']
          .filter(Boolean)
          .join('\n') || undefined;
        const engineName = video ? videoEngineLabel(video.engine, video.model) : '';

        // The planner writes clean briefs from the product (and the reference videos, for a video's hero frame).
        let plan: { angles: AdAngle[] } = { angles: [] };
        if (claudeLedFilm) {
          stage('plan', 'skipped', 'Planned together with the video prompt');
          stage('generate', 'skipped', 'No hero frame needed: the film is built from your photos');
        } else {
          stage('plan', 'active', video ? 'Writing the hero-frame brief' : 'Writing four ad briefs');
          send({ type: 'status', message: video ? 'Planning the hero frame...' : 'Planning four ad angles...', canonicalImage });
          const planned = await planAdAngles({
            context: productContext,
            identityManifest: identity.manifest,
            userDirection: creativeDirection,
            adPatterns,
            referenceDesigns,
            referencePosters,
            productKind: identity.productKind,
          });
          if (planned.usage) analysisUsages.push(planned.usage);
          plan = { angles: planned.angles };
          send({
            type: 'angles',
            angles: slotIndexes.map((index) => ({
              index,
              name: plan.angles[index].name,
              withText: plan.angles[index].withText ?? CREATIVE_SLOTS[index].withText,
              modelledOn: plan.angles[index].modelledOn,
              aspectRatio: video ? video.aspectRatio : plan.angles[index].aspectRatio ?? '9:16',
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
        }

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
              // A video's hero frame is made in the video's shape.
              angle: video ? { ...active, aspectRatio: video.aspectRatio } : active,
              withText: stillLife() ? false : slot.withText,
              critique: safetyBlocks >= 2 ? undefined : critique,
              // A creative modelled on a reference decides its own camera angle; the perspective paste follows it.
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
          // A garment worn by a model in the store photos: the first take edits that photo (the
          // person and the garment keep their pixels; the model only paints the canvas strips and,
          // for image ads, the background from the creative's shot spec). A redrawn garment loses
          // its weave and a redrawn person their face, so this goes first; a fresh scene is only
          // the fallback. A video starts from the hero photo; image slots take turns across the
          // model shots, for variety.
          const canExact = identity.productKind === 'apparel' && identity.onModel && !identity.sensitive;
          // Intimate wear on a model, for a video: video models refuse the person, and a redrawn
          // garment loses its lace, so the store photo is edited first: the model becomes a
          // faceless mannequin and the garment keeps its pixels. The still life is the fallback.
          const canMannequin = Boolean(video) && identity.productKind === 'apparel' && identity.onModel && identity.sensitive;
          const position = Math.max(0, slotIndexes.indexOf(index));
          const exactBase = video ? heroBase : modelShots.length ? modelShots[position % modelShots.length] : heroBase;
          let exactNext = canExact;
          let exactFailures = 0;
          let mannequinNext = canMannequin;
          let mannequinFailures = 0;
          // The mannequin edit keeps the photo's own shape. A Seedance 2.x film takes it as a
          // reference image as it is; every other engine animates a first frame in the video's shape from it.
          const firstFrameVideo = Boolean(video) && !referenceFilm;
          let mannequinFormat: FrameFormat | null = null;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0 && deadline - Date.now() < minTimeForAttempt) break;
            const mannequin = mannequinNext;
            const exact = !mannequin && exactNext && !stillLife();
            // Both edit the store photo itself rather than drawing a new scene.
            const edit = exact || mannequin;
            const repair = !exact && !cutout && identity.productKind !== 'apparel' && attempt === 1 && rejectedUrl !== null;
            const withCopy = slot.withText;
            try {
              // With a style reference, the image model sees our product (1) and that ad (2)
              // as a layout & style reference, and renders in its format.
              const current = activeAngle();
              const styleRef = !repair && !exact && current.referenceImage ? current.referenceImage : undefined;
              if (mannequin) mannequinFormat ??= await closestFormat(exactBase).catch(() => '4:5' as FrameFormat);
              const format = (mannequin ? mannequinFormat : video ? video.aspectRatio : current.aspectRatio ?? '9:16') as FrameFormat;
              const canvas = exact ? await exactCanvas(exactBase, format) : null;
              if (edit) console.log(`Slot ${index + 1} attempt ${attempt + 1}: ${mannequin ? 'mannequin' : 'exact-garment'} edit of store photo #${referenceImages.indexOf(exactBase) + 1}${canvas?.padded ? ` on a ${format} canvas` : ''}`);
              const generated = await runImageGeneration({
                mode,
                referenceImages: edit
                  ? [canvas?.url ?? exactBase]
                  : repair
                    ? [canonicalImage, rejectedUrl as string]
                    : styleRef ? [...productRefs, styleRef] : productRefs,
                prompt: mannequin
                  ? mannequinPrompt({ garment: garmentSpec?.signature.join('; ') })
                  : exact
                  ? exactCanvasPrompt({
                      padded: Boolean(canvas?.padded),
                      garment: garmentSpec?.signature.join('; '),
                      // A video keeps the photo's own background (nothing relit); an image ad
                      // takes the setting its shot spec gives.
                      setting: video ? undefined : typeof current.shot?.setting === 'string' ? current.shot.setting : undefined,
                      copy: withCopy && !stillLife() ? adCopyBlock(current) : undefined,
                    })
                  : promptFor(),
                model,
                aspectRatio: format,
                // A 4K video starts from a 4K frame, so the video model animates real detail.
                resolution: edit && video?.quality === '4k' ? '4K' : resolution,
                persistToGenerationsTable: false,
                // The mannequin edit replaces the person, so it must not carry the person-lock protocol.
                referencePolicy: mannequin ? 'balanced' : exact ? 'subject-lock' : repair ? 'product-repair' : styleRef ? 'product-plus-style' : 'product-lock',
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
                console.log(`Slot ${index + 1} attempt ${attempt + 1}: padded band (top ${padded.bands.top.toFixed(2)}, bottom ${padded.bands.bottom.toFixed(2)}, left ${(padded.bands.left ?? 0).toFixed(2)}, right ${(padded.bands.right ?? 0).toFixed(2)}); ${padded.trimmed && !hasCopy ? 'trimmed' : 're-rendering'}`);
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
                // An edited frame is the base photo edited, so it is checked against that photo.
                edit ? exactBase : canonicalImage,
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

              if (validation?.passed && exact) {
                // The face is locked too: an edited store photo must still show the same person.
                const face = await validatePersonIdentity(exactBase, imageUrl, 'The model wearing the product in the store photo (image A).').catch((error) => {
                  console.warn(`Slot ${index + 1} face check unavailable:`, error instanceof Error ? error.message : error);
                  return null;
                });
                if (face) analysisUsages.push(face.usage);
                if (face && !face.passed) {
                  console.log(`Slot ${index + 1} attempt ${attempt + 1}: face check failed (${face.score}/100): ${face.reason}`);
                  failReason = 'quality';
                  send({ type: 'retry', index, attempt: attempt + 1, reason: 'quality' });
                  // exactNext stays on: the next attempt is another exact edit.
                  continue;
                }
              }

              if (validation?.passed && mannequin) {
                // The point of the mannequin frame is that no person is left in it.
                const inspected = await inspectReferenceImages([imageUrl]).catch((error) => {
                  console.warn(`Slot ${index + 1} person check unavailable:`, error instanceof Error ? error.message : error);
                  return null;
                });
                if (inspected?.usage) analysisUsages.push(inspected.usage);
                if (inspected?.images[0]?.person) {
                  console.log(`Slot ${index + 1} attempt ${attempt + 1}: the mannequin edit still shows a person`);
                  failReason = 'quality';
                  mannequinFailures += 1;
                  mannequinNext = mannequinFailures < 2;
                  send({ type: 'retry', index, attempt: attempt + 1, reason: 'quality' });
                  continue;
                }
                const shape = video?.aspectRatio ?? '9:16';
                if (firstFrameVideo && format !== shape) {
                  // A first frame has the video's shape: the mannequin photo goes on a canvas of that shape and only the strips are painted.
                  const tall = await buildExactCanvas(imageUrl, shape).catch(() => null);
                  const extended = tall?.padded
                    ? await runImageGeneration({
                        mode,
                        referenceImages: [tall.url],
                        prompt: extendCanvasPrompt(),
                        model,
                        aspectRatio: shape,
                        resolution: video?.quality === '4k' ? '4K' : resolution,
                        persistToGenerationsTable: false,
                        referencePolicy: 'balanced',
                        userId: user.id,
                      }).catch((error) => {
                        console.warn(`Slot ${index + 1}: extending the mannequin frame failed:`, error instanceof Error ? error.message : error);
                        return null;
                      })
                    : null;
                  if (extended) {
                    generationUsages.push(extended.usage);
                    billedImageCount += extended.images.length;
                  }
                  const bands = extended?.images[0] ? await trimPaddedBands(extended.images[0]).catch(() => null) : null;
                  if (extended?.images[0] && !(bands && (bands.trimmed || bands.tooLarge))) imageUrl = extended.images[0];
                  else console.log(`Slot ${index + 1}: the mannequin frame could not be extended to ${shape}; keeping its own shape`);
                }
              }

              if (validation?.passed) {
                // Product is right; now judge it as a media buyer would. One re-roll with fixes.
                const verdict = await judgeAdCreative({
                  imageUrl,
                  context: productContext,
                  angle: activeAngle(),
                  withText: stillLife() ? false : withCopy,
                  productKind: identity.productKind,
                  // An edited store photo keeps its pose, so it is not judged on a reference's layout.
                  referenceImageUrl: edit ? undefined : activeAngle().referenceImage,
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
                if (verdict && !verdict.passed && canReroll && (hasDealBreaker || (qualityRerolls < 1 && !edit))) {
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
                if (exact) acceptedExact.add(index);
                if (mannequin) acceptedMannequin.add(index);
                send({
                  type: 'creative',
                  index,
                  url: imageUrl,
                  angle: angle.name,
                  withText: withCopy,
                  attempts: attempt + 1,
                  score: verdict?.score,
                  exactGarment: edit,
                });
                return imageUrl;
              }
              rejectedUrl = imageUrl;
              failReason = 'product';
              console.log(`Slot ${index + 1} attempt ${attempt + 1}: product check failed (${validation.score}/100): ${validation.reason}`);
              // The exact edit is the reliable path, so it gets a second try; after two exact
              // failures (or when a fresh scene failed) the next attempt switches path.
              if (exact) exactFailures += 1;
              exactNext = canExact && (exact ? exactFailures < 2 : true);
              // Two mannequin edits that changed the garment: the next attempt is the still life.
              if (mannequin) mannequinFailures += 1;
              mannequinNext = canMannequin && mannequinFailures < 2;
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

        // A worn garment's clip ends on its first frame; Veo can pin that only on 8-second clips.
        const pinLastFrame = apparel && Boolean(video) && (video?.engine !== 'veo' || video?.durationSeconds === 8);
        const maxPromptChars = video?.engine === 'seedance' ? MAX_SEEDANCE_PROMPT_CHARS : undefined;
        const writeFilm = (references: ReferenceImage[], onMannequin = false) => writeSeedanceFilm({
          context: productContext,
          identityManifest: identity.manifest,
          userDirection,
          adPatterns,
          referenceDesigns,
          durationSeconds: video?.durationSeconds ?? 8,
          aspectRatio: video?.aspectRatio,
          style: video?.style,
          productKind: identity.productKind,
          productSpec: garmentSpec?.json,
          never: garmentSpec?.never,
          sensitive: identity.sensitive,
          guidelines: video?.project?.guidelines,
          onMannequin,
          references,
          referenceFrames,
          // Scene images take the hero frame's place, so only a Claude-led film asks for them.
          allowSceneImages: claudeLedFilm,
        });
        const filmPromise = video && referencesPromise
          ? referencesPromise.then((found) => (found?.references.length ? writeFilm(found.references) : null))
          : null;
        // The storyboard does not depend on the hero frame, so it is written while the frame renders.
        const storyboardPromise = video && !referenceFilm
          ? planVideoStoryboard({
              context: productContext,
              identityManifest: identity.manifest,
              userDirection,
              adPatterns,
              referenceDesigns,
              durationSeconds: video.durationSeconds,
              aspectRatio: video.aspectRatio,
              sensitive: identity.sensitive,
              style: video.style,
              productKind: identity.productKind,
              productSpec: garmentSpec?.json,
              never: garmentSpec?.never,
              pinnedLastFrame: pinLastFrame,
              maxPromptChars,
              productImages: productRefs,
              guidelines: video.project?.guidelines,
              referenceFrames,
            })
          : null;

        /**
         * One scene image Claude asked for, made like the hero frame: Nano Banana Pro from the
         * product photos with the product locked, real pixels pasted in for packaged goods when
         * needed, then the product check and the person check (Seedance 2.x refuses people).
         */
        const makeSceneImage = async (request: { shot: number; prompt: string }, film: SeedanceFilm): Promise<string | null> => {
          let critique: string | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            if (deadline - Date.now() < MIN_TIME_FOR_SCENE_IMAGE_MS) break;
            try {
              const generated = await runImageGeneration({
                mode,
                referenceImages: productRefs,
                prompt: sceneStillPrompt({
                  scene: request.prompt,
                  setting: film.setting,
                  look: film.look,
                  context: productContext,
                  identityManifest: identity.manifest,
                  productKind: identity.productKind,
                  productSpec: garmentSpec?.json,
                  critique,
                  aspectRatio: video?.aspectRatio,
                }),
                model,
                aspectRatio: video?.aspectRatio ?? '9:16',
                // A reference image: Seedance reads 2K detail fine, so it never needs a 4K render.
                resolution,
                persistToGenerationsTable: false,
                referencePolicy: 'product-lock',
                userId: user.id,
              });
              generationUsages.push(generated.usage);
              billedImageCount += generated.images.length;
              let url = generated.images[0];
              if (!url) continue;
              const padded = await trimPaddedBands(url).catch(() => null);
              if (padded?.trimmed) {
                url = padded.url;
              } else if (padded?.tooLarge) {
                critique = 'The previous render filled part of the frame with a blurred, stretched strip. Compose one new, full-bleed photograph that fills the whole frame edge to edge.';
                continue;
              }
              const verify = async (candidate: string) => {
                const result = await validateProductIdentity(canonicalImage, candidate, identity.manifest, {
                  overlayTextExpected: false,
                  productKind: identity.productKind,
                  detailImageUrls: detailViews,
                  garmentChecks: garmentSpec ? { signature: garmentSpec.signature, never: garmentSpec.never } : undefined,
                }).catch((error) => {
                  console.warn(`Scene image for shot ${request.shot}: product check unavailable:`, error instanceof Error ? error.message : error);
                  return null;
                });
                if (result) analysisUsages.push(result.usage);
                return result;
              };
              let validation = await verify(url);
              if (validation && !validation.passed && cutout) {
                const located = await locateProductQuad(url).catch(() => null);
                if (located) analysisUsages.push(located.usage);
                const pasted = located?.quad
                  ? await compositeProductPerspective(url, cutout, located.quad).catch(() => null)
                  : located?.box
                    ? await compositeProduct(url, cutout, located.box).catch(() => null)
                    : null;
                if (pasted) {
                  url = pasted;
                  validation = await verify(url);
                }
              }
              // The checker itself failed (not the image): another render would only burn credits.
              if (!validation) return null;
              if (!validation.passed) {
                console.log(`Scene image for shot ${request.shot} attempt ${attempt + 1}: product check failed (${validation.score}/100): ${validation.reason}`);
                critique = `The product check rejected the previous render: ${validation.reason} Copy the product exactly from the product photos.`;
                continue;
              }
              const inspected = await inspectReferenceImages([url]).catch(() => null);
              if (inspected?.usage) analysisUsages.push(inspected.usage);
              // Unknown counts as a person: a refused reference fails the whole video.
              if (!inspected) return null;
              if (inspected.images[0]?.person !== false) {
                console.log(`Scene image for shot ${request.shot} attempt ${attempt + 1}: shows a person`);
                critique = 'The previous render showed a person or part of one. Show no people at all: no face, hands, arms, skin or hair.';
                continue;
              }
              return url;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.warn(`Scene image for shot ${request.shot} attempt ${attempt + 1} failed:`, message);
              if (/safety|PROHIBITED_CONTENT|IMAGE_OTHER/i.test(message)) {
                critique = 'The previous version was blocked by the platform safety filter. Keep it a simple, tasteful product still life.';
              }
            }
          }
          return null;
        };

        // The hero frame, or the four image ads. A Claude-led film has neither.
        if (!claudeLedFilm) {
          await Promise.all(slotIndexes.map((index) => produceSlot(index)));
          const unfilled = slotIndexes.length - acceptedCount;
          stage('generate', acceptedCount > 0 ? 'done' : 'failed', `${acceptedCount} of ${slotIndexes.length} passed the product check`, { passed: acceptedCount, withheld: unfilled });
          if (unfilled > 0) await refund(perImageCost * unfilled);
        }
        const failedSlots = claudeLedFilm ? 0 : slotIndexes.length - acceptedCount;

        // Video ad: the frame or references, the exact prompt and the settings go to the user
        // for approval. Nothing renders, and the video is not charged, until they approve.
        let reviewId: string | undefined;
        let videoWarning: string | undefined;
        // Scene images Claude asked for and Gemini made, each the image of its shot.
        const scenes: Array<{ shot: number; url: string }> = [];
        if (video) {
          const heroUrl = acceptedUrls.get(slotIndexes[0]);
          const exactHero = acceptedExact.has(slotIndexes[0]);
          const studied = referenceDesigns.filter((d) => d.sequence?.length).slice(0, 3).length;
          stage('storyboard', 'active', studied
            ? `Writing the prompt from ${studied === 1 ? 'your reference video' : `your ${studied} reference videos`}`
            : 'Writing the prompt from your product photos');
          let plan: {
            mode: VideoReview['mode'];
            frames: VideoReviewFrame[];
            prompt: string;
            negativePrompt?: string;
            storyboard: VideoStoryboard;
            needsAudio: boolean;
            notes: string[];
            writer: VideoWriter;
            outline: VideoReviewOutline;
          } | null = null;

          if (referenceFilm) {
            const found = await referencesPromise;
            if (found) analysisUsages.push(...found.usages);
            let references = found?.references ?? [];
            let written = await filmPromise;
            // Worn intimate wear has no person-free photo and no person-free crop: the mannequin
            // hero frame (the store photo, its model turned into a mannequin) is the reference.
            const fromMannequin = references.length === 0 && Boolean(heroUrl) && acceptedMannequin.has(slotIndexes[0]);
            if (fromMannequin && heroUrl) {
              references = [{ url: heroUrl, label: 'the product on a display mannequin, from your store photo' }];
              written = await writeFilm(references, true);
            }
            if (written?.usage) claudeUsages.push(written.usage);

            // Scene images: only where Claude found that the photos can't show a shot. Gemini
            // makes each from the product photos; a passed one becomes that shot's image.
            const requests = claudeLedFilm && written && !written.writer.fallbackReason && references.length
              ? (written.film.sceneImages ?? []).slice(0, MAX_SCENE_IMAGES)
              : [];
            const sceneNotes: string[] = [];
            if (written && requests.length) {
              stage('storyboard', 'done', written.film.hook || 'Film written');
              // The first scene image is part of the planning charge; a second costs one more image.
              if (requests.length > 1) {
                if (await deductCreditsForUser(user.id, perImageCost)) {
                  chargedCredits += perImageCost;
                  heldCredits += perImageCost;
                } else {
                  requests.splice(1);
                  sceneNotes.push('A second scene image was needed, but there were not enough credits for it, so only one was made.');
                }
              }
              const what = requests.length === 1 ? 'the scene image' : `${requests.length} scene images`;
              stage('scenes', 'active', `Making ${what} for the film`, { requests });
              send({ type: 'status', message: `Making ${what} for the film...` });
              const film = written.film;
              const made = await Promise.all(requests.map((request) => makeSceneImage(request, film)));
              made.forEach((url, i) => { if (url) scenes.push({ shot: requests[i].shot, url }); });
              // Each one becomes its shot's image: Image N+1, N+2 after the product references.
              scenes.forEach((scene, i) => {
                const shot = film.shots[scene.shot - 1];
                if (shot) shot.image = Math.min(references.length, 6) + i + 1;
              });
              const missed = requests.length - scenes.length;
              if (missed > 0) sceneNotes.push(`${missed === 1 ? 'One scene image' : 'The scene images'} did not pass the product and person checks, so ${missed === 1 ? 'that shot uses' : 'those shots use'} your photos instead.`);
              stage('scenes', scenes.length ? 'done' : 'skipped', scenes.length
                ? `${scenes.length} made · ${scenes.map((scene) => `shot ${scene.shot}`).join(', ')}`
                : 'None passed the checks; your photos are used', { requests, images: scenes, aspectRatio: video.aspectRatio });
            } else {
              stage('scenes', 'skipped', claudeLedFilm && written && !written.writer.fallbackReason ? 'Your photos cover every shot' : 'Not used for this video');
            }

            if (references.length && written) {
              // A person-free hero frame (the ad modelled on the reference) is the scene the film opens on.
              const inspected = heroUrl && !exactHero && !fromMannequin ? await inspectReferenceImages([heroUrl]).catch(() => null) : null;
              if (inspected?.usage) analysisUsages.push(inspected.usage);
              const opening = !fromMannequin && Boolean(heroUrl) && inspected?.images[0]?.person === false;
              const prompt = compileSeedanceFilm(written.film, {
                durationSeconds: video.durationSeconds,
                aspectRatio: video.aspectRatio,
                opening,
                family: seedanceFamily as '2.0' | '2.5',
                audio: process.env.SEEDANCE_GENERATE_AUDIO !== 'false',
                mannequin: fromMannequin,
                sensitive: identity.sensitive,
              });
              const cropped = references.some((reference) => !referenceImages.includes(reference.url));
              const sceneCount = scenes.length === 1 ? 'a scene image' : `${scenes.length} scene images`;
              plan = {
                mode: 'reference',
                frames: [
                  ...(opening && heroUrl ? [{ url: heroUrl, label: 'Opening scene (the ad frame)', kind: 'frame' as const }] : []),
                  ...references.slice(0, 6).map((reference) => ({
                    ...reference,
                    kind: fromMannequin ? 'mannequin' as const : referenceImages.includes(reference.url) ? 'photo' as const : 'crop' as const,
                  })),
                  ...scenes.map((scene) => ({ url: scene.url, label: `Scene image for shot ${scene.shot}`, kind: 'scene' as const })),
                ],
                prompt,
                storyboard: filmStoryboard(written.film, prompt, written.style),
                needsAudio: Boolean(written.film.dialogue),
                notes: [
                  ...(written.writer.fallbackReason ? [written.writer.fallbackReason] : []),
                  fromMannequin
                    ? `${engineName} does not accept photos of real people, so the model in your store photo was turned into a display mannequin; the garment keeps its real pixels, and the film is built from that frame.`
                    : `${engineName} does not accept photos of real people, so the film is built from ${Math.min(references.length, 6)} people-free ${cropped ? 'views of the product (crops of the photos where it is worn or held)' : 'product photos'}${scenes.length ? ` and ${sceneCount} made for its shots` : ''}${opening ? ' and opens on the ad frame' : ''}.`,
                  ...sceneNotes,
                  ...(claudeLedFilm && written.writer.fallbackReason ? ['Planning was not charged, as this prompt is a template.'] : []),
                ],
                writer: written.writer,
                outline: {
                  hook: written.film.hook || undefined,
                  cast: written.film.cast || undefined,
                  setting: written.film.setting || undefined,
                  shots: written.film.shots.map((shot) => ({ t: shot.t, action: `${shot.framing}. ${shot.action}`, camera: shot.camera })),
                  script: written.film.dialogue || undefined,
                },
              };
            } else {
              videoWarning = `${engineName} does not accept photos of real people, and no people-free view of the product was found in its photos. Pick Veo for this product, or add a photo of the product on its own.`;
            }
          } else {
            const planned = await (storyboardPromise as NonNullable<typeof storyboardPromise>);
            if (planned.usage) claudeUsages.push(planned.usage);
            let storyboard = planned.storyboard;
            // Claude matches the JSON prompt to the frame the video will animate, when there is time for it.
            if (heroUrl && !planned.writer.fallbackReason && deadline - Date.now() > 40_000) {
              const grounded = await groundVideoStoryboard(storyboard, {
                heroUrl,
                aspectRatio: video.aspectRatio,
                productSpec: garmentSpec?.json,
                never: garmentSpec?.never,
                sensitive: identity.sensitive,
                garment: apparel,
                pinnedLastFrame: pinLastFrame,
                maxPromptChars,
                timeoutMs: Math.min(90_000, deadline - Date.now() - 15_000),
              }).catch((error) => {
                console.warn('Video prompt grounding (Claude) failed; using the draft:', error instanceof Error ? error.message : error);
                return null;
              });
              if (grounded) {
                storyboard = grounded.storyboard;
                if (grounded.usage) claudeUsages.push(grounded.usage);
              }
            }
            if (heroUrl) {
              plan = {
                mode: 'first_frame',
                frames: [{ url: heroUrl, label: 'First frame', kind: 'frame' }],
                // Shown exactly as the model will receive it (Seedance reads plain direction).
                prompt: video.engine === 'seedance'
                  ? seedancePrompt(storyboard.prompt, { negativePrompt: storyboard.negativePrompt, cameraFixed: apparel })
                  : storyboard.prompt,
                negativePrompt: video.engine === 'veo' ? storyboard.negativePrompt : undefined,
                storyboard,
                needsAudio: Boolean(storyboard.script),
                notes: [
                  ...(planned.writer.fallbackReason ? [planned.writer.fallbackReason] : []),
                  ...(video.engine === 'veo' && apparel && video.durationSeconds !== 8
                    ? ['Veo pins the last frame only on 8-second clips, so this clip holds the garment by the prompt alone; pick 8 s for the steadiest garment.']
                    : []),
                ],
                writer: planned.writer,
                outline: {
                  hook: storyboard.hook || undefined,
                  shots: storyboard.shots.map((shot) => ({ t: shot.t, action: shot.action, camera: shot.camera })),
                  script: storyboard.script || undefined,
                },
              };
            }
          }

          if (plan) {
            console.log(`Video prompt for review (${plan.mode}, ${plan.prompt.length} chars): ${plan.prompt.slice(0, 300)}…`);
            send({ type: 'storyboard', storyboard: plan.storyboard });
            stage('storyboard', 'done', plan.storyboard.hook, { storyboard: plan.storyboard });
            if (!isVideoEngineConfigured(video.engine)) {
              videoWarning = `Video generation is not configured on this server yet (set ${videoEngineSetup(video.engine)}). ${claudeLedFilm ? 'The prompt was written but not kept' : 'The hero frame and storyboard were kept'}.`;
              stage('render', 'skipped', 'Video generation not configured');
            } else {
              const review: VideoReview = {
                engine: video.engine,
                model: video.model,
                quality: video.quality,
                durationSeconds: video.durationSeconds,
                aspectRatio: video.aspectRatio,
                mode: plan.mode,
                frames: plan.frames,
                prompt: plan.prompt,
                negativePrompt: plan.negativePrompt,
                credits: video.cost,
                notes: plan.notes,
                lastFramePinned: plan.mode === 'first_frame' && pinLastFrame,
                cameraFixed: apparel,
                garment: apparel,
                // The exact frame is the store photo, so it shows the real model's face.
                realFace: plan.mode === 'first_frame' && exactHero,
                needsAudio: plan.needsAudio,
                writtenBy: plan.writer.writtenBy,
                ...(usedReferences.length ? { referenceVideos: usedReferences } : {}),
                outline: plan.outline,
              };
              try {
                reviewId = await saveVideoReview(user, review, {
                  requestedVideoModel: video.model,
                  videoStyle: video.style,
                  madeStyle: plan.storyboard.style ?? null,
                  sensitive: identity.sensitive,
                  exactGarment: exactHero,
                  heroFrameUrl: heroUrl ?? scenes.find((scene) => scene.shot === 1)?.url ?? null,
                  referenceVideoIds: usedReferences.map((reference) => reference.id),
                  sceneImages: scenes.length,
                  modelledOn: plan.storyboard.modelledOn ?? null,
                  // For the Video Studio's history.
                  productTitle: productContext?.title ?? null,
                  storyboardHook: plan.storyboard.hook ?? null,
                  projectId: video.project?.id ?? null,
                  promptWriter: plan.writer.fallbackReason ? 'template' : CLAUDE_VIDEO_MODEL,
                });
                savedReviewId = reviewId;
                send({ type: 'video_review', reviewId, review });
                stage('review', 'active', 'Waiting for your approval');
                // The project's card shows its latest video's frame, and the project moves to the top.
                if (video.project) {
                  const cover = heroUrl ?? scenes.find((scene) => scene.shot === 1)?.url ?? plan.frames[0]?.url ?? null;
                  await createServiceClient()
                    .from('playground_projects')
                    .update({ updated_at: new Date().toISOString(), ...(cover ? { cover_url: cover } : {}) })
                    .eq('id', video.project.id)
                    .eq('user_id', user.id)
                    .then(({ error }) => { if (error) console.warn('Updating the video project failed:', error.message); });
                }
              } catch (error) {
                console.error('Saving the video review failed:', error);
                videoWarning = `The video could not be prepared for review. ${claudeLedFilm ? 'Try again.' : 'The hero frame and storyboard were kept; try again.'}`;
                stage('review', 'failed', 'Could not prepare the review');
              }
            }
          } else {
            stage('storyboard', 'failed', videoWarning ?? 'No hero frame to build the video from');
            stage('render', 'skipped', 'Nothing to render');
          }

          // A Claude-led film is charged only once it waits for approval: the planning, which
          // includes the first scene image, and each further scene image made. A template film
          // is not charged.
          if (claudeLedFilm) {
            const owed = reviewId && plan && !plan.writer.fallbackReason ? perImageCost * Math.max(1, scenes.length) : 0;
            await refund(heldCredits - owed);
            if (!reviewId && videoWarning) videoWarning = `${videoWarning} Your credits were refunded.`;
          }
        }

        send({
          type: 'done',
          acceptedCount,
          reviewId,
          creditsDeducted: heldCredits,
          warning: claudeLedFilm
            ? videoWarning ?? (reviewId ? undefined : 'The video could not be planned. Your credits were refunded.')
            : acceptedCount === 0
            ? failureSummary([...slotFailReasons.values()], verifierErrors, identity.productKind, Boolean(video), validationScores.filter((v) => !v.passed).at(-1)?.reason)
            : videoWarning
              ? videoWarning
              : failedSlots > 0
                ? `${acceptedCount} of ${slotIndexes.length} ads passed the product check. Credits for the other ${failedSlots} were refunded.`
                : undefined,
        });
      } catch (error) {
        console.error('Creative set error:', error);
        // What was delivered stays charged: the image ads sent, or a film waiting for approval.
        const delivered = claudeLedFilm ? (savedReviewId ? heldCredits : 0) : perImageCost * acceptedCount;
        await refund(heldCredits - delivered).catch(() => undefined);
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
          validationScores,
          referenceVideoCount: usedReferences.length,
          aspectRatio: video?.aspectRatio,
          // The video itself is charged and logged when the user approves it.
          creditsCharged: chargedCredits,
          creditsKept: heldCredits,
        }).catch((error) => console.error('Usage logging failed:', error));
        if (claudeUsages.length) {
          const claude = sumUsage(claudeUsages);
          await logUsage({
            user,
            provider: 'anthropic',
            model: claudeUsages[0]?.providerModel || CLAUDE_VIDEO_MODEL,
            feature: 'video_generation',
            ...claude,
            imageCount: 0,
            estimatedCostUsd: claudeCostUsd(claude),
            creditCost: 0,
            metadata: { mode: 'video_prompt_writer', calls: claudeUsages.length, reviewId: savedReviewId, projectId: video?.project?.id ?? null, guidelinesChars: video?.project?.guidelines?.trim().length ?? 0 },
          }).catch((error) => console.error('Claude usage logging failed:', error));
        }
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
  validationScores: unknown[];
  referenceVideoCount: number;
  /** A video's shape (its hero frame and scene images are made in it). */
  aspectRatio?: string;
  creditsCharged: number;
  creditsKept: number;
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
    creditCost: input.creditsKept,
    metadata: {
      mode: input.mode,
      creativeSet: true,
      referenceVideos: input.referenceVideoCount,
      uiModel: input.model || 'nano-banana-pro',
      aspectRatio: input.aspectRatio ?? '9:16',
      resolution: input.resolution || '2K',
      referenceCount: input.referenceCount,
      acceptedImageCount: input.acceptedCount,
      creditsCharged: input.creditsCharged,
      creditsRefunded: input.creditsCharged - input.creditsKept,
      validationScores: input.validationScores,
      chargedServerSide: true,
    },
  });
}
