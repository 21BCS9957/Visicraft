import { NextRequest, NextResponse } from 'next/server';
import { loadClients, requireDashboardOwner } from '@/lib/server/dashboard';
import { createClient } from '@/lib/server/clients';
import { apiErrorResponse, readJson } from '@/lib/server/playground/http';
import { createServiceClient } from '@/lib/supabase/server';

/** Every client with what was made and spent for it, and the projects not sorted yet. */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    return NextResponse.json(await loadClients());
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the clients');
  }
}

/** Adds a client (or returns the one that already has this name). */
export async function POST(request: NextRequest) {
  try {
    const owner = await requireDashboardOwner(request);
    const body = await readJson<{ name?: unknown }>(request);
    return NextResponse.json(await createClient(createServiceClient(), body.name, owner.id));
  } catch (error) {
    return apiErrorResponse(error, 'Could not add the client');
  }
}
