import 'server-only';

import axios from 'axios';
import { PlaygroundGenerationError, type GeneratedImage } from './errors';
import { requestGeminiImage } from './gemini';
import {
  canvasForGemini,
  cropRgb,
  decodeRgb,
  encodePng,
  extendCanvasAt,
  finishExtend,
  JUMP_LIMIT,
  resizeRgb,
  type Alignment,
  type ExtendCanvas,
  type RgbImage,
} from './resizeImage';
import { findTextBand } from './textBand';
import { apiImageSize, type PlaygroundModelId, type PlaygroundSize } from '@/lib/playground/models';
import { clearPlacement, copyDimensions, extendPrompt, extendRequestSize, fullSizeClearPlacement, geminiAspect, placeOriginal, safeApplies, shapeAtLeast, type Rect } from '@/lib/playground/resize';

/** Above this mean difference (0–255) once lined up, Gemini re-composed the picture instead of extending it. */
export const MOVED_LIMIT = 22;

/** Gemini's answer may differ from the canvas shape by this much (Google's sizes aren't exact ratios). */
const SHAPE_TOLERANCE = 0.005;

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 30_000, maxContentLength: 60 * 1024 * 1024 });
  return Buffer.from(response.data);
}

/** An original that can't be downloaded or decoded fails the image (refunded) with a clear reason. */
export async function loadOriginal(url: string): Promise<RgbImage> {
  try {
    return await decodeRgb(await downloadImage(url));
  } catch {
    throw new PlaygroundGenerationError('bad_reference', "The original image couldn't be read. It may have been deleted.");
  }
}

export interface ExtendOutcome extends GeneratedImage {
  /** Gemini calls made (each step tries once more after an unusable answer). */
  calls: number;
  alignment: Alignment | null;
  /** Where the original sits on the copy (pixel for pixel). */
  rect: Rect;
  /**
   * Keep clear: how the original was placed ('slid', 'shrunk', or 'shrunk' because the text
   * couldn't be read; 'full' when Gemini couldn't paint around the shrunk one, so it kept its size).
   */
  placement?: { mode: 'normal' | 'slid' | 'shrunk' | 'full'; textBand?: { top: number; bottom: number } | null; jump?: number; shrunkFailed?: string };
  /** What the person should know about this copy (shown on its card). */
  note?: string;
}

/** On the card of a keep-clear copy that had to stay at full size. */
export const FULL_SIZE_NOTE = 'Kept at full size, as Gemini couldn’t extend it smaller. The top text is clear; the bottom may sit under the Reels caption.';

/** Thrown when Gemini answered but its picture can't be used; carries what was spent. */
export class ExtendRejected extends PlaygroundGenerationError {
  constructor(message: string, public usage: GeneratedImage['usage'], public calls: number, public reason: string) {
    super('failed', message);
  }
}

const REJECTED: Record<string, string> = {
  shape: 'Gemini answered in the wrong shape. Your credits were refunded; try again.',
  unpainted: 'Gemini left the new space empty. Your credits were refunded; try again, or use Remake.',
  moved: 'Gemini redrew the picture instead of only adding to it. Your credits were refunded; try again, or use Remake.',
  jump: "Gemini painted a separate picture around this one instead of continuing it. Your credits were refunded; try again, or use Fit.",
};

type ImageRequest = (model: PlaygroundModelId, body: unknown, deadline: number) => Promise<GeneratedImage>;

interface StepContext {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  deadline: number;
  request: ImageRequest;
  usage: GeneratedImage['usage'];
  calls: number;
}

/**
 * One painting step: Gemini fills the flat strips of `prepared` at the shape `ratio`; its answer
 * is lined up, colour-matched and checked, and the original pasted back. An answer in the wrong
 * shape, with the strips left flat, with the picture moved, or with a separate picture painted
 * around it is tried once more while there is time; then the copy fails (and is refunded).
 */
