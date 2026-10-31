import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, isUuid } from '@/lib/server/playground/http';
import { isAgencyUser } from '@/lib/server/agency';
import { cleanClientName, clientInName, clientKey, findClient, isDefaultProjectName, leadingKeys, type ClientRef } from '@/lib/clients';

/**
 * The agency's client list and which project belongs to which client. Only the server reads or
 * writes it (the table has no policy for signed-in users), and only for GoGrowth accounts.
 */

type Db = ReturnType<typeof createServiceClient>;
type DbError = { code?: string; message?: string } | null;

export const CLIENTS_SETUP_MESSAGE =
  "Clients aren't set up yet. Run supabase/migrations/202610220001_clients.sql in the Supabase SQL Editor.";

/** The clients table or the projects' client column isn't there yet (the migration hasn't run). */
export function isClientsMissing(error: DbError): boolean {
  return Boolean(error && ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error.code ?? ''));
}

/** Every client, A–Z; `setup` when the migration hasn't run. */
export async function listClients(db: Db): Promise<{ clients: ClientRef[]; setup?: string }> {
  const { data, error } = await db.from('clients').select('id, name').order('name', { ascending: true }).limit(2000);
  if (isClientsMissing(error)) return { clients: [], setup: CLIENTS_SETUP_MESSAGE };
  if (error) throw new ApiError(500, 'Could not load the clients.', 'db');
  return { clients: ((data ?? []) as ClientRef[]).map((row) => ({ id: String(row.id), name: String(row.name) })) };
}

export async function requireClient(db: Db, clientId: unknown): Promise<ClientRef> {
  if (!isUuid(clientId)) throw new ApiError(404, 'This client was not found.', 'not_found');
  const { data, error } = await db.from('clients').select('id, name').eq('id', clientId).maybeSingle();
  if (isClientsMissing(error)) throw new ApiError(503, CLIENTS_SETUP_MESSAGE, 'setup');
  if (error) throw new ApiError(500, 'Could not load the client.', 'db');
  if (!data) throw new ApiError(404, 'This client was not found.', 'not_found');
  return { id: String(data.id), name: String(data.name) };
}

/** A GoGrowth account, or 403: the client list is the agency's. */
export async function requireAgency(userId: string): Promise<void> {
  if (!(await isAgencyUser(userId))) throw new ApiError(403, 'Clients are only for GoGrowth accounts.', 'forbidden');
}

/**
 * Adds a client, or returns the one that already has this name (ignoring case, spaces and
 * punctuation), so the team can't make "Rcasa" next to "R casa".
 */
export async function createClient(db: Db, rawName: unknown, userId: string | null): Promise<{ client: ClientRef; existed: boolean }> {
  const name = cleanClientName(rawName);
  if (!clientKey(name)) throw new ApiError(400, 'Give the client a name.', 'bad_request');
  const { clients, setup } = await listClients(db);
  if (setup) throw new ApiError(503, setup, 'setup');
  const existing = findClient(clients, name);
  if (existing) return { client: existing, existed: true };
  const { data, error } = await db.from('clients').insert({ name, created_by: userId }).select('id, name').single();
  if (error?.code === '23505') {
    // Someone added it a moment ago.
    const again = findClient((await listClients(db)).clients, name);
    if (again) return { client: again, existed: true };
  }
  if (error || !data) throw new ApiError(500, 'Could not add the client.', 'db');
  return { client: { id: String(data.id), name: String(data.name) }, existed: false };
}

export async function renameClient(db: Db, clientId: string, rawName: unknown): Promise<ClientRef> {
  const client = await requireClient(db, clientId);
  const name = cleanClientName(rawName);
  if (!clientKey(name)) throw new ApiError(400, 'Give the client a name.', 'bad_request');
  const other = findClient((await listClients(db)).clients.filter((known) => known.id !== client.id), name);
  if (other) throw new ApiError(409, `“${other.name}” already exists. Merge into it instead.`, 'duplicate');
  const { error } = await db.from('clients').update({ name, updated_at: new Date().toISOString() }).eq('id', client.id);
  if (error?.code === '23505') throw new ApiError(409, 'A client with this name already exists. Merge into it instead.', 'duplicate');
  if (error) throw new ApiError(500, 'Could not rename the client.', 'db');
  return { id: client.id, name };
}

