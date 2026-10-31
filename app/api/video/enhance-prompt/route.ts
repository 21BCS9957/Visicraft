import { NextRequest, NextResponse } from 'next/server';
import { claudeCostUsd, ClaudeError, CLAUDE_VIDEO_MODEL } from '@/lib/server/claude';
import { isOwnStorageUrl } from '@/lib/server/playground/db';
import { enhanceVideoPrompt } from '@/lib/server/videoPromptEdit';
import { deductCreditsForUser, logUsage, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { PROMPT_ENHANCE_CREDITS } from '@/lib/video/shared';
import { snapVideoDuration, videoAspectInfo, videoEngineOf } from '@/lib/videoModels';

export const maxDuration = 90;

/**
 * "Improve prompt" in the Create tab: Claude turns a short idea (and the video's images) into a
 * shot-by-shot prompt for the engine, length and shape picked. Nothing renders: the prompt goes
 * back into the box. Charged a few credits, refunded if it fails.
 */
export async function POST(request: NextRequest) {
  let charged: string | null = null;
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as { idea?: unknown; model?: unknown; imageUrls?: unknown; imageRole?: unknown; seconds?: unknown; aspectRatio?: unknown; motion?: unknown };
    const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
    if (idea.length < 3) return NextResponse.json({ error: 'Write your idea in a few words first.' }, { status: 400 });
    const model = typeof body.model === 'string' ? body.model : '';
    const engine = videoEngineOf(model) === 'veo' ? 'veo' : 'seedance';
    const images = (Array.isArray(body.imageUrls) ? body.imageUrls : [])
      .filter((url): url is string => typeof url === 'string' && isOwnStorageUrl(url))
      .slice(0, 9)
      .map((url) => ({ url }));
    const role = !images.length ? 'none' : engine === 'veo' || (images.length === 1 && body.imageRole !== 'reference') ? 'first_frame' : 'reference';
    const seconds = snapVideoDuration(model || 'dreamina-seedance-2-5-260628', Number(body.seconds));
    const orientation = videoAspectInfo(typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined).orientation;
    const motion = typeof body.motion === 'string' ? body.motion.trim().slice(0, 400) : undefined;

    if (!(await deductCreditsForUser(user.id, PROMPT_ENHANCE_CREDITS))) {
      return NextResponse.json({ error: `Improving a prompt needs ${PROMPT_ENHANCE_CREDITS} credits.` }, { status: 402 });
    }
    charged = user.id;
    const started = Date.now();
    const result = await enhanceVideoPrompt({ idea, engine, role, images: role === 'first_frame' ? images.slice(0, 1) : images, seconds, orientation, motion });
    charged = null;
    await logUsage({
      user,
      provider: 'anthropic',
      model: result.usage.providerModel || CLAUDE_VIDEO_MODEL,
      feature: 'video_generation',
      ...result.usage,
      imageCount: 0,
      estimatedCostUsd: claudeCostUsd(result.usage, { fast: result.fast }),
      creditCost: PROMPT_ENHANCE_CREDITS,
      metadata: { mode: 'video_prompt_enhance', surface: 'create', fast: result.fast, ms: Date.now() - started, idea: idea.slice(0, 300), engine, seconds, images: images.length },
    }).catch((error) => console.error('Prompt improve usage logging failed:', error));
    return NextResponse.json({ prompt: result.prompt, summary: result.summary, credits: PROMPT_ENHANCE_CREDITS });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged, PROMPT_ENHANCE_CREDITS).catch(() => undefined);
    console.error('Prompt improve failed:', error);
    const message = error instanceof Error ? error.message : 'The prompt could not be improved';
    const status = error instanceof ClaudeError ? error.status : message.includes('Authentication required') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
