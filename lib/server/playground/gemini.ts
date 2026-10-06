import 'server-only';

import axios from 'axios';
import { PlaygroundGenerationError, type GeneratedImage } from './errors';
import { guidelinesText, loadReferences, orderedReferences, promptText, referenceLabel, roleRules } from './promptParts';
import { apiImageSize, type PlaygroundModelId, type PlaygroundSize, type ThinkingLevel } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

// Callers that predate errors.ts import these from here.
export { PlaygroundGenerationError } from './errors';
export type { GeneratedImage, GenerationErrorKind } from './errors';

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

/** Guidelines, then the references grouped by role and numbered, then the rules per role, then the prompt. */
async function buildParts(options: { brief: string; references: ReferenceSnapshot[]; prompt: string }): Promise<Part[]> {
  const parts: Part[] = [];
  const guidelines = guidelinesText(options.brief);
  if (guidelines) parts.push({ text: guidelines });

  const ordered = orderedReferences(options.references);
  if (ordered.length) {
    const loaded = await loadReferences(ordered);
    parts.push({ text: 'Reference images:' });
    loaded.forEach(({ reference, image }, index) => {
      parts.push(
        { text: referenceLabel(reference, index + 1) },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      );
    });
    parts.push({ text: roleRules(ordered) });
  }

  parts.push({ text: promptText(options.prompt) });
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
    // Billing answers (some come as 429 RESOURCE_EXHAUSTED) won't clear by waiting: pause instead of retrying.
    if (/spend(ing)? cap/i.test(message)) {
      return new PlaygroundGenerationError('paused', 'Your Gemini project has reached its monthly spending cap. Raise the cap in Google AI Studio (ai.studio/spend), then resume.');
    }
    if (status === 402 || /prepayment|credits are depleted/i.test(message)) {
      return new PlaygroundGenerationError('paused', 'Your Gemini prepaid credits are used up. Add credit in Google AI Studio, then resume.');
    }
    if (status === 429) {
      if (isDailyQuota(details)) {
        return new PlaygroundGenerationError('paused', "Today's Gemini image quota for this key is used up. It resets tomorrow, or raise the limit in Google AI Studio.");
      }
      if (/exceeded your current quota|check your plan and billing/i.test(message)) {
        return new PlaygroundGenerationError('paused', "Gemini says this key's quota is used up. Check the plan and billing in Google AI Studio, then resume.");
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
export async function generateGeminiImage(options: {
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
