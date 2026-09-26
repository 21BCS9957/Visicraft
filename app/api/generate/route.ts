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
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
import { planAdAngles } from '@/lib/server/adAngles';
import { compositeProduct, cutoutProduct, locateProduct } from '@/lib/server/productComposite';
import { researchWinningAds, type AdDesign } from '@/lib/server/metaAdResearch';
import { planVideoStoryboard } from '@/lib/server/videoStoryboard';
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
  return {
    title: typeof value.title === 'string' ? value.title : undefined,
    vendor: typeof value.vendor === 'string' ? value.vendor : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
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
        video: videoAd ? { model: videoModel, durationSeconds: videoDurationSeconds, cost: videoCost } : undefined,
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
  /** Present for a video ad: one hero frame is generated, then animated with Veo. */
  video?: { model: string; durationSeconds: number; cost: number };
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
  const deadline = Date.now() + REQUEST_BUDGET_MS;
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
      let videoCreditsRefunded = 0;

      try {
        // Winning-ad research runs concurrently with product analysis and cutout.
        const researchPromise = research && productContext
          ? researchWinningAds(productContext, researchMediaType, country ?? 'IN', { imageUrls: referenceImages.slice(0, 3) })
              .then((result) => ({ result, error: null as Error | null }))
              .catch((error: unknown) => ({ result: null, error: error instanceof Error ? error : new Error('Ad research failed') }))
          : null;
        send({
          type: 'status',
          message: researchPromise
            ? 'Finding the longest-running ads in this niche and locking your product...'
            : 'Locking the exact product from your store images...',
        });
        const identity = await analyzeProductIdentity(referenceImages);
        analysisUsages.push(identity.usage);
        const canonicalImage = referenceImages[identity.canonicalReferenceIndex] ?? referenceImages[0];

        // Real product pixels get pasted over the model's rendition so label text stays exact.
        // Only the analyzer's packshot is trusted as the paste source: other store images
        // may be infographics or lifestyle collages that merely contain a plain background.
        const cut: Awaited<ReturnType<typeof cutoutProduct>> = await cutoutProduct(canonicalImage).catch((error) => {
          console.warn('Product cutout failed:', error);
          return { cutout: null, reason: 'error' };
        });
        if (cut.usage) analysisUsages.push(cut.usage);
        const cutout = cut.cutout;
        console.log(cutout
          ? `Product cutout ready (${cutout.width}x${cutout.height}) from ${canonicalImage}`
          : `Cutout skipped (${cut.reason}); relying on model rendering for ${canonicalImage}`);

        if (researchPromise) {
          const research = await researchPromise;
          if (research.result) {
            adPatterns = research.result.patterns;
            winningDesigns = research.result.designs;
            send({
              type: 'research',
              research: {
                niche: research.result.niche,
                keywords: research.result.keywords,
                ads: research.result.ads,
                patterns: research.result.patterns,
                mock: research.result.mock,
              },
            });
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
              },
            }).catch((error) => console.error('Research usage logging failed:', error));
          } else {
            console.error('Ad research failed, continuing without it:', research.error);
            send({ type: 'research_failed', message: research.error?.message ?? 'Ad research failed' });
          }
        }

        send({ type: 'status', message: 'Planning four ad angles...', canonicalImage });
        const plan = await planAdAngles({
          context: productContext,
          identityManifest: identity.manifest,
          userDirection,
          adPatterns,
          winningDesigns,
        });
        if (plan.usage) analysisUsages.push(plan.usage);
        send({
          type: 'angles',
          angles: slotIndexes.map((index) => ({
            index,
            name: plan.angles[index].name,
            withText: CREATIVE_SLOTS[index].withText,
            modelledOn: plan.angles[index].modelledOn,
          })),
        });
        send({ type: 'status', message: video ? 'Generating the hero frame for your video...' : 'Generating four Meta ad creatives...' });

        const produceSlot = async (index: number) => {
          const slot = CREATIVE_SLOTS[index];
          const angle = plan.angles[index];
          let rejectedUrl: string | null = null;
          let critique: string | undefined;
          const promptFor = () => buildMetaAdCreativePrompt({
            context: productContext,
            userDirection,
            identityManifest: identity.manifest,
            angle,
            withText: slot.withText,
            critique,
          });

          // With the real product pasted in, a failure means occlusion or a bad box, so
          // one clean regeneration is enough; without it, allow a repair pass too.
          const maxAttempts = cutout ? 2 : MAX_ATTEMPTS_PER_SLOT;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0 && deadline - Date.now() < MIN_TIME_FOR_ATTEMPT_MS) break;
            const repair = !cutout && attempt === 1 && rejectedUrl !== null;
            try {
              const generated = await runImageGeneration({
                mode,
                referenceImages: repair ? [canonicalImage, rejectedUrl as string] : [canonicalImage],
                prompt: promptFor(),
                model,
                aspectRatio: '9:16',
                resolution,
                persistToGenerationsTable: false,
                referencePolicy: repair ? 'product-repair' : 'product-lock',
                userId: user.id,
              });
              generationUsages.push(generated.usage);
              billedImageCount += generated.images.length;
              let imageUrl = generated.images[0];
              if (!imageUrl) continue;
              let composited = false;

              if (cutout) {
                try {
                  const located = await locateProduct(imageUrl);
                  analysisUsages.push(located.usage);
                  if (located.box) {
                    imageUrl = await compositeProduct(imageUrl, cutout, located.box);
                    composited = true;
                  } else {
                    console.warn(`Slot ${index + 1}: product not located in generated image; keeping model rendering`);
                  }
                } catch (error) {
                  console.warn(`Slot ${index + 1}: compositing failed, keeping model rendering:`, error);
                }
              }

              const validation = await validateProductIdentity(
                canonicalImage,
                imageUrl,
                identity.manifest,
                { overlayTextExpected: slot.withText }
              ).catch((error) => {
                console.error(`Slot ${index + 1} verification failed:`, error);
                verifierErrors += 1;
                return null;
              });
              // The checker itself failed (not the image): retrying generation would only burn credits.
              if (!validation) break;
              if (validation) {
                analysisUsages.push(validation.usage);
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
                  angle,
                  withText: slot.withText,
                }).catch((error) => {
                  console.warn(`Slot ${index + 1} creative review unavailable:`, error);
                  return null;
                });
                if (verdict) {
                  analysisUsages.push(verdict.usage);
                  console.log(`Slot ${index + 1} attempt ${attempt + 1} review: ${verdict.score}/10`, verdict.scores, verdict.critical.length ? `critical: ${verdict.critical.join('; ')}` : '');
                }
                const canReroll = attempt < maxAttempts - 1 && deadline - Date.now() >= MIN_TIME_FOR_ATTEMPT_MS;
                if (verdict && !verdict.passed && canReroll) {
                  critique = [verdict.critical.length ? `Deal-breakers: ${verdict.critical.join('; ')}.` : '', verdict.fixes].filter(Boolean).join(' ');
                  send({ type: 'retry', index, attempt: attempt + 1, reason: 'quality' });
                  continue;
                }
                acceptedCount += 1;
                acceptedUrls.set(index, imageUrl);
                send({
                  type: 'creative',
                  index,
                  url: imageUrl,
                  angle: angle.name,
                  withText: slot.withText,
                  attempts: attempt + 1,
                  score: verdict?.score,
                });
                return imageUrl;
              }
              rejectedUrl = imageUrl;
              send({ type: 'retry', index, attempt: attempt + 1 });
            } catch (error) {
              console.error(`Slot ${index + 1} attempt ${attempt + 1} failed:`, error);
            }
          }

          send({ type: 'slot_failed', index });
          return null;
        };

        await Promise.all(slotIndexes.map((index) => produceSlot(index)));

        const failedSlots = slotIndexes.length - acceptedCount;
        if (failedSlots > 0) await refundCreditsForUser(user.id, perImageCost * failedSlots);

        // Video ad: storyboard modelled on the winning sequences, then animate the hero frame.
        let operationId: string | undefined;
        let videoWarning: string | undefined;
        if (video) {
          const heroUrl = acceptedUrls.get(slotIndexes[0]);
          if (!heroUrl) {
            videoCreditsRefunded = video.cost;
            await refundCreditsForUser(user.id, video.cost);
          } else {
            send({ type: 'status', message: 'Writing the storyboard from the winning video ads...' });
            const planned = await planVideoStoryboard({
              context: productContext,
              identityManifest: identity.manifest,
              userDirection,
              adPatterns,
              winningDesigns,
              durationSeconds: video.durationSeconds,
            });
            if (planned.usage) analysisUsages.push(planned.usage);
            send({ type: 'storyboard', storyboard: planned.storyboard });

            if (!isVideoGenerationConfigured()) {
              videoCreditsRefunded = video.cost;
              await refundCreditsForUser(user.id, video.cost);
              videoWarning = 'Video generation is not configured on this server yet (GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON). The hero frame and storyboard were kept; video credits were refunded.';
            } else {
              try {
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
            ? verifierErrors > 0
              ? 'The product check service was unavailable, so no creatives could be verified. Your credits were refunded; please try again in a minute.'
              : 'Every attempt changed the product packaging, so nothing was kept and your credits were refunded. Try a clearer front-facing product image.'
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
