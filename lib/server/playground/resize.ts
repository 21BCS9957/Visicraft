import 'server-only';

import sharp from 'sharp';
import type { User } from '@supabase/supabase-js';
import { findPaddedBands } from '@/lib/server/paddedBands';
import { logUsage } from '@/lib/server/usage';
import type { Db } from './db';
import { PlaygroundGenerationError, type GeneratedImage } from './errors';
import { ExtendRejected, extendImage, loadOriginal } from './extend';
import { generatePlaygroundImage } from './generate';
import { enlargeTo, fitImage } from './resizeImage';
import { findTextBand } from './textBand';
import {
  clearPlacement,
  copyDimensions,
  layoutLabel,
  MIN_COPY_EDGE,
  placeOriginal,
  remakeInstruction,
  resizePrice,
  safeApplies,
  type Rect,
  type TextBand,
} from '@/lib/playground/resize';
import type { PlaygroundRun } from '@/lib/playground/types';

/**
 * Makes one image of an "Another size" run from its original: Fit (a composite, no AI), Extend
 * (Gemini paints new space, the original stays exact) or Remake (the ad made again in the new
 * shape, the original sent as its layout). The generate route charges, saves and refunds as for
 * any other image.
 */

export interface OtherSize extends GeneratedImage {
  /** Provider calls made: Extend and Remake try once more after an unusable answer. */
  calls: number;
  /** Logged with the usage. */
  details: Record<string, unknown>;
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** The original a copy is made from; a deleted one fails the copy (and refunds it) with a clear reason. */
async function originalOf(db: Db, userId: string, parentItemId: string | null): Promise<{ url: string; aspectRatio: string }> {
  const missing = new PlaygroundGenerationError('failed', "The original image was deleted, so this size can't be made. Your credits were refunded.");
  if (!parentItemId) throw missing;
  const { data, error } = await db
    .from('playground_items')
    .select('image_url, aspect_ratio, status')
    .eq('id', parentItemId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new PlaygroundGenerationError('failed', "The original image couldn't be loaded. Your credits were refunded; try again.");
  const row = data as { image_url: string | null; aspect_ratio: string; status: string } | null;
  if (!row?.image_url || row.status !== 'done') throw missing;
  return { url: row.image_url, aspectRatio: row.aspect_ratio };
}

/** A model shown the 4:5 layout sometimes keeps that shape and pads the rest with a blurred strip. */
async function padded(bytes: Buffer): Promise<boolean> {
  const meta = await sharp(bytes).metadata();
  const bands = await findPaddedBands(bytes);
  if (bands.top || bands.bottom) return true;
  if ((meta.width ?? 0) / (meta.height || 1) < 0.7) return false;
  const sides = await findPaddedBands(await sharp(bytes).rotate(90).toBuffer());
  return Boolean(sides.top || sides.bottom);
}

export async function makeOtherSize(options: {
  db: Db;
  user: User;
  run: PlaygroundRun;
  /** The copy: its shape and the original it is made from. */
  item: { id: string; aspectRatio: string; parentItemId: string | null };
  /** The original's prompt (Remake makes the ad again from it). */
  prompt: string;
  deadline: number;
}): Promise<OtherSize> {
  const { run, item, deadline } = options;
  const resize = run.resize;
  if (!resize) throw new PlaygroundGenerationError('failed', 'This image has no original to resize.');
  const original = await originalOf(options.db, options.user.id, item.parentItemId);

  if (resize.method === 'fit') {
    const dims = copyDimensions(run.size, item.aspectRatio);
    if (!dims) throw new PlaygroundGenerationError('failed', `A ${item.aspectRatio} copy can't be made at ${run.size}.`);
    const source = await loadOriginal(original.url);
    let place: Rect | undefined;
    let textBand: TextBand | null | undefined;
    if (resize.safe && safeApplies('fit', item.aspectRatio)) {
      // Slide the image so its text is visible; shrink into the visible band if the text can't be located.
      textBand = await findTextBand(source).catch(() => undefined);
      place = textBand === undefined
        ? placeOriginal(source.width, source.height, dims.width, dims.height, 'fit', item.aspectRatio, true)
        : clearPlacement(source.width, source.height, dims.width, dims.height, textBand, 'fit').rect;
    }
    const { bytes } = await fitImage(source, dims.width, dims.height, item.aspectRatio, resize.background ?? 'blur', place);
    return { bytes, mimeType: 'image/jpeg', usage: NO_USAGE, calls: 0, details: { background: resize.background ?? 'blur', ...(resize.safe ? { safe: true, textBand: textBand ?? null } : {}) } };
  }

  const perCall = resizePrice({ method: resize.method, model: run.model, size: run.size, quality: run.quality, referenceCount: run.references.length }).usd;

  if (resize.method === 'extend') {
    try {
      const extended = await extendImage({ sourceUrl: original.url, model: run.model, size: run.size, ratio: item.aspectRatio, safe: resize.safe === true, deadline });
      return { ...extended, costUsd: perCall * extended.calls, details: { alignment: extended.alignment, ...(extended.placement ? { safe: true, placement: extended.placement } : {}) } };
    } catch (error) {
      // Gemini was paid for answers that couldn't be used; the copy itself is refunded.
      if (error instanceof ExtendRejected && error.calls > 0) {
        await logUsage({
          user: options.user,
          provider: 'google',
          model: run.model,
          feature: 'image_generation',
          inputTokens: error.usage.inputTokens,
          outputTokens: error.usage.outputTokens,
          totalTokens: error.usage.totalTokens,
          imageCount: 0,
          estimatedCostUsd: perCall * error.calls,
          creditCost: 0,
          metadata: { mode: 'playground', resize: 'extend', runId: run.id, itemId: item.id, rejected: error.reason },
        });
      }
      throw error;
    }
  }

  // Remake: the same prompt, references and guidelines, with the original as the last image.
  const imageNumber = run.references.length + 1;
  const make = () => generatePlaygroundImage({
    model: run.model,
    size: run.size,
    aspectRatio: item.aspectRatio,
    thinking: run.thinking,
    quality: run.quality,
    brief: run.brief,
    references: run.references,
    prompt: `${options.prompt}\n\n${remakeInstruction({ imageNumber, fromRatio: original.aspectRatio, toRatio: item.aspectRatio })}`,
    layout: { url: original.url, label: layoutLabel(imageNumber, original.aspectRatio) },
    deadline,
  });
  const first = await make();
  const usage = { ...first.usage };
  let costUsd = first.costUsd ?? perCall;
  let image = first;
  let calls = 1;
  let repadded = false;
  if (await padded(first.bytes).catch(() => false)) {
    repadded = true;
    console.log(`Remake: image ${item.id} came back padded at ${item.aspectRatio}; trying once more`);
    if (deadline - Date.now() > 90_000) {
      const again = await make().catch(() => null);
      if (again) {
        calls++;
        usage.inputTokens += again.usage.inputTokens;
        usage.outputTokens += again.usage.outputTokens;
        usage.totalTokens += again.usage.totalTokens;
        costUsd += again.costUsd ?? perCall;
        image = again;
      }
    }
  }
  // A model that only makes 1K at this price still gives Meta at least 1080 px on the short edge.
  const sized = await enlargeTo(image.bytes, image.mimeType, MIN_COPY_EDGE);
  return { ...image, ...sized, usage, costUsd, calls, details: repadded ? { paddedFirstTry: true } : {} };
}
