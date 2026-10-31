import { NextRequest, NextResponse } from 'next/server';
import { requireCountedProject, requireDashboardOwner } from '@/lib/server/dashboard';
import { setProjectClient } from '@/lib/server/clients';
import { apiErrorResponse, readJson, requireUuid } from '@/lib/server/playground/http';
import { createServiceClient } from '@/lib/supabase/server';

type Context = { params: Promise<{ projectId: string }> };

/** Puts a team (or owner) project under a client, or none (`clientId: null`). */
export async function PUT(request: NextRequest, { params }: Context) {
  try {
    await requireDashboardOwner(request);
    const project = await requireCountedProject((await params).projectId);
    const body = await readJson<{ clientId?: unknown }>(request);
    const clientId = body.clientId === null ? null : requireUuid(body.clientId, 'client');
    await setProjectClient(createServiceClient(), project.id, clientId);
    return NextResponse.json({ projectId: project.id, clientId });
  } catch (error) {
    return apiErrorResponse(error, 'Could not change the project’s client');
  }
}
