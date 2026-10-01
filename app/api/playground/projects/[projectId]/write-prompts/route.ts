import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedProject, playgroundDb } from '@/lib/server/playground/db';
import { PROMPT_WRITER_MODEL, PromptWriterError, writePlaygroundPrompts } from '@/lib/server/playground/promptWriter';
import { deductCreditsForUser, logUsage, refundCreditsForUser } from '@/lib/server/usage';
import { MAX_ENABLED_REFERENCES, MAX_WRITTEN_PROMPTS, promptWriterCredits } from '@/lib/playground/models';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import type { ReferenceSnapshot } from '@/lib/playground/types';

export const maxDuration = 300;

type Context = { params: Promise<{ projectId: string }> };

const WriteRequest = z.object({
  goal: z.string().max(2000),
  count: z.number().int().min(1).max(MAX_WRITTEN_PROMPTS),
  brief: z.string().max(MAX_BRIEF_CHARS),
  referenceIds: z.array(z.uuid()).max(MAX_ENABLED_REFERENCES),
  model: z.string(),
  ratios: z.array(z.string()).min(1).max(14),
  existing: z.array(z.string().max(4000)).max(100).optional(),
});

/**
 * Claude writes `count` prompts from the project's references, brief and what the user
 * wants. Charged up front; refunded if Claude can't deliver.
 */
export async function POST(request: NextRequest, { params }: Context) {
  let charged: { userId: string; credits: number } | null = null;
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const parsed = WriteRequest.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid request.', 'bad_request');
    const body = parsed.data;
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    let references: ReferenceSnapshot[] = [];
    if (body.referenceIds.length) {
      const { data, error } = await db
        .from('playground_references')
        .select('id, url, role, label')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .in('id', body.referenceIds);
      assertDb(error, 'load the references');
      const byId = new Map(((data ?? []) as ReferenceSnapshot[]).map((row) => [row.id, row]));
      references = body.referenceIds.map((id) => byId.get(id)).filter((row): row is ReferenceSnapshot => Boolean(row));
    }

    const credits = promptWriterCredits(body.count);
    if (!(await deductCreditsForUser(user.id, credits))) {
      throw new ApiError(402, `Writing ${body.count} prompts needs ${credits} credits.`, 'insufficient_credits', { needed: credits });
    }
    charged = { userId: user.id, credits };

    const written = await writePlaygroundPrompts({
      goal: body.goal,
      count: body.count,
      brief: body.brief,
      references,
      imageModel: body.model,
      ratios: body.ratios,
      existing: body.existing ?? [],
    });
    charged = null;

    await logUsage({
      user,
      provider: 'anthropic',
      model: written.model || PROMPT_WRITER_MODEL,
      feature: 'image_generation',
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
      totalTokens: written.inputTokens + written.outputTokens,
      estimatedCostUsd: written.usd,
      creditCost: credits,
      metadata: { mode: 'playground_prompts', projectId, requested: body.count, returned: written.prompts.length, referenceCount: references.length },
    });
    return NextResponse.json({ prompts: written.prompts, credits });
  } catch (error) {
    if (charged) await refundCreditsForUser(charged.userId, charged.credits);
    if (error instanceof PromptWriterError) {
      return NextResponse.json({ error: error.message, code: error.code, refunded: Boolean(charged) }, { status: error.status });
    }
    return apiErrorResponse(error, 'Could not write the prompts');
  }
}
