import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import {
  getOwnedProject,
  isMissingQualityColumn,
  isMissingResizeColumn,
  ITEM_COLUMNS,
  playgroundDb,
  QUALITY_SETUP_MESSAGE,
  RESIZE_SETUP_MESSAGE,
  toItem,
  toRun,
} from '@/lib/server/playground/db';
import { isPlaygroundModel, MAX_ENABLED_REFERENCES, modelQuality, playgroundModel, type ImageQuality, type PlaygroundSize, type ThinkingLevel } from '@/lib/playground/models';
import { MAX_IMAGES_PER_RUN } from '@/lib/playground/prompts';
import { OPENAI_PROMPT_LIMIT, openAiPrompt, openAiPromptLength, openAiTooLongMessage, orderedReferences } from '@/lib/playground/promptText';
import {
  copyKey,
  copySize,
  DEFAULT_EXTEND_MODEL,
  EXTEND_MODELS,
  isFitBackground,
  remakeInstruction,
  remakeSize,
  RESIZE_METHODS,
  RESIZE_RATIOS,
  resizePrice,
  safeApplies,
  type RunResize,
} from '@/lib/playground/resize';
import type { PlaygroundRun, ReferenceSnapshot } from '@/lib/playground/types';

type Context = { params: Promise<{ projectId: string }> };
type Row = Record<string, unknown>;
type Db = ReturnType<typeof playgroundDb>;

const ResizeRequest = z.object({
  clientKey: z.uuid(),
  itemIds: z.array(z.uuid()).min(1).max(MAX_IMAGES_PER_RUN),
  ratio: z.string(),
  method: z.enum(['extend', 'remake', 'fit']),
  /** Extend: Nano Banana Pro (default) or Nano Banana 2. */
  model: z.string().optional(),
  /** Fit: 'blur' or a colour as '#rrggbb'. */
  background: z.string().optional(),
  /** Extend and Fit at 9:16: shrink the original into the part Reels leaves visible. */
  safe: z.boolean().optional(),
  /** A new take of one copy: make it even though its original already has a copy like it. */
  again: z.boolean().optional(),
  /** The total the page showed; a higher one here is refused rather than charged. */
  expectedCredits: z.number().int().min(0).optional(),
});

const ORIGINAL_COLUMNS = 'id, run_id, kind, parent_item_id, position, prompt_index, aspect_ratio, variation, status, image_url, width, height';

async function existingRun(db: Db, userId: string, clientKey: string) {
  const { data, error } = await db.from('playground_runs').select('*').eq('user_id', userId).eq('client_key', clientKey).maybeSingle();
  assertDb(error, 'check the run');
  if (!data) return null;
  const items = await db.from('playground_items').select(ITEM_COLUMNS).eq('run_id', data.id).order('position');
  assertDb(items.error, 'load the run');
  return { run: toRun(data), items: ((items.data ?? []) as unknown as Row[]).map(toItem) };
}

async function loadItems(db: Db, userId: string, projectId: string, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from('playground_items').select(ORIGINAL_COLUMNS).in('id', ids).eq('user_id', userId).eq('project_id', projectId);
  assertDb(error, 'load the images');
  return (data ?? []) as unknown as Row[];
}

