import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { isOwnStorageUrl } from '@/lib/server/playground/db';
import { PlaygroundGenerationError } from '@/lib/server/playground/errors';
import { generatePlaygroundImage } from '@/lib/server/playground/generate';
import { savePlaygroundImage } from '@/lib/server/playground/images';
import { deductCreditsForUser, logUsage, refundCreditsForUser } from '@/lib/server/usage';
import { MAX_ENABLED_REFERENCES, playgroundModel, sizeOption } from '@/lib/playground/models';
import { MAX_PROMPT_CHARS } from '@/lib/playground/prompts';

export const maxDuration = 300;

const MODEL = 'gemini-3-pro-image';
const SIZE = '2K';

const DirectRequest = z.object({
  prompt: z.string().max(MAX_PROMPT_CHARS),
  referenceImages: z.array(z.string()).max(MAX_ENABLED_REFERENCES),
  aspectRatio: z.string(),
  count: z.number().int().min(1).max(4),
});

/**
 * Home without a product URL: the prompt (and any uploaded images, used as product
 * references) straight to Nano Banana Pro, 1-4 images, with no ad planning.
 * Charged per image up front; images that fail are refunded.
 */
export async function POST(request: NextRequest) {
  const deadline = Date.now() + 270_000;
  let charged: { userId: string; credits: number } | null = null;
  try {
    const user = await withUser(request);
    const parsed = DirectRequest.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid request.', 'bad_request');
    const body = parsed.data;
    const prompt = body.prompt.trim();
    if (!prompt && !body.referenceImages.length) throw new ApiError(400, 'Describe the image you want, or add a photo.', 'bad_request');
    if (body.referenceImages.some((url) => !isOwnStorageUrl(url))) throw new ApiError(400, 'Upload the images first.', 'bad_request');
    const model = playgroundModel(MODEL);
    if (!model.ratios.includes(body.aspectRatio)) throw new ApiError(400, `Unsupported size ${body.aspectRatio}.`, 'bad_request');

    const price = sizeOption(model, SIZE)!;
    const total = price.credits * body.count;
    if (!(await deductCreditsForUser(user.id, total))) {
      throw new ApiError(402, `These ${body.count} image${body.count === 1 ? '' : 's'} need ${total} credits.`, 'insufficient_credits', { needed: total });
    }
    charged = { userId: user.id, credits: total };

    const references = body.referenceImages.map((url, index) => ({ id: `upload-${index}`, url, role: 'product' as const, label: '' }));
    const outcomes = await Promise.allSettled(Array.from({ length: body.count }, async () => {
      const generated = await generatePlaygroundImage({
        model: model.id,
        size: SIZE,
        aspectRatio: body.aspectRatio,
        thinking: null,
        brief: '',
        references,
        prompt: prompt || 'Create a polished, advertising-quality product photograph of the product from the reference images.',
        deadline,
      });
      const saved = await savePlaygroundImage(generated.bytes, generated.mimeType);
      return { saved, usage: generated.usage };
    }));

    const images = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
    const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
    const refund = failures.length * price.credits;
    if (refund > 0) await refundCreditsForUser(user.id, refund);
    charged = null;

    if (images.length) {
      await logUsage({
        user,
        model: model.id,
        feature: 'image_generation',
        inputTokens: images.reduce((sum, image) => sum + image.usage.inputTokens, 0),
        outputTokens: images.reduce((sum, image) => sum + image.usage.outputTokens, 0),
        totalTokens: images.reduce((sum, image) => sum + image.usage.totalTokens, 0),
        imageCount: images.length,
        estimatedCostUsd: images.length * price.usd,
        creditCost: images.length * price.credits,
        metadata: { mode: 'home_direct', aspectRatio: body.aspectRatio, requested: body.count, referenceCount: references.length },
      });
    }

    const firstFailure = failures[0];
    const message = firstFailure instanceof PlaygroundGenerationError || firstFailure instanceof Error ? firstFailure.message : undefined;
    if (!images.length) {
      const status = firstFailure instanceof PlaygroundGenerationError && firstFailure.kind === 'blocked' ? 422 : 502;
      return NextResponse.json({ error: `${message ?? 'The images could not be made.'} Your credits were refunded.`, refunded: total }, { status });
    }
    return NextResponse.json({
      images: images.map(({ saved }) => ({ url: saved.imageUrl, previewUrl: saved.previewUrl, width: saved.width, height: saved.height })),
      failed: failures.length,
      credits: images.length * price.credits,
      message: failures.length ? `${failures.length} of ${body.count} failed and were refunded${message ? `: ${message}` : ''}.` : undefined,
    });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits);
    return apiErrorResponse(error, 'Could not make the images');
  }
}
