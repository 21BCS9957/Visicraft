import { resizePrice } from '@/lib/playground/resize';

/**
 * Create tab: Seedance 2.5 keeps a start image's own shape, so for another shape the image is
 * first extended to it (the Playground's "Another size" Extend: the original stays pixel for
 * pixel, new space is painted around it). Nano Banana 2 at 1K: about 30 seconds.
 */
export const START_EXTEND_MODEL = 'gemini-3.1-flash-image' as const;
export const START_EXTEND_SIZE = '1K' as const;
export const START_EXTEND_PRICE = resizePrice({ method: 'extend', model: START_EXTEND_MODEL, size: START_EXTEND_SIZE });
export const START_EXTEND_CREDITS = START_EXTEND_PRICE.credits;
