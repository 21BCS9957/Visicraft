import 'server-only';

import axios from 'axios';
import { loadReferenceImage } from './references';
import { apiImageSize, ROLE_LABELS, type PlaygroundModelId, type PlaygroundSize, type ReferenceRole, type ThinkingLevel } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ImageResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
    finishMessage?: string;
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

export type GenerationErrorKind =
  /** Gemini is busy (429 / overloaded): put the image back in the queue. */
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
}

const ROLE_ORDER: ReferenceRole[] = ['product', 'person', 'style'];

const ROLE_RULES: Record<ReferenceRole, (images: string) => string> = {
  product: (images) =>
    `${images} show the product. Reproduce it exactly: the same shape, proportions, colours, materials, logo, printed text and every detail. Do not redesign, recolour or simplify it.`,
  person: (images) =>
    `${images} show the person to feature. Keep their face, hair and identity exactly; pose, outfit and expression may follow the prompt.`,
  style: (images) =>
    `${images} are style references: match their lighting, colour grade, composition and mood, but do not copy their products, people, logos or text.`,
};

function imageList(numbers: number[]): string {
  if (numbers.length === 1) return `Image ${numbers[0]}`;
  return `Images ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/** Loads every reference; one that can't be read fails the image rather than silently vanishing. */
async function loadReferences(references: ReferenceSnapshot[]) {
  return Promise.all(references.map(async (reference) => {
    try {
      return { reference, image: await loadReferenceImage(reference.url) };
    } catch {
      const name = reference.label || ROLE_LABELS[reference.role].toLowerCase();
      throw new PlaygroundGenerationError('bad_reference', `A reference image (${name}) couldn't be read. Remove it or upload it again.`);
    }
  }));
}

/** Guidelines, then the references grouped by role and numbered, then the rules per role, then the prompt. */
async function buildParts(options: { brief: string; references: ReferenceSnapshot[]; prompt: string }): Promise<Part[]> {
  const parts: Part[] = [];
  const brief = options.brief.trim();
  if (brief) {
    parts.push({ text: `Project guidelines (Markdown). Follow them for every image in this project; the prompt at the end describes this particular image:\n${brief}` });
  }

  const ordered = ROLE_ORDER.flatMap((role) => options.references.filter((reference) => reference.role === role));
  if (ordered.length) {
    const loaded = await loadReferences(ordered);
    const numbersByRole: Record<ReferenceRole, number[]> = { product: [], person: [], style: [] };
    parts.push({ text: 'Reference images:' });
    loaded.forEach(({ reference, image }, index) => {
      const number = index + 1;
      numbersByRole[reference.role].push(number);
      const label = reference.label.trim();
      parts.push(
        { text: `Image ${number} (${ROLE_LABELS[reference.role]}${label ? `: ${label}` : ''}):` },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      );
    });
    const rules = ROLE_ORDER
      .filter((role) => numbersByRole[role].length)
      .map((role) => ROLE_RULES[role](imageList(numbersByRole[role])));
    parts.push({ text: rules.join('\n') });
  }

  parts.push({ text: `Create this image:\n${options.prompt.trim()}` });
  return parts;
}

function retryDelayMs(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const delay = (detail as { retryDelay?: string })?.retryDelay;
    if (typeof delay === 'string') {
      const seconds = Number.parseFloat(delay);
      if (Number.isFinite(seconds)) return Math.min(120_000, Math.max(5_000, Math.round(seconds * 1000)));
    }
  }
  return undefined;
}

function isDailyQuota(details: unknown): boolean {
  return JSON.stringify(details ?? '').toLowerCase().includes('perday');
}

