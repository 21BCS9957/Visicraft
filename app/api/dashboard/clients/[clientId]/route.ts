import { NextRequest, NextResponse } from 'next/server';
import { loadClient, requireDashboardOwner } from '@/lib/server/dashboard';
import { renameClient } from '@/lib/server/clients';
import { apiErrorResponse, readJson, requireUuid } from '@/lib/server/playground/http';
import { createServiceClient } from '@/lib/supabase/server';

type Context = { params: Promise<{ clientId: string }> };

/** One client: who worked on it, what was made and spent (?person= one team account), its projects. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    await requireDashboardOwner(request);
    const { clientId } = await params;
    const person = request.nextUrl.searchParams.get('person');
    return NextResponse.json(await loadClient(clientId, person && /^[0-9a-f-]{36}$/i.test(person) ? person : null));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the client');
  }
}

/** Renames the client. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireDashboardOwner(request);
    const clientId = requireUuid((await params).clientId, 'client');
    const body = await readJson<{ name?: unknown }>(request);
    return NextResponse.json({ client: await renameClient(createServiceClient(), clientId, body.name) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not rename the client');
  }
}