async function loadRuns(db: Db, userId: string, ids: string[]): Promise<Map<string, PlaygroundRun>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await db.from('playground_runs').select('*').in('id', unique).eq('user_id', userId);
  assertDb(error, 'load the runs');
  return new Map(((data ?? []) as Row[]).map((row) => [String(row.id), toRun(row)]));
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/**
 * "Another size": one new run that turns finished images into another shape, each new image
 * linked to its original. A copy picked here stands for its original, so every size is made
 * from the real image. Originals that already have this copy (same shape, method and model or
 * background) are skipped unless `again`. Each image is charged when it starts, like any run.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const parsed = ResizeRequest.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid request.', 'bad_request');
    const body = parsed.data;
    if (!RESIZE_RATIOS.includes(body.ratio)) throw new ApiError(400, `Pick one of these shapes: ${RESIZE_RATIOS.join(', ')}.`, 'bad_request');
    if (body.method === 'fit' && body.background !== undefined && !isFitBackground(body.background)) {
      throw new ApiError(400, 'Pick a blurred background or a colour like #1a2b3c.', 'bad_request');
    }
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const repeat = await existingRun(db, user.id, body.clientKey);
    if (repeat) return NextResponse.json(repeat);

    // Copies stand for their originals.
    const picked = await loadItems(db, user.id, projectId, body.itemIds);
    const pickedRuns = await loadRuns(db, user.id, picked.map((row) => row.run_id).filter((id): id is string => typeof id === 'string'));
    const isCopy = (row: Row) => typeof row.run_id === 'string' && Boolean(pickedRuns.get(row.run_id)?.resize);
    const parents = await loadItems(db, user.id, projectId, picked.filter(isCopy).map((row) => row.parent_item_id).filter((id): id is string => typeof id === 'string'));
    const byId = new Map<string, Row>();
    [...picked.filter((row) => !isCopy(row)), ...parents].forEach((row) => byId.set(String(row.id), row));
    const roots = [...byId.values()].sort((a, b) => Number(a.position) - Number(b.position));
    const ready = roots.filter((row) => row.status === 'done' && typeof row.image_url === 'string');
    const unfinished = roots.length - ready.length;
    if (!ready.length) throw new ApiError(400, 'Only finished images can be made in another size.', 'bad_request');
    const sourceRunIds = new Set(ready.map((row) => (typeof row.run_id === 'string' ? row.run_id : null)));
    if (sourceRunIds.size > 1) throw new ApiError(400, 'Pick images from one run at a time.', 'bad_request');
    const sourceRunId = [...sourceRunIds][0] ?? null;
    const runs = sourceRunId && !pickedRuns.has(sourceRunId) ? new Map([...pickedRuns, ...(await loadRuns(db, user.id, [sourceRunId]))]) : pickedRuns;
    const sourceRun = sourceRunId ? runs.get(sourceRunId) ?? null : null;

    let originals = ready.filter((row) => row.aspect_ratio !== body.ratio);
    const sameShape = ready.length - originals.length;
    if (!originals.length) throw new ApiError(400, `${sameShape === 1 ? 'This image is' : 'These images are'} already ${body.ratio}.`, 'bad_request');

    // What the copies are made with.
    const widest = Math.max(...originals.map((row) => Number(row.width) || 0));
    const tallest = Math.max(...originals.map((row) => Number(row.height) || 0));
    let model = playgroundModel(sourceRun?.model ?? DEFAULT_EXTEND_MODEL);
    let size: PlaygroundSize = copySize(widest, tallest, sourceRun?.size);
    let quality: ImageQuality | null = null;
    let thinking: ThinkingLevel | null = null;
    let brief = '';
    let references: ReferenceSnapshot[] = [];
    if (body.method === 'extend') {
      const id = body.model ?? DEFAULT_EXTEND_MODEL;
      if (!isPlaygroundModel(id) || !EXTEND_MODELS.includes(id)) throw new ApiError(400, 'Extend works with Nano Banana Pro or Nano Banana 2.', 'bad_request');
      model = playgroundModel(id);
    } else if (body.method === 'remake') {
      if (!sourceRun) throw new ApiError(400, 'Remake needs the prompt the image was made with. For an image edited in Canvas, use Extend or Fit.', 'bad_request');
      if (!model.ratios.includes(body.ratio)) throw new ApiError(400, `${model.name} can't make ${body.ratio} images.`, 'bad_request');
      if (sourceRun.references.length + 1 > MAX_ENABLED_REFERENCES) {
        throw new ApiError(400, `This run already sends ${sourceRun.references.length} references and Remake adds the original as one more (${MAX_ENABLED_REFERENCES} at most). Use Extend or Fit.`, 'bad_request');
      }
      // Nano Banana Pro costs the same at 1K and 2K: the remake is made at 2K.
      size = remakeSize(model.id, sourceRun.size);
      quality = modelQuality(model, sourceRun.quality);
      thinking = model.thinking ? sourceRun.thinking ?? 'minimal' : null;
      brief = sourceRun.brief;
      references = sourceRun.references;
    }
    const resize: RunResize = {
      method: body.method,
      fromRunId: sourceRunId,
      ...(body.method === 'fit' ? { background: (body.background ?? 'blur').toLowerCase() } : {}),
      ...(body.safe && safeApplies(body.method, body.ratio) ? { safe: true } : {}),
    };

    // Originals that already have this copy are left out (a new take of one copy passes `again`).
    let existing = 0;
    if (!body.again) {
      const copies = await db
        .from('playground_items')
        .select('parent_item_id, run_id')
        .in('parent_item_id', originals.map((row) => String(row.id)))
        .eq('user_id', user.id)
        .eq('aspect_ratio', body.ratio)
        // A failed or cancelled copy doesn't count: the original can be made again.
        .in('status', ['queued', 'generating', 'done']);
      assertDb(copies.error, 'check the other sizes');
      const copyRows = (copies.data ?? []) as Array<{ parent_item_id: string; run_id: string | null }>;
      const copyRuns = await loadRuns(db, user.id, copyRows.map((row) => row.run_id).filter((id): id is string => Boolean(id)));
      const key = copyKey(body.ratio, { model: model.id, resize });
      const taken = new Set(copyRows.filter((row) => row.run_id && copyKey(body.ratio, copyRuns.get(row.run_id) ?? { model: '' }) === key).map((row) => row.parent_item_id));
      existing = originals.filter((row) => taken.has(String(row.id))).length;
      originals = originals.filter((row) => !taken.has(String(row.id)));
      if (!originals.length) {
        throw new ApiError(400, `${existing === 1 ? 'This image already has' : `All ${existing} already have`} a ${body.ratio} ${RESIZE_METHODS[body.method].label} version.`, 'exists');
      }
    }

    // Prompts: each original's, once (Canvas edits are labelled like in the gallery).
    const promptOf = (row: Row) => {
      const run = typeof row.run_id === 'string' ? runs.get(row.run_id) : undefined;
      return (run?.prompts[Number(row.prompt_index)] ?? '').trim() || 'Edited in Canvas';
    };
    const prompts: string[] = [];
    const promptIndex = new Map<string, number>();
    originals.forEach((row) => {
      const text = promptOf(row);
      if (!promptIndex.has(text)) {
        promptIndex.set(text, prompts.length);
        prompts.push(text);
      }
    });

    // GPT Image reads at most 32,000 characters, Remake's instruction included (sent with images).
    if (body.method === 'remake' && model.provider === 'openai') {
      const ordered = orderedReferences(references);
      const longest = originals.reduce((most, row) => {
        const instruction = remakeInstruction({ imageNumber: references.length + 1, fromRatio: String(row.aspect_ratio), toRatio: body.ratio });
        return Math.max(most, openAiPromptLength(openAiPrompt(brief, ordered, `${promptOf(row)}\n\n${instruction}`), true));
      }, 0);
      if (longest > OPENAI_PROMPT_LIMIT) throw new ApiError(400, openAiTooLongMessage(brief, longest), 'too_long');
    }

    const price = resizePrice({ method: body.method, model: model.id, size, quality, referenceCount: references.length });
    const total = price.credits * originals.length;
    if (body.expectedCredits !== undefined && total > body.expectedCredits) {
      throw new ApiError(409, `This now costs ${total.toLocaleString('en-IN')} credits, not the ${body.expectedCredits.toLocaleString('en-IN')} shown. Check and try again.`, 'price_changed', { needed: total });
    }
    if (total > 0) {
      const balance = await db.from('user_credits').select('credits').eq('user_id', user.id).maybeSingle();
      assertDb(balance.error, 'check your credits');
      const credits = Number(balance.data?.credits ?? 0);
      if (credits < total) {
        throw new ApiError(402, `This needs ${total.toLocaleString('en-IN')} credits and you have ${credits.toLocaleString('en-IN')}.`, 'insufficient_credits', { needed: total, balance: credits });
      }
    }

    const inserted = await db
      .from('playground_runs')
      .insert({
        project_id: projectId,
        user_id: user.id,
        client_key: body.clientKey,
        model: model.id,
        image_size: size,
        aspect_ratios: [body.ratio],
        variations: 1,
        thinking,
        brief,
        reference_snapshot: references,
        prompts,
        image_count: originals.length,
        credits_per_image: price.credits,
        usd_per_image: price.usd,
        ...(quality ? { quality } : {}),
        resize,
      })
      .select('*')
      .single();
    if (inserted.error?.code === '23505') {
      const again = await existingRun(db, user.id, body.clientKey);
      if (again) return NextResponse.json(again);
    }
    if (isMissingResizeColumn(inserted.error)) throw new ApiError(503, RESIZE_SETUP_MESSAGE, 'setup');
    if (isMissingQualityColumn(inserted.error)) throw new ApiError(503, QUALITY_SETUP_MESSAGE, 'setup');
    assertDb(inserted.error, 'create the run');
    const run = inserted.data as Row;

    // Each copy keeps its original's number and take, so files pair up; Canvas edits are numbered in order.
    const rows = originals.map((row, index) => ({
      project_id: projectId,
      run_id: run.id,
      user_id: user.id,
      kind: 'generated',
      parent_item_id: row.id,
      position: sourceRunId ? Number(row.position) : index,
      prompt_index: promptIndex.get(promptOf(row)) ?? 0,
      aspect_ratio: body.ratio,
      variation: Number(row.variation) || 1,
    }));
    const items = await db.from('playground_items').insert(rows).select(ITEM_COLUMNS).order('position');
    if (items.error) {
      await db.from('playground_runs').delete().eq('id', run.id as string);
      assertDb(items.error, 'queue the images');
    }

    return NextResponse.json({
      run: toRun(run),
      items: ((items.data ?? []) as unknown as Row[]).map(toItem),
      // What was left out, for the toast.
      note: [
        sameShape ? `${count(sameShape, 'image')} already ${body.ratio}` : '',
        existing ? `${count(existing, 'image')} already ${existing === 1 ? 'has' : 'have'} this version` : '',
        unfinished ? `${count(unfinished, 'image')} not finished yet` : '',
      ].filter(Boolean).join(' · ') || null,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not make the other size');
  }
}
