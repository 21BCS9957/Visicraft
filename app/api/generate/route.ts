import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeReferenceImages,
  runImageGeneration,
  type ImageGenMode,
} from '@/lib/server/imageGeneration';
import { analyzeProductIdentity, validateProductIdentity } from '@/lib/banana/api';
import {
  buildShopifyCreativePrompts,
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
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
    const creditCost = getServerImageCreditCost(mode, model, resolution);
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
      const identityAnalysis = await analyzeProductIdentity(referenceImages);
      await logUsage({
        user,
        model: identityAnalysis.usage.providerModel || 'gemini-2.5-flash',
        feature: 'image_generation',
        inputTokens: identityAnalysis.usage.inputTokens,
        outputTokens: identityAnalysis.usage.outputTokens,
        totalTokens: identityAnalysis.usage.totalTokens,
        imageCount: 0,
        estimatedCostUsd: estimateGoogleProductAnalysisCostUsd(identityAnalysis.usage),
        creditCost: 0,
        metadata: {
          operation: 'product_identity_analysis',
          referenceCount: referenceImages.length,
          chargedServerSide: true,
        },
      });

      const prompts = buildShopifyCreativePrompts(
        productContext,
        prompt,
        identityAnalysis.manifest
      );
      const fidelityReferences = referenceImages.slice(0, 1);
      const generatedSettled = await Promise.allSettled(
        prompts.map((variantPrompt) => runImageGeneration({
          mode,
          referenceImages: fidelityReferences,
          prompt: variantPrompt,
          model,
          aspectRatio,
          resolution,
          persistToGenerationsTable: false,
          referencePolicy: 'product-lock',
          userId: user.id,
        }))
      );
      const generatedVariants = generatedSettled.flatMap((result, index) =>
        result.status === 'fulfilled' ? [{ index, generated: result.value }] : []
      );

      if (generatedVariants.length === 0) {
        const firstFailure = generatedSettled.find((result) => result.status === 'rejected');
        throw firstFailure && firstFailure.status === 'rejected'
          ? firstFailure.reason
          : new Error('Gemini did not return any images');
      }

      generatedSettled.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Creative variant ${index + 1} failed:`, result.reason);
        }
      });

      const verifiedVariants = await Promise.all(
        generatedVariants.map(async (variant) => {
          const imageUrl = variant.generated.images[0];
          if (!imageUrl) return null;
          const validation = await validateProductIdentity(
            fidelityReferences[0],
            imageUrl,
            identityAnalysis.manifest
          );
          return { ...variant, imageUrl, validation };
        })
      );
      const completedVerifications = verifiedVariants.filter(
        (variant): variant is NonNullable<typeof variant> => variant !== null
      );
      const verificationUsage = sumUsage(
        completedVerifications.map((variant) => variant.validation.usage)
      );

      await logUsage({
        user,
        model: 'gemini-2.5-flash',
        feature: 'image_generation',
        inputTokens: verificationUsage.inputTokens,
        outputTokens: verificationUsage.outputTokens,
        totalTokens: verificationUsage.totalTokens,
        imageCount: 0,
        estimatedCostUsd: estimateGoogleProductAnalysisCostUsd(verificationUsage),
        creditCost: 0,
        metadata: {
          operation: 'product_identity_validation',
          validationCount: completedVerifications.length,
          chargedServerSide: true,
        },
      });

      const acceptedVariants = completedVerifications.filter(
        (variant) => variant.validation.passed
      );
      const images = acceptedVariants.map((variant) => variant.imageUrl);
      const usage = sumUsage(generatedVariants.map((variant) => variant.generated.usage));
      const providerModel = generatedVariants[0]?.generated.usage.providerModel || model || 'nano-banana-pro';
      const billedImageCount = generatedVariants.reduce(
        (count, variant) => count + variant.generated.images.length,
        0
      );
      const estimatedCostUsd = estimateGoogleImageCostUsd({
        model: providerModel,
        resolution: resolution || '2K',
        imageCount: billedImageCount,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      await logUsage({
        user,
        model: providerModel,
        feature: 'image_generation',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        imageCount: billedImageCount,
        estimatedCostUsd,
        creditCost: images.length === 0 ? 0 : creditCost,
        metadata: {
          mode,
          creativeSet: true,
          uiModel: model || 'nano-banana-pro',
          aspectRatio: aspectRatio || '9:16',
          resolution: resolution || '2K',
          referenceCount: referenceImages.length,
          generationReferenceCount: fidelityReferences.length,
          analysisModel: identityAnalysis.usage.providerModel || 'gemini-2.5-flash',
          acceptedImageCount: images.length,
          rejectedImageCount: completedVerifications.length - images.length,
          validationScores: completedVerifications.map((variant) => ({
            variant: variant.index + 1,
            score: variant.validation.score,
            passed: variant.validation.passed,
            reason: variant.validation.reason,
          })),
          appCreditsRefunded: images.length === 0,
          chargedServerSide: true,
        },
      });

      if (images.length === 0) {
        throw new Error('Packaging fidelity check rejected every generated image because the product artwork changed. App credits were refunded. Use a clear, front-facing product image and retry.');
      }

      return NextResponse.json({
        success: true,
        images,
        warning: images.length < prompts.length
          ? `${images.length} of ${prompts.length} creative angles passed the packaging fidelity check. The altered versions were withheld.`
          : undefined,
        usage: {
          ...usage,
          imageCount: billedImageCount,
          returnedImageCount: images.length,
          estimatedCostUsd,
          creditsDeducted: creditCost,
        },
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