async function paint(prepared: ExtendCanvas, ratio: string, context: StepContext, attempts = 2): Promise<{ image: RgbImage; alignment: Alignment; jump: number }> {
  const vertical = prepared.strips.some((strip) => strip.side === 'top' || strip.side === 'bottom');
  const horizontal = prepared.strips.some((strip) => strip.side === 'left' || strip.side === 'right');
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: (await canvasForGemini(prepared)).toString('base64') } },
        { text: extendPrompt(vertical && horizontal ? 'around' : vertical ? 'vertical' : 'horizontal') },
      ],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: ratio, imageSize: apiImageSize(extendRequestSize(context.model, context.size)) },
    },
  };

  let reason = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && context.deadline - Date.now() < 90_000) break;
    let answer: GeneratedImage;
    try {
      answer = await context.request(context.model, body, context.deadline);
    } catch (error) {
      // An earlier answer was already paid for: say so with what was spent.
      if (context.calls > 0 && error instanceof PlaygroundGenerationError && error.kind === 'failed') {
        throw new ExtendRejected(REJECTED[reason] ?? error.message, context.usage, context.calls, reason || 'failed');
      }
      throw error;
    }
    context.calls++;
    context.usage.inputTokens += answer.usage.inputTokens;
    context.usage.outputTokens += answer.usage.outputTokens;
    context.usage.totalTokens += answer.usage.totalTokens;

    const decoded = await decodeRgb(answer.bytes);
    const wanted = prepared.width / prepared.height;
    if (Math.abs(decoded.width / decoded.height - wanted) / wanted > SHAPE_TOLERANCE) {
      reason = 'shape';
      console.warn(`Extend: Gemini answered ${decoded.width}×${decoded.height} for a ${prepared.width}×${prepared.height} canvas`);
      continue;
    }
    const result = await finishExtend(prepared, await resizeRgb(decoded, prepared.width, prepared.height));
    const { dx, dy, scale, residual } = result.alignment;
    console.log(`Extend: ${ratio} attempt ${attempt}, shift ${dx.toFixed(1)},${dy.toFixed(1)} px, zoom ${scale.toFixed(3)}, residual ${residual.toFixed(1)}, seam jump ${result.jump.toFixed(1)}${result.unpainted ? ', strips left flat' : ''}`);
    if (result.unpainted) reason = 'unpainted';
    else if (residual > MOVED_LIMIT) reason = 'moved';
    else if (result.jump > JUMP_LIMIT) reason = 'jump';
    else return { image: result.image, alignment: result.alignment, jump: result.jump };
  }
  throw new ExtendRejected(REJECTED[reason] ?? 'Gemini took too long on this image. Try it again.', context.usage, context.calls, reason || 'timeout');
}

/**
 * Extend: the original goes on a canvas of the new shape (14% above it on a 9:16) and Gemini
 * paints the empty strips; the original comes back pixel for pixel.
 *
 * Keep clear of Reels buttons (`safe`, 9:16): a quick look finds the ad's text, and the original
 * slides up or down at its normal size until that text sits between the Reels top bar and the
 * caption area: one painting step, above and below, like a plain Extend. Only text taller than
 * that band makes it shrink; the sides are then painted first (at the original's height) and
 * the top and bottom second, because Gemini, given empty space on all four sides at once,
 * paints a separate picture around the original instead of continuing it.
 */
