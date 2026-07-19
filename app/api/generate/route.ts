import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeReferenceImages,
  runImageGeneration,
  type ImageGenMode,
} from '@/lib/server/imageGeneration';
import {
  buildShopifyCreativePrompts,
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
import {
  deductCreditsForUser,
  estimateGoogleImageCostUsd,
  getServerImageCreditCost,
  logUsage,
  refundCreditsForUser,
  requireAuthenticatedUser,
  sumUsage,
} from '@/lib/server/usage';

const MODES: ImageGenMode[] = ['generate', 'thumbnail', 'edit', 'upscale', 'unblur'];

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
      const prompts = buildShopifyCreativePrompts(productContext, prompt);
      const fidelityReferences = referenceImages.slice(0, 6);
      const generatedSets = await Promise.all(
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
      const images = generatedSets.flatMap((generated) => generated.images.slice(0, 1));
      const usage = sumUsage(generatedSets.map((generated) => generated.usage));
      const providerModel = generatedSets[0]?.usage.providerModel || model || 'nano-banana-pro';
      const estimatedCostUsd = estimateGoogleImageCostUsd({
        model: providerModel,
        resolution: resolution || '2K',
        imageCount: images.length,
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
        imageCount: images.length,
        estimatedCostUsd,
        creditCost,
        metadata: {
          mode,
          creativeSet: true,
          uiModel: model || 'nano-banana-pro',
          aspectRatio: aspectRatio || '9:16',
          resolution: resolution || '2K',
          referenceCount: referenceImages.length,
          chargedServerSide: true,
        },
      });

      return NextResponse.json({
        success: true,
        images,
        usage: {
          ...usage,
          imageCount: images.length,
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
