import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { playgroundDb } from '@/lib/server/playground/db';
import { isAgencyUser } from '@/lib/server/agency';
import { assignedClients, createClient, listClients, requireAgency } from '@/lib/server/clients';

/**
 * The agency's clients for the project picker, and which of the caller's projects have one.
 * Anyone outside GoGrowth (or before the migration) gets `enabled: false` and an empty list.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    if (!(await isAgencyUser(user.id))) return NextResponse.json({ enabled: false, clients: [], assigned: {} });
    const db = playgroundDb();
    const { clients, setup } = await listClients(db);
    if (setup) return NextResponse.json({ enabled: false, clients: [], assigned: {}, setup });
    return NextResponse.json({ enabled: true, clients, assigned: await assignedClients(db, user.id) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the clients');
  }
}

/** Adds a client, or returns the one that already has this name (`existed: true`). */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    await requireAgency(user.id);
    const body = await readJson<{ name?: unknown }>(request);
    return NextResponse.json(await createClient(playgroundDb(), body.name, user.id));
  } catch (error) {
    return apiErrorResponse(error, 'Could not add the client');
  }
}
