import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import sharp from 'sharp';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * Claude for Visicraft's prompt writing (the Playground's prompt writer and every video
 * prompt): the client, reference images prepared the way Claude reads them best, and one call
 * that returns JSON in a given schema. Video prompts are written by CLAUDE_VIDEO_MODEL; Gemini
 * only analyses (products, the reference videos).
 */

export const CLAUDE_VIDEO_MODEL = 'claude-opus-5-5';
export const CLAUDE_VIDEO_MODEL_NAME = 'Claude Opus 5.5';
// Claude Opus 5.5 list prices, for the usage log (fast mode is twice these).
const USD_PER_INPUT_TOKEN = 4 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 20 / 1_000_000;

export class ClaudeError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

let client: Anthropic | null = null;

/**
 * Until when fast mode is skipped. It isn't on every account (a fast-mode limit of 0) and has
 * its own rate limit, and a refused attempt costs a round trip, so it isn't retried every call.
 */
let fastModeOffUntil = 0;

export function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeError(503, 'Claude needs ANTHROPIC_API_KEY on the server.', 'setup');
  }
  client ??= new Anthropic();
  return client;
}

/** An image for Claude: at most 1568 px on the long edge (what it reads at full detail), as JPEG. */
export async function imageForClaude(url: string): Promise<string | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 20_000, maxContentLength: 25 * 1024 * 1024 });
    const bytes = await sharp(Buffer.from(response.data), { failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return bytes.toString('base64');
  } catch {
    return null;
  }
}

/** What a Claude call cost, for the usage log. */
export function claudeCostUsd(usage: ProviderUsage, options: { fast?: boolean } = {}): number {
  const rate = options.fast ? 2 : 1;
  return Number(((usage.inputTokens * USD_PER_INPUT_TOKEN + usage.outputTokens * USD_PER_OUTPUT_TOKEN) * rate).toFixed(4));
}

