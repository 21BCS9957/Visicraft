import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedItem, isOwnStorageUrl, playgroundDb } from '@/lib/server/playground/db';
import { aiEditImage, closestRatio, sizeForImage, type AiEditMode } from '@/lib/server/playground/aiEdit';
import { PlaygroundGenerationError } from '@/lib/server/playground/gemini';
import { PLAYGROUND_BUCKET } from '@/lib/server/playground/images';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';
import { deductCreditsForUser, logUsage, refundCreditsForUser } from '@/lib/server/usage';
import { isPlaygroundModel, playgroundModel, sizeOption } from '@/lib/playground/models';

export const maxDuration = 300;

type Context = { params: Promise<{ itemId: string }> };

const MAX_MASK_CHARS = 4 * 1024 * 1024;
const DEFAULT_EDIT_MODEL = 'gemini-3.1-flash-image';

const STATUS: Record<PlaygroundGenerationError['kind'], number> = {
  rate_limited: 429,
  paused: 503,
  blocked: 422,
  no_image: 502,
  bad_reference: 400,
  timeout: 504,
  failed: 500,
};

/**
 * AI Erase / Replace in the Canvas: { baseUrl, mask (PNG data URL, white = painted), mode,
 * instruction?, model? }. Charges one image at the picture's size, refunds if it fails, and
 * returns the edited picture (only the painted area differs).
 */
export async function POST(request: NextRequest, { params }: Context) {
  const deadline = Date.now() + 270_000;
  let charged: { userId: string; credits: number } | null = null;
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'image');
    const body = await readJson<{ baseUrl?: unknown; mask?: unknown; mode?: unknown; instruction?: unknown; model?: unknown; width?: unknown; height?: unknown }>(request);
    const db = playgroundDb();
    const item = await getOwnedItem(db, itemId, user.id, 'id, project_id, status, image_url, width, height, aspect_ratio');
    if (item.status !== 'done' || typeof item.image_url !== 'string') throw new ApiError(400, 'Only finished images can be edited.', 'bad_request');

    const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl ? body.baseUrl : item.image_url;
    if (!isOwnStorageUrl(baseUrl)) throw new ApiError(400, 'The picture to edit must come from this app.', 'bad_request');
    if (typeof body.mask !== 'string' || !body.mask.startsWith('data:image/png;base64,') || body.mask.length > MAX_MASK_CHARS) {
      throw new ApiError(400, 'Paint over the area to change first.', 'bad_request');
    }
    const mode: AiEditMode = body.mode === 'replace' ? 'replace' : 'remove';
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 600) : '';
    if (mode === 'replace' && !instruction) throw new ApiError(400, 'Say what to put in the painted area.', 'bad_request');

    const model = playgroundModel(isPlaygroundModel(body.model) ? body.model : DEFAULT_EDIT_MODEL);
    const width = typeof body.width === 'number' && body.width > 0 ? body.width : Number(item.width) || 1024;
    const height = typeof body.height === 'number' && body.height > 0 ? body.height : Number(item.height) || 1024;
    const size = sizeForImage(width, height, model.sizes.map((option) => option.id));
    const price = sizeOption(model, size)!;
    const ratio = model.ratios.includes(item.aspect_ratio as string) ? (item.aspect_ratio as string) : closestRatio(width, height, model.ratios);

    if (!(await deductCreditsForUser(user.id, price.credits))) {
      throw new ApiError(402, `This edit needs ${price.credits} credits.`, 'insufficient_credits', { needed: price.credits });
    }
    charged = { userId: user.id, credits: price.credits };

    const edited = await aiEditImage({
      baseUrl,
      mask: Buffer.from(body.mask.slice('data:image/png;base64,'.length), 'base64'),
      mode,
      instruction,
      model: model.id,
      size,
      aspectRatio: ratio,
      deadline,
    });
    const imageUrl = await uploadBufferToBucket(edited.bytes, PLAYGROUND_BUCKET, edited.mimeType);
    charged = null;

    await logUsage({
      user,
      model: model.id,
      feature: 'image_generation',
      inputTokens: edited.usage.inputTokens,
      outputTokens: edited.usage.outputTokens,
      totalTokens: edited.usage.totalTokens,
      imageCount: 1,
      estimatedCostUsd: price.usd,
      creditCost: price.credits,
      metadata: { mode: 'playground_edit', editMode: mode, projectId: item.project_id, itemId, imageSize: size, aspectRatio: ratio },
    });
    return NextResponse.json({ imageUrl, width: edited.width, height: edited.height, credits: price.credits });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits);
    if (error instanceof PlaygroundGenerationError) {
      return NextResponse.json({ error: error.message, code: error.kind, refunded: Boolean(charged) }, { status: STATUS[error.kind] });
    }
    return apiErrorResponse(error, 'The edit failed. Your credits were refunded');
  }
}
