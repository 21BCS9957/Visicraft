import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardOwner } from '@/lib/server/dashboard';
import { mergeClients } from '@/lib/server/clients';
import { apiErrorResponse, readJson, requireUuid } from '@/lib/server/playground/http';
import { createServiceClient } from '@/lib/supabase/server';

type Context = { params: Promise<{ clientId: string }> };

/** Moves this client's projects (and its deleted projects' spend) into `into`, then removes it. */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    await requireDashboardOwner(request);
    const clientId = requireUuid((await params).clientId, 'client');
    const body = await readJson<{ into?: unknown }>(request);
    const into = requireUuid(body.into, 'client to merge into');
    return NextResponse.json(await mergeClients(createServiceClient(), clientId, into));
  } catch (error) {
    return apiErrorResponse(error, 'Could not merge the clients');
  }
}
