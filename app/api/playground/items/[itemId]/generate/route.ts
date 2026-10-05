import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, requireUuid, withUser } from '@/lib/server/playground/http';
import { claimItem, getOwnedItem, ITEM_COLUMNS, playgroundDb, releaseItem, toItem, toRun } from '@/lib/server/playground/db';
import { PlaygroundGenerationError } from '@/lib/server/playground/errors';
import { generatePlaygroundImage } from '@/lib/server/playground/generate';
import { savePlaygroundImage } from '@/lib/server/playground/images';
import { logUsage } from '@/lib/server/usage';
import { playgroundModel, sizeOption, sizePrice } from '@/lib/playground/models';
import type { GenerateResponse, PlaygroundRun } from '@/lib/playground/types';

export const maxDuration = 300;

type Context = { params: Promise<{ itemId: string }> };

/** An image that keeps hitting a busy provider is failed after this many tries. */
const MAX_ATTEMPTS = 5;

/**
 * Makes one queued image: claims it and charges the run's price in one database step,
 * sends the model's provider (Gemini or OpenAI) the brief, the references and this image's
 * prompt, stores the result, and refunds on any failure. A busy provider puts the image back
 * in the queue (429); a billing or key problem pauses the run (503).
 */
export async function POST(request: NextRequest, { params }: Context) {
  const deadline = Date.now() + 270_000;
  let claimed: { itemId: string; userId: string } | null = null;
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'image');
    const db = playgroundDb();

    const claim = await claimItem(db, itemId, user.id);
    if (claim.result === 'not_found') throw new ApiError(404, 'Image not found.', 'not_found');
    if (claim.result === 'not_claimable') {
      const current = toItem(await getOwnedItem(db, itemId, user.id, ITEM_COLUMNS));
      return NextResponse.json({ outcome: 'not_claimable', item: current } satisfies GenerateResponse, { status: 409 });
    }
    if (claim.result === 'insufficient_credits') {
      return NextResponse.json({
        outcome: 'insufficient_credits',
        needed: claim.needed,
        balance: claim.balance,
        message: `You're out of credits: this image needs ${claim.needed} and you have ${claim.balance}.`,
      } satisfies GenerateResponse, { status: 402 });
    }
    claimed = { itemId, userId: user.id };

    const item = await getOwnedItem(db, itemId, user.id, `${ITEM_COLUMNS}, project_id`);
    const runRow = await db.from('playground_runs').select('*').eq('id', item.run_id as string).single();
    assertDb(runRow.error, 'load the run');
    const run: PlaygroundRun = toRun(runRow.data as Record<string, unknown>);
    const prompt = run.prompts[Number(item.prompt_index)] ?? '';

    try {
      const generated = await generatePlaygroundImage({
        model: run.model,
        size: run.size,
        aspectRatio: item.aspect_ratio as string,
        thinking: run.thinking,
        quality: run.quality,
        brief: run.brief,
        references: run.references,
        prompt,
        deadline,
      });
      const saved = await savePlaygroundImage(generated.bytes, generated.mimeType);

      const finished = await db
        .from('playground_items')
        .update({
          status: 'done',
          image_url: saved.imageUrl,
          preview_url: saved.previewUrl,
          width: saved.width,
          height: saved.height,
          mime_type: saved.mimeType,
          error: null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .eq('status', 'generating')
        .select(ITEM_COLUMNS)
        .maybeSingle();
      assertDb(finished.error, 'save the image');

      const model = playgroundModel(run.model);
      const listed = sizeOption(model, run.size) ?? model.sizes.find((size) => size.id === run.size);
      await Promise.all([
        db.from('playground_projects')
          .update({ cover_url: saved.previewUrl, updated_at: new Date().toISOString() })
          .eq('id', item.project_id as string),
        logUsage({
          user,
          provider: model.provider,
          model: run.model,
          feature: 'image_generation',
          inputTokens: generated.usage.inputTokens,
          outputTokens: generated.usage.outputTokens,
          totalTokens: generated.usage.totalTokens,
          imageCount: 1,
          // OpenAI's token usage gives the real price; Gemini's comes from the price list.
          estimatedCostUsd: generated.costUsd ?? (listed ? sizePrice(listed, run.quality).usd : 0),
          creditCost: claim.credits,
          metadata: {
            mode: 'playground',
            projectId: item.project_id,
            runId: run.id,
            itemId,
            aspectRatio: item.aspect_ratio,
            imageSize: run.size,
            quality: run.quality,
            variation: item.variation,
            referenceCount: run.references.length,
            attempt: item.attempts,
          },
        }),
      ]);

      const done = finished.data
        ? toItem(finished.data as unknown as Record<string, unknown>)
        : toItem(await getOwnedItem(db, itemId, user.id, ITEM_COLUMNS));
      return NextResponse.json({ outcome: 'done', item: done } satisfies GenerateResponse);
    } catch (error) {
      const failure = error instanceof PlaygroundGenerationError
        ? error
        : new PlaygroundGenerationError('failed', error instanceof Error ? `The image couldn't be saved: ${error.message}` : 'Image generation failed.');
      const attempts = Number(item.attempts) || 1;

      if ((failure.kind === 'rate_limited' && attempts < MAX_ATTEMPTS) || failure.kind === 'paused') {
        await releaseItem(db, itemId, user.id, 'queued', failure.message);
        const current = toItem(await getOwnedItem(db, itemId, user.id, ITEM_COLUMNS));
        const response: GenerateResponse = failure.kind === 'paused'
          ? { outcome: 'paused', item: current, message: failure.message }
          : { outcome: 'rate_limited', item: current, message: failure.message, retryAfterMs: failure.retryAfterMs ?? 20_000 };
        return NextResponse.json(response, { status: failure.kind === 'paused' ? 503 : 429 });
      }

      const message = failure.kind === 'rate_limited'
        ? `${playgroundModel(run.model).provider === 'openai' ? 'OpenAI' : 'Gemini'} stayed busy for this image. Try it again in a few minutes.`
        : failure.message;
      await releaseItem(db, itemId, user.id, 'failed', message);
      const current = toItem(await getOwnedItem(db, itemId, user.id, ITEM_COLUMNS));
      return NextResponse.json({ outcome: 'failed', item: current, message } satisfies GenerateResponse);
    }
  } catch (error) {
    // Anything that failed after this request's claim must not keep the credits.
    if (claimed) {
      await releaseItem(playgroundDb(), claimed.itemId, claimed.userId, 'failed', 'Something went wrong while making this image. Your credits were refunded.');
    }
    return apiErrorResponse(error, 'Could not make the image');
  }
}