export async function extendImage(options: {
  sourceUrl: string;
  model: PlaygroundModelId;
  /** The copy's size class (its canvas is at least 1080 px on the short edge); Gemini is asked for the largest size at the same price. */
  size: PlaygroundSize;
  ratio: string;
  /** 9:16: keep the ad's text clear of the Reels buttons. */
  safe?: boolean;
  deadline: number;
  /** For tests: stand in for the Gemini image call and the look for the text. */
  request?: ImageRequest;
  findText?: (image: RgbImage) => Promise<{ top: number; bottom: number } | null>;
}): Promise<ExtendOutcome> {
  const dims = copyDimensions(options.size, options.ratio);
  if (!dims) throw new PlaygroundGenerationError('failed', `A ${options.ratio} copy can't be made at ${options.size}.`);
  const source = await loadOriginal(options.sourceUrl);
  const context: StepContext = {
    model: options.model,
    size: options.size,
    deadline: options.deadline,
    request: options.request ?? requestGeminiImage,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    calls: 0,
  };

  let rect: Rect = placeOriginal(source.width, source.height, dims.width, dims.height, 'extend', options.ratio);
  let mode: 'normal' | 'slid' | 'shrunk' | 'full' = 'normal';
  let shrunkFailed: string | undefined;
  let textBand: { top: number; bottom: number } | null | undefined;
  if (options.safe && safeApplies('extend', options.ratio)) {
    // A quick look for the text; if it can't be had, shrink into the visible band to be sure.
    textBand = await (options.findText ?? findTextBand)(source).catch((error) => {
      console.warn('Extend: the text could not be located:', error instanceof Error ? error.message : error);
      return undefined;
    });
    const placed = textBand === undefined
      ? { rect: placeOriginal(source.width, source.height, dims.width, dims.height, 'extend', options.ratio, true), shrunk: true }
      : clearPlacement(source.width, source.height, dims.width, dims.height, textBand, 'extend');
    rect = placed.rect;
    mode = placed.shrunk ? 'shrunk' : 'slid';
  }
  const original = await resizeRgb(source, rect.width, rect.height);

  const done = async (image: RgbImage, alignment: Alignment | null, jump?: number): Promise<ExtendOutcome> => ({
    bytes: await encodePng(image),
    mimeType: 'image/png',
    usage: context.usage,
    calls: context.calls,
    alignment,
    rect,
    ...(options.safe ? { placement: { mode, textBand: textBand ?? null, ...(jump !== undefined ? { jump: Number(jump.toFixed(2)) } : {}), ...(shrunkFailed ? { shrunkFailed } : {}) } } : {}),
    ...(mode === 'full' ? { note: FULL_SIZE_NOTE } : {}),
  });

  const sideRoom = rect.left > 0 || rect.left + rect.width < dims.width;
  const endRoom = rect.top > 0 || rect.top + rect.height < dims.height;
  if (!sideRoom && !endRoom) return done(extendCanvasAt(original, dims.width, dims.height, rect).canvas, null);
  if (!(sideRoom && endRoom)) {
    const step = await paint(extendCanvasAt(original, dims.width, dims.height, rect), options.ratio, context);
    return done(step.image, step.alignment, step.jump);
  }

  // Shrunk (keep clear only): each step gets one try here, because a separate picture painted
  // around a small original tends to come back the same way; then the copy keeps its full size.
  const shrunk = rect;
  try {
    // First the sides, on a canvas as tall as the original and wide enough for the copy...
    const sideShape = shapeAtLeast(options.model, dims.width / shrunk.height);
    const sideWidth = Math.max(dims.width, Math.round(shrunk.height * geminiAspect(sideShape)));
    const sideRect: Rect = { left: Math.round((sideWidth - shrunk.width) / 2), top: 0, width: shrunk.width, height: shrunk.height };
    const sides = await paint(extendCanvasAt(original, sideWidth, shrunk.height, sideRect), sideShape, context, 1);
    const band = cropRgb(sides.image, { left: sideRect.left - shrunk.left, top: 0, width: dims.width, height: shrunk.height });
    // ...then the top and bottom around that full-width band (the original inside it stays exact).
    const ends = await paint(extendCanvasAt(band, dims.width, dims.height, { left: 0, top: shrunk.top, width: dims.width, height: shrunk.height }), options.ratio, context, 1);
    return done(ends.image, ends.alignment, Math.max(sides.jump, ends.jump));
  } catch (error) {
    // Out of time, or a failure that isn't about the picture: as before.
    if (!(error instanceof ExtendRejected) || error.reason === 'timeout' || context.deadline - Date.now() < 100_000) throw error;
    console.warn(`Extend: the smaller keep-clear placement failed (${error.reason}); keeping the original at full size`);
    shrunkFailed = error.reason;
    mode = 'full';
    rect = fullSizeClearPlacement(source.width, source.height, dims.width, dims.height, textBand, 'extend');
    const full = await paint(extendCanvasAt(await resizeRgb(source, rect.width, rect.height), dims.width, dims.height, rect), options.ratio, context);
    return done(full.image, full.alignment, full.jump);
  }
}