/** Turns a Gemini HTTP or network failure into what the Playground should do about it. */
export function classifyGeminiError(error: unknown): PlaygroundGenerationError {
  if (error instanceof PlaygroundGenerationError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data as { error?: { message?: string; status?: string; details?: unknown } } | undefined;
    const message = body?.error?.message ?? error.message;
    const details = body?.error?.details;

    if (!status) {
      if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message)) {
        return new PlaygroundGenerationError('timeout', 'Gemini took too long on this image. Try it again.');
      }
      return new PlaygroundGenerationError('failed', "Couldn't reach Gemini. Check the connection and try again.");
    }
    if (status === 429) {
      if (isDailyQuota(details)) {
        return new PlaygroundGenerationError('paused', "Today's Gemini image quota for this key is used up. It resets tomorrow, or raise the limit in Google AI Studio.");
      }
      return new PlaygroundGenerationError('rate_limited', 'Gemini is busy; this image is back in the queue.', retryDelayMs(details) ?? 20_000);
    }
    if (status === 503 || /overloaded|unavailable/i.test(message)) {
      return new PlaygroundGenerationError('rate_limited', 'Gemini is overloaded; this image is back in the queue.', 20_000);
    }
    if (status === 403 && /dunning|billing/i.test(message)) {
      return new PlaygroundGenerationError('paused', 'Google blocked the Gemini API key because of a billing problem. Fix billing in Google Cloud, then resume.');
    }
    if (status === 401 || status === 403 || /api key not valid/i.test(message)) {
      return new PlaygroundGenerationError('paused', 'Google rejected the Gemini API key. Check GEMINI_API_KEY, then resume.');
    }
    if (status === 404) {
      return new PlaygroundGenerationError('paused', 'This Gemini image model is not available for the API key.');
    }
    if (status === 400) {
      if (/safety|blocked|prohibited/i.test(message)) {
        return new PlaygroundGenerationError('blocked', "Gemini's safety filters blocked this prompt. Try rewording it.");
      }
      return new PlaygroundGenerationError('failed', `Gemini rejected the request: ${message}`);
    }
    return new PlaygroundGenerationError('failed', `Gemini error (${status}): ${message}`);
  }
  return new PlaygroundGenerationError('failed', error instanceof Error ? error.message : 'Image generation failed.');
}

const SAFETY_REASONS = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/;

function readImage(data: ImageResponse): GeneratedImage {
  if (data.promptFeedback?.blockReason) {
    throw new PlaygroundGenerationError('blocked', "Gemini's safety filters blocked this prompt. Try rewording it.");
  }
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  // Thinking models can return draft ("thought") images first; the answer is the last real one.
  const image = [...parts].reverse().find((part) => part.inlineData?.data && !part.thought);
  if (!image?.inlineData?.data) {
    const reason = candidate?.finishReason ?? '';
    if (SAFETY_REASONS.test(reason)) {
      throw new PlaygroundGenerationError('blocked', "Gemini's safety filters blocked this image. Try rewording the prompt or using different references.");
    }
    const text = parts.filter((part) => !part.thought).map((part) => part.text?.trim()).filter(Boolean).join(' ');
    throw new PlaygroundGenerationError('no_image', text ? `Gemini answered without an image: ${text.slice(0, 300)}` : `Gemini returned no image${reason ? ` (${reason})` : ''}. Try again.`);
  }
  const usage = data.usageMetadata;
  const inputTokens = Number(usage?.promptTokenCount) || 0;
  const outputTokens = Number(usage?.candidatesTokenCount) || 0;
  return {
    bytes: Buffer.from(image.inlineData.data, 'base64'),
    mimeType: image.inlineData.mimeType || 'image/png',
    usage: { inputTokens, outputTokens, totalTokens: Number(usage?.totalTokenCount) || inputTokens + outputTokens },
  };
}

/**
 * One image for one prompt, with the project's brief and references. Transient server
 * errors are retried once while enough time is left before `deadline`; 429s are not retried
 * here (the browser re-queues the image and slows down).
 */
export async function generatePlaygroundImage(options: {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  aspectRatio: string;
  thinking: ThinkingLevel | null;
  brief: string;
  references: ReferenceSnapshot[];
  prompt: string;
  /** Epoch ms after which no new attempt may start. */
  deadline: number;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new PlaygroundGenerationError('paused', 'GEMINI_API_KEY is not configured on the server.');

  const parts = await buildParts(options);
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: options.aspectRatio, imageSize: apiImageSize(options.size) },
  };
  if (options.thinking === 'high') generationConfig.thinkingConfig = { thinkingLevel: 'high' };
  const body = { contents: [{ role: 'user', parts }], generationConfig };

  for (let attempt = 1; ; attempt++) {
    const remaining = options.deadline - Date.now() - 20_000;
    if (remaining < 30_000) {
      throw new PlaygroundGenerationError('timeout', 'Gemini took too long on this image. Try it again.');
    }
    try {
      const response = await axios.post<ImageResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
        body,
        {
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          timeout: Math.min(180_000, remaining),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      return readImage(response.data);
    } catch (error) {
      const classified = classifyGeminiError(error);
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const transient = classified.kind === 'failed' && (status === undefined || status >= 500);
      if (transient && attempt < 2 && options.deadline - Date.now() > 90_000) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      throw classified;
    }
  }
}
