import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { anthropicClient, imageForClaude } from '@/lib/server/claude';
import { playgroundModel, ROLE_LABELS } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

/**
 * Claude writes the Playground's prompts: it looks at the project's reference images, reads
 * the brief and what the user wants, and returns that many image prompts for the review list.
 */

export const PROMPT_WRITER_MODEL = 'claude-opus-5-5';
// Claude Opus 5.5 list prices, for the usage log.
const USD_PER_INPUT_TOKEN = 4 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 20 / 1_000_000;

export class PromptWriterError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new PromptWriterError(503, 'The Claude prompt writer needs ANTHROPIC_API_KEY on the server.', 'setup');
  }
  return anthropicClient();
}

const SYSTEM = `You write image-generation prompts for a brand's product campaign in Visicraft's Playground.

The brand has uploaded reference images and may have written guidelines: a Markdown document about the brand, the product's facts, the look, and what to always or never show. You write the number of prompts the user asks for. Each prompt is sent on its own to a Google Gemini image model, together with the same reference images and the guidelines, and becomes one finished image. Your prompts decide what those images are, so make every one worth generating.

Follow the guidelines closely: every prompt must fit them and none may contradict them. When the guidelines and the user's request disagree, the user's request for this batch wins, but keep the guidelines' brand and product facts.

What works with these image models:
- Describe one finished photograph or ad image per prompt, in natural sentences (roughly 40 to 110 words): who or what is in it and what is happening, the setting, the composition and camera (shot size, angle, lens feel), the light, the colour and mood, and the styling or props.
- Refer to the reference images the way the image model will see them: "the product from the reference images", "the person from the person reference", "the look of the style reference". Never redescribe the product's design, colours, logo or printed text in different words, and never ask for the product to change. The image model reproduces it from the references.
- When a person suits the brief and there is no person reference, describe the person (age range, look, styling, expression) in keeping with the brief's market and audience.
- Compose for the image sizes the user picked, which are given with each request. Describe the framing; don't write the ratio. When several sizes are picked, keep the subject clear of the edges so every size works.
- Include written text (headlines, prices, offers, calls to action) only when the user asks for it. Then give the exact words in quotes and say where they go.
- Keep every prompt within mainstream advertising standards: adults only; tasteful, editorial styling for lingerie and swimwear; no nudity, violence or real public figures; no logos or brands other than the ones in the references.
- Make the set varied, like a real campaign shoot list: different settings, angles, moods, times of day, props and, where relevant, people, all serving what the user asked for. No two prompts describe the same scene.
- Each prompt stands alone: no numbering, no markdown, no mention of other prompts, and no need to repeat the guidelines, which are sent with every image.

Return exactly the number of prompts requested.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    prompts: { type: 'array', items: { type: 'string' } },
  },
  required: ['prompts'],
  additionalProperties: false,
} as const;

const Output = z.object({ prompts: z.array(z.string()) });

function describeSizes(ratios: string[]): string {
  const shape = (ratio: string) => {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) return ratio;
    return w === h ? `${ratio} (square)` : w < h ? `${ratio} (portrait)` : `${ratio} (landscape)`;
  };
  return ratios.map(shape).join(', ');
}

export interface WrittenPrompts {
  prompts: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export async function writePlaygroundPrompts(options: {
  goal: string;
  count: number;
  brief: string;
  references: ReferenceSnapshot[];
  imageModel: string;
  ratios: string[];
  /** Prompts already in the list, when adding more: the new ones shouldn't repeat them. */
  existing: string[];
}): Promise<WrittenPrompts> {
  const claude = anthropic();
  const images = await Promise.all(options.references.map((reference) => imageForClaude(reference.url)));

  // Guidelines first, then the references: the parts that stay the same across requests for a
  // project, cached so asking again costs less. The request itself comes last.
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const guidelines = options.brief.trim();
  if (guidelines) {
    content.push({ type: 'text', text: `Project guidelines (Markdown):\n\n${guidelines}`, cache_control: { type: 'ephemeral' } });
  }
  let shown = 0;
  options.references.forEach((reference, index) => {
    const data = images[index];
    if (!data) return;
    shown += 1;
    const label = reference.label.trim();
    content.push(
      { type: 'text', text: `Image ${shown} (${ROLE_LABELS[reference.role]} reference${label ? `: ${label}` : ''})` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }
    );
  });

  const lastImage = [...content].reverse().find((block) => block.type === 'image');
  if (lastImage && lastImage.type === 'image') lastImage.cache_control = { type: 'ephemeral' };

  const model = playgroundModel(options.imageModel);
  const lines = [
    shown ? `The ${shown} image${shown === 1 ? '' : 's'} above ${shown === 1 ? 'is' : 'are'} the project's reference${shown === 1 ? '' : 's'}; every generated image receives them.` : 'This project has no reference images yet.',
    guidelines ? 'Follow the project guidelines above; they are also sent with every image.' : 'This project has no guidelines.',
    `What the user wants: ${options.goal.trim() || '(nothing extra; follow the brief and the references)'}`,
    `Image model: ${model.name}, ${model.blurb.toLowerCase()}.`,
    `Image sizes: ${describeSizes(options.ratios)}. Every prompt is rendered in each of these sizes.`,
  ];
  if (options.existing.length) {
    lines.push(`The list already has these prompts; write new ones that don't repeat them:\n${options.existing.slice(0, 40).map((prompt) => `- ${prompt.slice(0, 220)}`).join('\n')}`);
  }
  lines.push(`Write exactly ${options.count} prompt${options.count === 1 ? '' : 's'}.`);
  content.push({ type: 'text', text: lines.join('\n\n') });

  let message: Anthropic.Beta.BetaMessage;
  try {
    // Streamed so a long list (up to 100 prompts) can't hit a request timeout.
    const stream = claude.beta.messages.stream({
      model: PROMPT_WRITER_MODEL,
      max_tokens: Math.min(64_000, 12_000 + options.count * 400),
      // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new PromptWriterError(503, 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY.', 'setup');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new PromptWriterError(429, 'Claude is busy right now. Try again in a minute.', 'rate_limited');
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new PromptWriterError(400, `Claude couldn't take this request: ${error.message}`, 'bad_request');
    }
    if (error instanceof Anthropic.APIError) {
      throw new PromptWriterError(502, 'Claude had a problem writing the prompts. Try again.', 'upstream');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new PromptWriterError(502, "Couldn't reach Claude. Try again.", 'upstream');
    }
    throw error;
  }

  if (message.stop_reason === 'refusal') {
    throw new PromptWriterError(422, 'Claude declined to write prompts for this request. Try describing what you want differently.', 'refusal');
  }
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let parsed: z.infer<typeof Output> | null = null;
  try {
    const result = Output.safeParse(JSON.parse(text));
    if (result.success) parsed = result.data;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    throw new PromptWriterError(502, message.stop_reason === 'max_tokens'
      ? 'Claude ran out of room before finishing. Ask for fewer prompts at a time.'
      : 'Claude returned something that wasn\'t a list of prompts. Try again.', 'bad_output');
  }

  const seen = new Set<string>();
  const prompts = parsed.prompts
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt && !seen.has(prompt.toLowerCase()) && seen.add(prompt.toLowerCase()))
    .slice(0, options.count);
  if (!prompts.length) throw new PromptWriterError(502, 'Claude returned no prompts. Try again.', 'bad_output');

  const usage = message.usage;
  const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const outputTokens = usage.output_tokens ?? 0;
  return {
    prompts,
    model: message.model,
    inputTokens,
    outputTokens,
    usd: Number((inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN).toFixed(4)),
  };
}
