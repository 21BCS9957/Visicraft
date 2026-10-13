import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import type { User } from '@supabase/supabase-js';
import { playgroundDb, toRun } from '@/lib/server/playground/db';
import { PlaygroundGenerationError } from '@/lib/server/playground/errors';
import { extendImage, loadOriginal } from '@/lib/server/playground/extend';
import { savePlaygroundImage } from '@/lib/server/playground/images';
import { makeOtherSize } from '@/lib/server/playground/resize';
import { decodeRgb, fitImage, resizeRgb } from '@/lib/server/playground/resizeImage';
import { findTextBand } from '@/lib/server/playground/textBand';
import { isPlaygroundModel, playgroundModel, type PlaygroundModelId } from '@/lib/playground/models';
import { clearPlacement, copyCanvas, DEFAULT_EXTEND_MODEL, EXTEND_MODELS, placeOriginal, remakeSize, resizePrice, safeApplies } from '@/lib/playground/resize';

export const maxDuration = 300;

/**
 * Development-only harness for "Another size". Nothing is charged in credits.
 * POST { url, ratio = '9:16', method: 'fit' | 'extend' | 'remake', model?, background? }: makes
 * one copy of the image at `url` (Extend and Remake call the model, which the provider bills),
 * stores it like a Playground image and reports whether the original's area came back pixel for
 * pixel (Extend). Remake looks the image up by its URL and uses its run's prompt, references,
 * guidelines and model, through the same code as the queue.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as { url?: string; ratio?: string; method?: string; model?: string; background?: string; safe?: boolean };
  const safe = body.safe === true;
  if (!body.url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
  const ratio = body.ratio ?? '9:16';
  const started = Date.now();
  try {
    const source = await loadOriginal(body.url);
    const canvas = copyCanvas(source.width, source.height, ratio);
    if (!canvas) return NextResponse.json({ error: `No ${ratio} size` }, { status: 400 });

    if (body.method === 'fit') {
      // Keep clear: the same quick look for the text as the queue, then slide (or shrink).
      const textBand = safe && safeApplies('fit', ratio) ? await findTextBand(source).catch(() => undefined) : null;
      const place = safe && safeApplies('fit', ratio)
        ? (textBand === undefined
          ? placeOriginal(source.width, source.height, canvas.width, canvas.height, 'fit', ratio, true)
          : clearPlacement(source.width, source.height, canvas.width, canvas.height, textBand, 'fit').rect)
        : undefined;
      const fit = await fitImage(source, canvas.width, canvas.height, ratio, body.background ?? 'blur', place);
      const saved = await savePlaygroundImage(fit.bytes, 'image/jpeg');
      return NextResponse.json({ method: 'fit', ms: Date.now() - started, canvas, rect: fit.rect, textBand, ...saved });
    }

    if (body.method === 'remake') {
      const db = playgroundDb();
      const item = await db.from('playground_items').select('id, run_id, user_id, prompt_index, aspect_ratio').eq('image_url', body.url).limit(1).maybeSingle();
      if (!item.data?.run_id) return NextResponse.json({ error: 'No Playground image with that URL (made in a run)' }, { status: 404 });
      const runRow = await db.from('playground_runs').select('*').eq('id', item.data.run_id).single();
      const sourceRun = toRun(runRow.data as Record<string, unknown>);
      const model = playgroundModel(sourceRun.model);
      const run = { ...sourceRun, size: remakeSize(model.id, sourceRun.size), ratios: [ratio], resize: { method: 'remake' as const, fromRunId: sourceRun.id } };
      const made = await makeOtherSize({
        db,
        user: { id: item.data.user_id } as User,
        run,
        item: { id: 'dev-remake', aspectRatio: ratio, parentItemId: item.data.id },
        prompt: sourceRun.prompts[Number(item.data.prompt_index)] ?? '',
        deadline: Date.now() + 270_000,
      });
      const saved = await savePlaygroundImage(made.bytes, made.mimeType);
      return NextResponse.json({
        method: 'remake',
        model: model.id,
        size: run.size,
        references: run.references.length,
        ms: Date.now() - started,
        calls: made.calls,
        details: made.details,
        usage: made.usage,
        costUsd: made.costUsd,
        credits: resizePrice({ method: 'remake', model: model.id, size: run.size, quality: run.quality, referenceCount: run.references.length }).credits,
        ...saved,
      });
    }

    const model = (isPlaygroundModel(body.model) && EXTEND_MODELS.includes(body.model) ? body.model : DEFAULT_EXTEND_MODEL) as PlaygroundModelId;
    const extended = await extendImage({ sourceUrl: body.url, model, size: canvas.size, ratio, safe, deadline: Date.now() + 270_000 });
    const saved = await savePlaygroundImage(extended.bytes, extended.mimeType);

    // The original's area of the copy against the original scaled the same way.
    const output = await decodeRgb(extended.bytes);
    const rect = extended.rect;
    const scaled = await resizeRgb(source, rect.width, rect.height);
    const region = await sharp(output.data, { raw: { width: output.width, height: output.height, channels: 3 } })
      .extract(rect)
      .raw()
      .toBuffer();
    let differing = 0;
    for (let i = 0; i < region.length; i++) if (region[i] !== scaled.data[i]) differing++;

    return NextResponse.json({
      method: 'extend',
      model,
      ms: Date.now() - started,
      canvas,
      rect,
      calls: extended.calls,
      alignment: extended.alignment,
      placement: extended.placement,
      originalAreaIdentical: differing === 0,
      differingValues: differing,
      usage: extended.usage,
      credits: resizePrice({ method: 'extend', model, size: canvas.size }).credits,
      ...saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = error instanceof PlaygroundGenerationError ? error.kind : 'error';
    return NextResponse.json({ error: message, kind, ms: Date.now() - started }, { status: 500 });
  }
}
