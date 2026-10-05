import 'server-only';

import { PlaygroundGenerationError, type GeneratedImage } from './errors';
import { guidelinesText, loadReferences, orderedReferences, promptText, referenceLabel, roleRules } from './promptParts';
import { DEFAULT_QUALITY, openAiImageSize, type ImageQuality, type PlaygroundModelId, type PlaygroundSize } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

/**
 * Playground images from OpenAI's GPT Image 2.5 models (OPENAI_API_KEY). With references the
 * image goes through POST /v1/images/edits (up to 16 images, high input fidelity so products
 * stay faithful); without, POST /v1/images/generations. Both answer with base64 PNG and token
 * usage, which prices the image.
 */

const API_BASE = 'https://api.openai.com/v1';

/** GPT Image 2.5 prices per million tokens (October 2026). */
const USD_PER_MILLION = { text: 5, image: 8, output: 30 };

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
  error?: { message?: string; code?: string | null; type?: string };
}

/** An OpenAI HTTP answer that wasn't an image, as the queue should treat it. */
function classifyOpenAiError(status: number, data: OpenAiImageResponse, retryAfter: string | null): PlaygroundGenerationError {
  const message = data.error?.message ?? `HTTP ${status}`;
  const code = data.error?.code ?? '';
  if (status === 429) {
    if (code === 'insufficient_quota' || /quota|billing/i.test(message)) {
      return new PlaygroundGenerationError('paused', 'OpenAI says this API key has no credit left. Add credit in the OpenAI dashboard (Settings → Billing), then resume.');
    }
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(120_000, Math.max(5_000, seconds * 1000)) : 20_000;
    return new PlaygroundGenerationError('rate_limited', 'OpenAI is busy; this image is back in the queue.', delay);
  }
  if (status === 401) {
    return new PlaygroundGenerationError('paused', 'OpenAI rejected the API key. Check OPENAI_API_KEY, then resume.');
  }
  if (status === 403) {
    return new PlaygroundGenerationError('paused', /verif/i.test(message)
      ? 'OpenAI needs your organization verified before it allows its image models (OpenAI dashboard → Settings → Organization). Then resume.'
      : `OpenAI refused the request: ${message}`);
  }
  if (status === 404) {
    return new PlaygroundGenerationError('paused', 'This OpenAI image model is not available for the API key.');
  }
  if (status === 400 && (code === 'moderation_blocked' || /safety|moderation|content policy/i.test(message))) {
    return new PlaygroundGenerationError('blocked', "OpenAI's safety system blocked this prompt or a reference. Try rewording it.");
  }
  if (status === 400) return new PlaygroundGenerationError('failed', `OpenAI rejected the request: ${message}`);
  return new PlaygroundGenerationError('failed', `OpenAI error (${status}): ${message}`);
}

function readImage(data: OpenAiImageResponse): GeneratedImage {
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new PlaygroundGenerationError('no_image', 'OpenAI returned no image. Try again.');
  const usage = data.usage ?? {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const imageTokens = Number(usage.input_tokens_details?.image_tokens) || 0;
  const textTokens = Number(usage.input_tokens_details?.text_tokens) || Math.max(0, inputTokens - imageTokens);
  const costUsd = (textTokens * USD_PER_MILLION.text + imageTokens * USD_PER_MILLION.image + outputTokens * USD_PER_MILLION.output) / 1_000_000;
  return {
    bytes: Buffer.from(b64, 'base64'),
    mimeType: 'image/png',
    usage: { inputTokens, outputTokens, totalTokens: Number(usage.total_tokens) || inputTokens + outputTokens },
    costUsd: Number(costUsd.toFixed(6)),
  };
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };

/**
 * One image for one prompt, with the project's brief and references. Transient server errors
 * are retried once while enough time is left before `deadline`; 429s are not retried here
 * (the browser re-queues the image and slows down).
 */
export async function generateOpenAiImage(options: {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  aspectRatio: string;
  quality: ImageQuality | null;
  brief: string;
  references: ReferenceSnapshot[];
  prompt: string;
  /** Epoch ms after which no new attempt may start. */
  deadline: number;
}): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new PlaygroundGenerationError('paused', "OpenAI isn't set up yet: add OPENAI_API_KEY to .env.local and restart the server.");
  }
  const size = openAiImageSize(options.size, options.aspectRatio);
  if (!size) throw new PlaygroundGenerationError('failed', `OpenAI can't make ${options.size} images at ${options.aspectRatio}.`);
  const quality = options.quality ?? DEFAULT_QUALITY;

  // The same words Gemini gets; the images are attached in the order they are numbered.
  const ordered = orderedReferences(options.references);
  const loaded = await loadReferences(ordered);
  const prompt = [
    guidelinesText(options.brief),
    loaded.length
      ? ['Reference images, attached in this order:', ...loaded.map(({ reference }, index) => referenceLabel(reference, index + 1)), roleRules(ordered)].join('\n')
      : null,
    promptText(options.prompt),
  ].filter(Boolean).join('\n\n');

  for (let attempt = 1; ; attempt++) {
    const remaining = options.deadline - Date.now() - 20_000;
    if (remaining < 30_000) {
      throw new PlaygroundGenerationError('timeout', 'OpenAI took too long on this image. Try it again.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(240_000, remaining));
    let status: number | undefined;
    try {
      let response: Response;
      if (loaded.length) {
        const form = new FormData();
        form.append('model', options.model);
        form.append('prompt', prompt);
        loaded.forEach(({ image }, index) => {
          form.append('image[]', new Blob([Buffer.from(image.data, 'base64')], { type: image.mimeType }), `reference-${index + 1}.${EXTENSIONS[image.mimeType] ?? 'png'}`);
        });
        form.append('size', size);
        form.append('quality', quality);
        form.append('input_fidelity', 'high');
        form.append('output_format', 'png');
        form.append('n', '1');
        response = await fetch(`${API_BASE}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: controller.signal,
        });
      } else {
        response = await fetch(`${API_BASE}/images/generations`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: options.model, prompt, size, quality, output_format: 'png', n: 1 }),
          signal: controller.signal,
        });
      }
      status = response.status;
      const data = (await response.json().catch(() => ({}))) as OpenAiImageResponse;
      if (!response.ok) throw classifyOpenAiError(response.status, data, response.headers.get('retry-after'));
      return readImage(data);
    } catch (error) {
      const classified = error instanceof PlaygroundGenerationError
        ? error
        : controller.signal.aborted
          ? new PlaygroundGenerationError('timeout', 'OpenAI took too long on this image. Try it again.')
          : new PlaygroundGenerationError('failed', "Couldn't reach OpenAI. Check the connection and try again.");
      const transient = classified.kind === 'failed' && (status === undefined || status >= 500);
      if (transient && attempt < 2 && options.deadline - Date.now() > 90_000) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      throw classified;
    } finally {
      clearTimeout(timer);
    }
  }
}
