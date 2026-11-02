import 'server-only';

import { classifyOpenAiError } from '@/lib/server/playground/openai';
import type { ImageQuality } from '@/lib/playground/models';

/**
 * One Chat turn on OpenAI's Responses API, the way ChatGPT makes images: a chat model answers
 * and calls the built-in `image_generation` tool when an image is wanted. `previous_response_id`
 * carries the conversation (so "make the background blue" edits the last image); the answer
 * streams, with up to two partial previews of the image as it is drawn.
 */

const API = 'https://api.openai.com/v1/responses';
/** The chat model; OPENAI_CHAT_MODEL changes it. */
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-6.1-sol';
/** USD per million tokens for the chat model's own text (gpt-6.1-sol list price). */
const CHAT_USD_PER_MILLION = { input: 2, output: 10 };

export type ChatImageModel = 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst';

export const CHAT_SYSTEM = `You are GoGrowth's image assistant inside Visicraft, used by a D2C marketing agency in India to make ad creatives. You make and edit images with the image_generation tool.

- When the user asks for an image, or a change to one, call image_generation once with a detailed prompt: subject, setting, lighting, composition, style, colours, and any text exactly as the user quoted it. Keep products, packaging, logos and printed text from attached images exactly as they are.
- A change to the last image ("make it blue", "remove the text", "add a diya") edits that image and keeps everything else the same.
- The app sets the image size. Never ask about size, resolution or quality; just make it.
- The canvas you get is the final shape. Fill it edge to edge: never add borders, frames, letterbox bands or blank space to imitate another shape. When the shape changes from the last image, recompose the image for the new canvas.
- People are real-looking Indian adults and settings are Indian unless the user asks otherwise. Never make a real or famous person's likeness.
- If the request is a little unclear, make the most sensible version instead of asking. Ask one short question only when it is impossible to guess.
- Reply in one or two short, friendly sentences (what you made, or one useful suggestion), in the user's language (English or Hinglish). No headings, no lists, no markdown images.
- If the user only asks a question, answer it briefly without making an image.`;

export class ChatTurnError extends Error {
  constructor(
    message: string,
    /** blocked: a safety refusal. paused: the key or account. previous_missing: the conversation expired at OpenAI. */
    public kind: 'blocked' | 'paused' | 'rate_limited' | 'previous_missing' | 'timeout' | 'stopped' | 'failed',
    public status = 502
  ) {
    super(message);
  }
}

export type ChatInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' };

export interface ChatTurnResult {
  responseId: string | null;
  text: string;
  image: { b64: string; revisedPrompt: string | null } | null;
  usage: { inputTokens: number; outputTokens: number };
  /** The chat model's own text, in USD (the image is priced separately). */
  textCostUsd: number;
}

