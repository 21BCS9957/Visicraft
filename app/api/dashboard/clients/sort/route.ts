import { NextRequest, NextResponse } from 'next/server';
import { countedAccounts, requireCountedProject, requireDashboardOwner } from '@/lib/server/dashboard';
import { createClient, requireClient, setProjectClient } from '@/lib/server/clients';
import { ApiError, apiErrorResponse, isUuid, readJson } from '@/lib/server/playground/http';
import { createServiceClient } from '@/lib/supabase/server';
import { clientKey } from '@/lib/clients';

type Assignment = { projectId?: unknown; clientId?: unknown; newClient?: unknown };

/**
 * Sorts several projects at once (the owner accepting suggestions): each goes to an existing
 * client (`clientId`) or to a new one (`newClient`, added once however many projects share it).
 */
export async function POST(request: NextRequest) {
  try {
    const owner = await requireDashboardOwner(request);
    const body = await readJson<{ assignments?: unknown }>(request);
    const assignments = Array.isArray(body.assignments) ? (body.assignments as Assignment[]).slice(0, 500) : [];
    if (!assignments.length) throw new ApiError(400, 'Nothing to sort.', 'bad_request');
    const db = createServiceClient();
    const { counted } = await countedAccounts();
    const added = new Map<string, string>();
    const results: Array<{ projectId: string; clientId: string }> = [];
    for (const assignment of assignments) {
      const project = await requireCountedProject(String(assignment.projectId ?? ''), counted);
      let clientId: string;
      if (isUuid(assignment.clientId)) {
        clientId = (await requireClient(db, assignment.clientId)).id;
      } else {
        const key = clientKey(String(assignment.newClient ?? ''));
        if (!key) throw new ApiError(400, 'A new client needs a name.', 'bad_request');
        clientId = added.get(key) ?? (await createClient(db, assignment.newClient, owner.id)).client.id;
        added.set(key, clientId);
      }
      await setProjectClient(db, project.id, clientId);
      results.push({ projectId: project.id, clientId });
    }
    return NextResponse.json({ sorted: results });
  } catch (error) {
    return apiErrorResponse(error, 'Could not sort the projects');
  }
}
