import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, requireUuid, withUser } from '@/lib/server/playground/http';
import { playgroundDb } from '@/lib/server/playground/db';

type Context = { params: Promise<{ runId: string }> };

/** Cancels the run's images that haven't started; nothing was charged for them. */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const runId = requireUuid((await params).runId, 'run');
    const db = playgroundDb();
    const run = await db.from('playground_runs').select('id').eq('id', runId).eq('user_id', user.id).maybeSingle();
    assertDb(run.error, 'load the run');
    if (!run.data) throw new ApiError(404, 'Run not found.', 'not_found');

    const now = new Date().toISOString();
    const { data, error } = await db
      .from('playground_items')
      .update({ status: 'cancelled', finished_at: now })
      .eq('run_id', runId)
      .eq('status', 'queued')
      .select('id');
    assertDb(error, 'cancel the run');
    await db.from('playground_runs').update({ cancelled_at: now }).eq('id', runId);
    return NextResponse.json({ cancelledIds: ((data ?? []) as Array<{ id: string }>).map((row) => row.id) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not cancel the run');
  }
}
