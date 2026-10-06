import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { claudeCostUsd, ClaudeError, CLAUDE_VIDEO_MODEL } from '@/lib/server/claude';
import { loadVideoProject } from '@/lib/server/playground/db';
import { rewriteVideoPrompt } from '@/lib/server/videoPromptEdit';
import { deductCreditsForUser, logUsage, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { PROMPT_REWRITE_CREDITS } from '@/lib/video/shared';
import { videoModelOptions } from '@/lib/videoModels';

export const maxDuration = 90;

/**
 * Rewrites a video prompt from a short instruction ("she dances Bharatanatyam"), for the
 * approval and new-draft screens. Nothing renders; the user still reviews the new prompt.
 * Charged a few credits, refunded if the rewrite fails.
 *
 * It knows the video's length (the card's, which the change may set to another one the engine
 * renders) and follows the project's guidelines like the writer that planned the video.
 *
 * Answers as a stream of JSON lines so the new prompt shows while it is written:
 * `{ t }` (more text), `{ reset: true, t }` (it started over), then `{ done: true, prompt,
 * summary, seconds, credits }` or `{ error, status }`. Errors before the charge are plain JSON.
 */
export async function POST(request: NextRequest) {
  let user: User;
  let prompt: string;
  let instruction: string;
  let images: number;
  let seconds: number;
  let allowedSeconds: number[];
  let guidelines: string | undefined;
  try {
    user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { prompt?: unknown; instruction?: unknown; images?: unknown; seconds?: unknown; model?: unknown; projectId?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!prompt || !instruction) return NextResponse.json({ error: 'Write what you want to change.' }, { status: 400 });
    if (prompt.length > 6000) return NextResponse.json({ error: 'The prompt is too long to rewrite.' }, { status: 400 });
    images = Math.max(0, Math.min(9, Math.round(Number(body.images) || 0)));
    allowedSeconds = typeof body.model === 'string' && body.model ? videoModelOptions(body.model).durations : [];
    const asked = Math.round(Number(body.seconds) || 0);
    seconds = asked > 0 ? asked : allowedSeconds[0] ?? 8;
    guidelines = (await loadVideoProject(user.id, body.projectId))?.guidelines || undefined;
    if (!(await deductCreditsForUser(user.id, PROMPT_REWRITE_CREDITS))) {
      return NextResponse.json({ error: `A rewrite needs ${PROMPT_REWRITE_CREDITS} credits.` }, { status: 402 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The prompt could not be rewritten';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The page was closed; the rewrite still finishes and is logged.
        }
      };
      let shown = '';
      const started = Date.now();
      try {
        const result = await rewriteVideoPrompt({
          prompt,
          instruction,
          images,
          seconds,
          allowedSeconds,
          guidelines,
          onPrompt: (soFar) => {
            if (soFar.startsWith(shown)) {
              if (soFar.length > shown.length) send({ t: soFar.slice(shown.length) });
            } else {
              send({ reset: true, t: soFar });
            }
            shown = soFar;
          },
        });
        send({ done: true, prompt: result.prompt, summary: result.summary, seconds: result.seconds, credits: PROMPT_REWRITE_CREDITS });
        await logUsage({
          user,
          provider: 'anthropic',
          model: result.usage.providerModel || CLAUDE_VIDEO_MODEL,
          feature: 'video_generation',
          ...result.usage,
          imageCount: 0,
          estimatedCostUsd: claudeCostUsd(result.usage, { fast: result.fast }),
          creditCost: PROMPT_REWRITE_CREDITS,
          metadata: { mode: 'video_prompt_rewrite', fast: result.fast, ms: Date.now() - started, instruction: instruction.slice(0, 300), seconds: result.seconds, guidelinesChars: guidelines?.length ?? 0 },
        }).catch((error) => console.error('Prompt rewrite usage logging failed:', error));
      } catch (error) {
        await refundCreditsForUser(user.id, PROMPT_REWRITE_CREDITS).catch(() => undefined);
        console.error('Prompt rewrite failed:', error);
        send({
          error: error instanceof Error ? error.message : 'The prompt could not be rewritten',
          status: error instanceof ClaudeError ? error.status : 500,
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the page.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