/** Moves one client's projects (and the spend of its deleted projects) to another, then removes it. */
export async function mergeClients(db: Db, fromId: string, intoId: string): Promise<{ projects: number }> {
  if (fromId === intoId) throw new ApiError(400, 'Pick a different client to merge into.', 'bad_request');
  await Promise.all([requireClient(db, fromId), requireClient(db, intoId)]);
  const { data, error } = await db.rpc('merge_clients', { p_from: fromId, p_into: intoId });
  const result = (data ?? {}) as { result?: string; projects?: number };
  if (error || result.result !== 'merged') throw new ApiError(500, 'Could not merge the clients.', 'db');
  return { projects: Number(result.projects) || 0 };
}

/**
 * Puts a project under a client (or none). `ownerId` limits it to that account's projects (the
 * Playground); the dashboard checks the project's account itself. Its "updated" time stays, so
 * sorting projects doesn't reorder anyone's list.
 */
export async function setProjectClient(db: Db, projectId: string, clientId: string | null, ownerId?: string): Promise<void> {
  if (clientId) await requireClient(db, clientId);
  let query = db.from('playground_projects').update({ client_id: clientId }).eq('id', projectId);
  if (ownerId) query = query.eq('user_id', ownerId);
  const { data, error } = await query.select('id');
  if (isClientsMissing(error)) throw new ApiError(503, CLIENTS_SETUP_MESSAGE, 'setup');
  if (error) throw new ApiError(500, 'Could not change the client.', 'db');
  if (!data?.length) throw new ApiError(404, 'This project was not found.', 'not_found');
}

/** Which of an account's projects have a client (project id → client id). */
export async function assignedClients(db: Db, userId: string): Promise<Record<string, string>> {
  const { data, error } = await db.from('playground_projects').select('id, client_id').eq('user_id', userId).not('client_id', 'is', null).limit(2000);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as Array<{ id: string; client_id: string }>).map((row) => [String(row.id), String(row.client_id)]));
}

export interface ClientSuggestion {
  /** An existing client, or null for a new one called `name`. */
  clientId: string | null;
  name: string;
}

/**
 * A client for each unsorted project that can be told from its name, for the owner to accept:
 * - a project whose first words are an existing client's name goes to that client;
 * - projects that start with another one's whole name at a word break ("Thriller",
 *   "Thriller Grip me"; "R casa", "Rcasa Banners") or share their first words ("Brew Sage
 *   launch", "Brew Sage offer") make a new client together.
 * A name the app gave ("Project 12 Oct") or a one-off name gets nothing: the owner picks.
 */
export function suggestClients(projects: Array<{ id: string; name: string }>, clients: ClientRef[]): Map<string, ClientSuggestion> {
  const suggestions = new Map<string, ClientSuggestion>();
  const named = projects.filter((project) => !isDefaultProjectName(project.name) && clientKey(project.name));
  const rest: typeof named = [];
  for (const project of named) {
    const client = clientInName(clients, project.name);
    if (client) suggestions.set(project.id, { clientId: client.id, name: client.name });
    else rest.push(project);
  }

  // Shortest names first, so "Thriller" is a group before "Thriller Grip me" looks for one.
  type Group = { key: string; name: string; ids: string[] };
  const groups: Group[] = [];
  for (const project of [...rest].sort((a, b) => clientKey(a.name).length - clientKey(b.name).length)) {
    const keys = leadingKeys(project.name);
    const group = groups.find((known) => keys.includes(known.key));
    if (group) group.ids.push(project.id);
    else groups.push({ key: clientKey(project.name), name: cleanClientName(project.name), ids: [project.id] });
  }

  // Projects still alone that share their first words make a group named after those words.
  const alone = groups.filter((group) => group.ids.length === 1);
  const byFirst = new Map<string, Group[]>();
  for (const group of alone) {
    const first = leadingKeys(group.name)[0];
    byFirst.set(first, [...(byFirst.get(first) ?? []), group]);
  }
  for (const same of byFirst.values()) {
    if (same.length < 2) continue;
    const words = same.map((group) => group.name.split(/\s+/));
    let shared = 0;
    while (words.every((list) => shared < list.length && clientKey(list[shared]) === clientKey(words[0][shared]))) shared += 1;
    const name = cleanClientName(words[0].slice(0, shared).join(' '));
    if (clientKey(name).length < 3) continue;
    groups.push({ key: clientKey(name), name, ids: same.flatMap((group) => group.ids) });
    for (const group of same) group.ids = [];
  }

  for (const group of groups) {
    if (group.ids.length < 2) continue;
    const existing = findClient(clients, group.name);
    for (const id of group.ids) suggestions.set(id, { clientId: existing?.id ?? null, name: existing?.name ?? group.name });
  }
  return suggestions;
}
