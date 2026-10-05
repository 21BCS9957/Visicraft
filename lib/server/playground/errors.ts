import 'server-only';

/** What a failed image means for the Playground's queue, whichever provider made it. */
export type GenerationErrorKind =
  /** The provider is busy (429 / overloaded): put the image back in the queue. */
  | 'rate_limited'
  /** Billing, key or daily quota: nothing will work until someone fixes it; pause the run. */
  | 'paused'
  /** Safety filters or a blocked prompt. */
  | 'blocked'
  | 'no_image'
  | 'bad_reference'
  | 'timeout'
  | 'failed';

export class PlaygroundGenerationError extends Error {
  constructor(
    public kind: GenerationErrorKind,
    message: string,
    public retryAfterMs?: number
  ) {
    super(message);
  }
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** The provider's price for this image when its usage tells us (OpenAI bills by tokens). */
  costUsd?: number;
}
