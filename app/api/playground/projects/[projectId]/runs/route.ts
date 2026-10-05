import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedProject, isMissingQualityColumn, ITEM_COLUMNS, playgroundDb, QUALITY_SETUP_MESSAGE, toItem, toRun } from '@/lib/server/playground/db';
import { DEFAULT_QUALITY, isPlaygroundModel, MAX_ENABLED_REFERENCES, modelQuality, playgroundModel, QUALITY_LABELS, runCost, sizeOption } from '@/lib/playground/models';
import { MAX_BRIEF_CHARS, MAX_IMAGES_PER_RUN, MAX_PROMPT_CHARS, MAX_PROMPTS, MAX_VARIATIONS } from '@/lib/playground/prompts';
import type { ReferenceSnapshot } from '@/lib/playground/types';

type Context = { params: Promise<{ projectId: string }> };

const RunRequest = z.object({
  clientKey: z.uuid(),
  prompts: z.array(z.string().trim().min(1).max(MAX_PROMPT_CHARS)).min(1).max(MAX_PROMPTS),
  model: z.string(),
  size: z.string(),
  aspectRatios: z.array(z.string()).min(1).max(14),
  variations: z.number().int().min(1).max(MAX_VARIATIONS),
  thinking: z.enum(['minimal', 'high']).optional(),
  /** OpenAI models' quality level. */
  quality: z.enum(['high', 'xhigh', 'max']).optional(),
  brief: z.string().max(MAX_BRIEF_CHARS),
  referenceIds: z.array(z.uuid()).max(MAX_ENABLED_REFERENCES),
});

async function existingRun(db: ReturnType<typeof playgroundDb>, userId: string, clientKey: string) {
  const { data, error } = await db
    .from('playground_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('client_key', clientKey)
    .maybeSingle();
  assertDb(error, 'check the run');
  if (!data) return null;
  const items = await db.from('playground_items').select(ITEM_COLUMNS).eq('run_id', data.id).order('position');
  assertDb(items.error, 'load the run');
  return { run: toRun(data), items: ((items.data ?? []) as unknown as Array<Record<string, unknown>>).map(toItem) };
}

/**
 * Creates a run: one queued image per prompt × size × variation, in order, with the brief
 * and references exactly as the user saw them. Nothing is charged until each image starts.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const parsed = RunRequest.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid run.', 'bad_request');
    }
    const body = parsed.data;
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const repeat = await existingRun(db, user.id, body.clientKey);
    if (repeat) return NextResponse.json(repeat);

    if (!isPlaygroundModel(body.model)) throw new ApiError(400, 'Unknown model.', 'bad_request');
    const model = playgroundModel(body.model);
    const turnedOff = model.sizes.find((option) => option.id === body.size)?.disabled;
    if (turnedOff) throw new ApiError(400, `${turnedOff}.`, 'bad_request');
    const size = sizeOption(model, body.size);
    if (!size) throw new ApiError(400, `${model.name} can't make ${body.size} images.`, 'bad_request');
    if (body.quality && !model.qualities.includes(body.quality)) {
      throw new ApiError(400, `${model.name} has no ${QUALITY_LABELS[body.quality]} quality.`, 'bad_request');
    }
    // Null for models without quality levels (Gemini).
    const quality = modelQuality(model, body.quality ?? DEFAULT_QUALITY);
    const ratios = [...new Set(body.aspectRatios)];
    const unsupported = ratios.find((ratio) => !model.ratios.includes(ratio));
    if (unsupported) throw new ApiError(400, `${model.name} can't make ${unsupported} images.`, 'bad_request');

    const cost = runCost({
      model: model.id,
      size: size.id,
      promptCount: body.prompts.length,
      ratioCount: ratios.length,
      variations: body.variations,
      referenceCount: body.referenceIds.length,
      quality,
    });
    if (cost.images > MAX_IMAGES_PER_RUN) {
      throw new ApiError(400, `A run can make up to ${MAX_IMAGES_PER_RUN} images; this one would make ${cost.images}.`, 'too_many');
    }

    let snapshot: ReferenceSnapshot[] = [];
    if (body.referenceIds.length) {
      const { data, error } = await db
        .from('playground_references')
        .select('id, url, role, label')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .in('id', body.referenceIds);
      assertDb(error, 'load the references');
      const byId = new Map(((data ?? []) as ReferenceSnapshot[]).map((row) => [row.id, row]));
      snapshot = body.referenceIds.map((id) => byId.get(id)).filter((row): row is ReferenceSnapshot => Boolean(row));
      if (snapshot.length !== body.referenceIds.length) {
        throw new ApiError(409, 'A reference was removed meanwhile. Reload the project and try again.', 'stale');
      }
    }

    const balance = await db.from('user_credits').select('credits').eq('user_id', user.id).maybeSingle();
    assertDb(balance.error, 'check your credits');
    const credits = Number(balance.data?.credits ?? 0);
    if (credits < cost.credits) {
      throw new ApiError(402, `This run needs ${cost.credits.toLocaleString('en-IN')} credits and you have ${credits.toLocaleString('en-IN')}.`, 'insufficient_credits', {
        needed: cost.credits,
        balance: credits,
      });
    }

    const thinking = model.thinking ? body.thinking ?? 'minimal' : null;
    const inserted = await db
      .from('playground_runs')
      .insert({
        project_id: projectId,
        user_id: user.id,
        client_key: body.clientKey,
        model: model.id,
        image_size: size.id,
        aspect_ratios: ratios,
        variations: body.variations,
        thinking,
        brief: body.brief,
        reference_snapshot: snapshot,
        prompts: body.prompts,
        image_count: cost.images,
        // Includes the quality level and, for OpenAI, the reference images.
        credits_per_image: cost.creditsPerImage,
        usd_per_image: cost.images ? Number((cost.usd / cost.images).toFixed(4)) : size.usd,
        // Sent only for OpenAI models, so Gemini runs work before the quality migration.
        ...(quality ? { quality } : {}),
      })
      .select('*')
      .single();
    if (inserted.error?.code === '23505') {
      const again = await existingRun(db, user.id, body.clientKey);
      if (again) return NextResponse.json(again);
    }
    if (isMissingQualityColumn(inserted.error)) throw new ApiError(503, QUALITY_SETUP_MESSAGE, 'setup');
    assertDb(inserted.error, 'create the run');
    const run = inserted.data as Record<string, unknown>;

    const rows: Array<Record<string, unknown>> = [];
    body.prompts.forEach((_, promptIndex) => {
      ratios.forEach((ratio) => {
        for (let variation = 1; variation <= body.variations; variation++) {
          rows.push({
            project_id: projectId,
            run_id: run.id,
            user_id: user.id,
            position: rows.length,
            prompt_index: promptIndex,
            aspect_ratio: ratio,
            variation,
          });
        }
      });
    });
    const items = await db.from('playground_items').insert(rows).select(ITEM_COLUMNS).order('position');
    if (items.error) {
      await db.from('playground_runs').delete().eq('id', run.id as string);
      assertDb(items.error, 'queue the images');
    }

    await db
      .from('playground_projects')
      .update({
        brief: body.brief,
        settings: { model: model.id, size: size.id, ratios, variations: body.variations, thinking: thinking ?? 'minimal', quality: quality ?? body.quality ?? DEFAULT_QUALITY },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      run: toRun(run),
      items: ((items.data ?? []) as unknown as Array<Record<string, unknown>>).map(toItem),
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not start the run');
  }
}