/** Turns an SDK error into one with a plain message. */
export function claudeFailure(error: unknown): ClaudeError {
  if (error instanceof ClaudeError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeError(503, 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY.', 'setup');
  }
  if (error instanceof Anthropic.RateLimitError) return new ClaudeError(429, 'Claude is busy right now. Try again in a minute.', 'rate_limited');
  if (error instanceof Anthropic.BadRequestError) return new ClaudeError(400, `Claude couldn't take this request: ${error.message}`, 'bad_request');
  if (error instanceof Anthropic.APIUserAbortError) return new ClaudeError(504, 'Claude took too long.', 'timeout');
  // Connection errors are APIErrors too, so they are checked first.
  if (error instanceof Anthropic.APIConnectionError) return new ClaudeError(502, "Couldn't reach Claude.", 'upstream');
  if (error instanceof Anthropic.APIError) return new ClaudeError(502, 'Claude had a problem. Try again.', 'upstream');
  return new ClaudeError(500, error instanceof Error ? error.message : 'Claude failed.', 'unknown');
}

export interface ClaudeImage {
  /** Shown to Claude right before the image, e.g. "Image 1 (product photo)". */
  label: string;
  url: string;
}

/**
 * One Claude request that must answer in `schema`. `context` blocks (guidelines)
 * come first and are cached, the images next, the request itself last. Streamed, so a long
 * answer never hits a request timeout; aborted after `timeoutMs`.
 */
export async function requestClaudeJson<T>(options: {
  system: string;
  /** Long, reusable context (guidelines), cached between the calls of one run. */
  context?: string[];
  images?: ClaudeImage[];
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  /**
   * Fast mode (research preview, Claude API only): the same model with up to 2.5x faster
   * output at twice the price. Falls back to standard speed if fast mode is refused or busy.
   */
  fast?: boolean;
  /** The answer as it is written (the raw JSON so far), for showing it live. Starts over on a retry. */
  onText?: (soFar: string) => void;
}): Promise<{ json: T; usage: ProviderUsage; imagesShown: number; fast: boolean }> {
  const claude = anthropicClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const block of options.context ?? []) {
    if (block.trim()) content.push({ type: 'text', text: block, cache_control: { type: 'ephemeral' } });
  }
  const images = await Promise.all((options.images ?? []).map(async (image) => ({ image, data: await imageForClaude(image.url) })));
  let imagesShown = 0;
  for (const { image, data } of images) {
    if (!data) continue;
    imagesShown += 1;
    content.push({ type: 'text', text: image.label }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  }
  content.push({ type: 'text', text: options.prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const send = (fast: boolean) => {
    const stream = claude.beta.messages.stream({
      model: CLAUDE_VIDEO_MODEL,
      max_tokens: options.maxTokens ?? 16_000,
      // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model.
      betas: fast ? ['server-side-fallback-2026-07-01', 'fast-mode-2026-02-01'] : ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(fast ? { speed: 'fast' as const } : {}),
      system: [{ type: 'text', text: options.system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: options.effort ?? 'medium', format: { type: 'json_schema', schema: options.schema } },
      messages: [{ role: 'user', content }],
    }, { signal: controller.signal });
    const { onText } = options;
    if (onText) stream.on('text', (_delta, soFar) => onText(soFar));
    return stream.finalMessage();
  };
  let message: Anthropic.Beta.BetaMessage;
  let fast = Boolean(options.fast) && Date.now() >= fastModeOffUntil;
  try {
    try {
      message = await send(fast);
    } catch (error) {
      // Fast mode has its own rate limit and isn't on every account: retry once at standard speed.
      if (!fast || !(error instanceof Anthropic.RateLimitError || error instanceof Anthropic.BadRequestError)) throw error;
      // Not on this account: skip it for a few hours. Only busy: for a minute.
      const notOnAccount = error instanceof Anthropic.BadRequestError || /limit of 0 fast/i.test(error.message);
      fastModeOffUntil = Date.now() + (notOnAccount ? 6 * 3_600_000 : 60_000);
      console.warn(`Claude fast mode ${notOnAccount ? 'is not on this account' : 'is busy'}, using standard speed:`, error.message);
      fast = false;
      message = await send(false);
    }
  } catch (error) {
    throw claudeFailure(error);
  } finally {
    clearTimeout(timer);
  }

  if (message.stop_reason === 'refusal') throw new ClaudeError(422, 'Claude declined to write this one.', 'refusal');
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new ClaudeError(502, message.stop_reason === 'max_tokens' ? 'Claude ran out of room before finishing.' : "Claude's answer wasn't valid JSON.", 'bad_output');
  }
  const usage = message.usage;
  const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const outputTokens = usage.output_tokens ?? 0;
  return { json, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, providerModel: message.model }, imagesShown, fast: fast && message.usage.speed === 'fast' };
}

/**
 * The string fields of a JSON object that is still being written, each as far as it has come,
 * e.g. `{"prompt": "15-second ver` gives `{ prompt: '15-second ver' }`. For showing a
 * structured answer live; the finished answer is read with JSON.parse.
 */
export function partialJsonStrings(raw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = raw.indexOf('{') + 1;
  if (i === 0) return fields;
  const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
  // Reads the string starting at raw[i] (a quote); `done` is false if it isn't closed yet.
  const readString = (): { value: string; done: boolean } => {
    let value = '';
    i += 1;
    while (i < raw.length) {
      const char = raw[i];
      if (char === '"') {
        i += 1;
        return { value, done: true };
      }
      if (char !== '\\') {
        value += char;
        i += 1;
        continue;
      }
      const next = raw[i + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        value += String.fromCharCode(parseInt(hex, 16));
        i += 6;
      } else {
        value += ESCAPES[next] ?? next;
        i += 2;
      }
    }
    return { value, done: false };
  };
  let key: string | null = null;
  while (i < raw.length) {
    if (raw[i] !== '"') {
      i += 1;
      continue;
    }
    const { value, done } = readString();
    if (key === null) {
      if (!done) break;
      key = value;
    } else {
      fields[key] = value;
      key = null;
      if (!done) break;
    }
  }
  return fields;
}

/** JSON-schema helpers: every object closed and every field required, as structured outputs want. */
export const jsonSchema = {
  str: { type: 'string' } as const,
  int: { type: 'integer' } as const,
  num: { type: 'number' } as const,
  strList: { type: 'array', items: { type: 'string' } } as const,
  obj(properties: Record<string, unknown>): Record<string, unknown> {
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
  },
  list(items: Record<string, unknown>): Record<string, unknown> {
    return { type: 'array', items };
  },
  oneOf(values: string[]): Record<string, unknown> {
    return { type: 'string', enum: values };
  },
};