export async function runChatTurn(options: {
  instructions: string;
  content: ChatInputContent[];
  previousResponseId: string | null;
  imageModel: ChatImageModel;
  /** "auto" or "WxH" (multiples of 16, see lib/chat/sizes.ts). */
  size: string;
  quality: ImageQuality;
  /** A stable, non-identifying id for OpenAI's abuse checks (never an email). */
  safetyId: string;
  signal: AbortSignal;
  onText: (delta: string) => void;
  onCreating: () => void;
  onPartial: (b64: string, index: number) => void;
}): Promise<ChatTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ChatTurnError("OpenAI isn't set up yet: add OPENAI_API_KEY to .env.local.", 'paused', 503);

  let response: Response;
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        model: CHAT_MODEL,
        instructions: options.instructions,
        input: [{ role: 'user', content: options.content }],
        ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
        tools: [{ type: 'image_generation', model: options.imageModel, size: options.size, quality: options.quality, output_format: 'png', partial_images: 2 }],
        tool_choice: 'auto',
        max_tool_calls: 1,
        store: true,
        stream: true,
        safety_identifier: options.safetyId,
      }),
    });
  } catch (error) {
    if (options.signal.aborted) throw new ChatTurnError('Stopped.', 'stopped', 499);
    throw new ChatTurnError(`Could not reach OpenAI: ${error instanceof Error ? error.message : 'network error'}`, 'failed');
  }

  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string | null; type?: string; param?: string | null } };
    const message = data.error?.message ?? '';
    if (options.previousResponseId && (data.error?.param === 'previous_response_id' || /previous[_ ]response/i.test(message))) {
      throw new ChatTurnError('The earlier conversation expired at OpenAI.', 'previous_missing', 410);
    }
    const kind = classifyOpenAiError(response.status, data, response.headers.get('retry-after'));
    throw new ChatTurnError(kind.message, kind.kind === 'no_image' || kind.kind === 'bad_reference' ? 'failed' : kind.kind, response.status === 400 && kind.kind === 'blocked' ? 422 : response.status >= 500 ? 502 : response.status);
  }

  let text = '';
  let responseId: string | null = null;
  let completed: Record<string, unknown> | null = null;
  let creating = false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case 'response.created':
        responseId = String((data.response as Record<string, unknown> | undefined)?.id ?? '') || responseId;
        break;
      case 'response.output_text.delta':
        if (typeof data.delta === 'string') {
          text += data.delta;
          options.onText(data.delta);
        }
        break;
      case 'response.image_generation_call.in_progress':
      case 'response.image_generation_call.generating':
        if (!creating) {
          creating = true;
          options.onCreating();
        }
        break;
      case 'response.image_generation_call.partial_image':
        if (typeof data.partial_image_b64 === 'string') options.onPartial(data.partial_image_b64, Number(data.partial_image_index) || 0);
        break;
      case 'response.completed':
        completed = (data.response as Record<string, unknown>) ?? null;
        break;
      case 'response.failed':
      case 'response.incomplete': {
        const failed = (data.response as Record<string, unknown> | undefined) ?? {};
        const error = (failed.error as { message?: string; code?: string } | undefined) ?? {};
        const reason = (failed.incomplete_details as { reason?: string } | undefined)?.reason;
        const message = error.message ?? (reason ? `The reply stopped early (${reason}).` : 'The reply failed.');
        throw new ChatTurnError(/safety|moderation|content policy/i.test(message) || error.code === 'moderation_blocked' ? "OpenAI's safety system blocked this. Try rewording it." : message, /safety|moderation/i.test(message) ? 'blocked' : 'failed', 502);
      }
      case 'error': {
        const message = typeof data.message === 'string' ? data.message : 'OpenAI reported an error.';
        throw new ChatTurnError(/safety|moderation|content policy/i.test(message) ? "OpenAI's safety system blocked this. Try rewording it." : message, /safety|moderation/i.test(message) ? 'blocked' : 'failed', 502);
      }
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        let event = '';
        let payload = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) payload += line.slice(5).trim();
        }
        if (!payload || payload === '[DONE]') continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        handle(event || String(data.type ?? ''), data);
      }
    }
  } catch (error) {
    if (options.signal.aborted) throw new ChatTurnError('Stopped.', 'stopped', 499);
    throw error;
  }

  const final = completed as Record<string, unknown> | null;
  if (!final) throw new ChatTurnError('The reply ended before it finished. Try again.', 'failed');
  responseId = String(final.id ?? responseId ?? '') || null;
  let image: ChatTurnResult['image'] = null;
  let finalText = '';
  for (const item of (final.output as Array<Record<string, unknown>> | undefined) ?? []) {
    if (item.type === 'image_generation_call' && typeof item.result === 'string' && item.result) {
      image = { b64: item.result, revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : null };
    }
    if (item.type === 'message') {
      for (const part of (item.content as Array<Record<string, unknown>> | undefined) ?? []) {
        if (part.type === 'output_text' && typeof part.text === 'string') finalText += part.text;
      }
    }
  }
  const usage = (final.usage as { input_tokens?: number; output_tokens?: number } | undefined) ?? {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  return {
    responseId,
    text: (finalText || text).trim(),
    image,
    usage: { inputTokens, outputTokens },
    textCostUsd: (inputTokens * CHAT_USD_PER_MILLION.input + outputTokens * CHAT_USD_PER_MILLION.output) / 1_000_000,
  };
}
