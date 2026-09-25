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
    const perImageCost = getServerImageCreditCost(mode, model, resolution);
    const creditCost = creativeSet ? perImageCost * CREATIVE_SLOTS.length : perImageCost;
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
  perImageCost: number;
  creditCost: number;
}

/**
 * Generates the 4-slot Meta ad set and streams NDJSON events as each slot passes
 * the product-identity check. Failed slots are repaired, then regenerated, before
 * giving up; unfilled slots are refunded.
 */
function streamCreativeSet(options: CreativeSetOptions): Response {
  const { user, mode, referenceImages, userDirection, model, resolution, productContext, adPatterns, perImageCost, creditCost } = options;
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const generationUsages: ProviderUsage[] = [];
      const analysisUsages: ProviderUsage[] = [];
      const validationScores: Array<{ slot: number; attempt: number; score: number; passed: boolean; reason: string }> = [];
      let billedImageCount = 0;
      let acceptedCount = 0;
      let verifierErrors = 0;

      try {
        send({ type: 'status', message: 'Locking the exact product from your store images...' });
        const identity = await analyzeProductIdentity(referenceImages);
        analysisUsages.push(identity.usage);
        const canonicalImage = referenceImages[identity.canonicalReferenceIndex] ?? referenceImages[0];

        send({ type: 'status', message: 'Planning four ad angles...', canonicalImage });
        const plan = await planAdAngles({
          context: productContext,
          identityManifest: identity.manifest,
          userDirection,
          adPatterns,
        });
        if (plan.usage) analysisUsages.push(plan.usage);
        send({
          type: 'angles',
          angles: plan.angles.map((angle, index) => ({
            name: angle.name,
            withText: CREATIVE_SLOTS[index].withText,
          })),
        });
        send({ type: 'status', message: 'Generating four Meta ad creatives...' });

        const produceSlot = async (index: number) => {
          const slot = CREATIVE_SLOTS[index];
          const angle = plan.angles[index];
          const slotPrompt = buildMetaAdCreativePrompt({
            context: productContext,
            userDirection,
            identityManifest: identity.manifest,
            angle,
            withText: slot.withText,
          });
          let rejectedUrl: string | null = null;

          for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SLOT; attempt++) {
            if (attempt > 0 && deadline - Date.now() < MIN_TIME_FOR_ATTEMPT_MS) break;
            // Attempt 2 repairs the rejected composition; attempt 3 starts fresh.
            const repair = attempt === 1 && rejectedUrl !== null;
            try {
              const generated = await runImageGeneration({
                mode,
                referenceImages: repair ? [canonicalImage, rejectedUrl as string] : [canonicalImage],
                prompt: slotPrompt,
                model,
                aspectRatio: '9:16',
                resolution,
                persistToGenerationsTable: false,
                referencePolicy: repair ? 'product-repair' : 'product-lock',
                userId: user.id,
              });
              generationUsages.push(generated.usage);
              billedImageCount += generated.images.length;
              const imageUrl = generated.images[0];
              if (!imageUrl) continue;

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
                  reason: validation.reason,
                });
              }

              if (validation?.passed) {
                acceptedCount += 1;
                send({
                  type: 'creative',
                  index,
                  url: imageUrl,
                  angle: angle.name,
                  withText: slot.withText,
                  attempts: attempt + 1,
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

        await Promise.all(CREATIVE_SLOTS.map((_, index) => produceSlot(index)));

        const failedSlots = CREATIVE_SLOTS.length - acceptedCount;
        if (failedSlots > 0) await refundCreditsForUser(user.id, perImageCost * failedSlots);

        send({
          type: 'done',
          acceptedCount,
          creditsDeducted: perImageCost * acceptedCount,
          warning: acceptedCount === 0
            ? verifierErrors > 0
              ? 'The product check service was unavailable, so no creatives could be verified. Your credits were refunded; please try again in a minute.'
              : 'Every attempt changed the product packaging, so nothing was kept and your credits were refunded. Try a clearer front-facing product image.'
            : failedSlots > 0
              ? `${acceptedCount} of ${CREATIVE_SLOTS.length} ads passed the product check. Credits for the other ${failedSlots} were refunded.`
              : undefined,
        });
      } catch (error) {
        console.error('Creative set error:', error);
        const unfilled = CREATIVE_SLOTS.length - acceptedCount;
        await refundCreditsForUser(user.id, perImageCost * unfilled).catch(() => undefined);
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
      creditsRefunded: input.creditCost - input.perImageCost * input.acceptedCount,
      validationScores: input.validationScores,
      chargedServerSide: true,
    },
  });
}
