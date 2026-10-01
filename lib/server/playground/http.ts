import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { requireAuthenticatedUser } from '@/lib/server/usage';

// Verifies sign-in tokens locally: the project signs them with an asymmetric key, which
// auth-js fetches once and caches for 10 minutes, so no request waits on Supabase Auth.
let verifier: ReturnType<typeof createSupabaseClient> | null = null;

async function userFromToken(request: NextRequest): Promise<User | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  verifier ??= createSupabaseClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await verifier.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub || claims.role !== 'authenticated') return null;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    app_metadata: (claims.app_metadata as User['app_metadata']) ?? {},
    user_metadata: (claims.user_metadata as User['user_metadata']) ?? {},
    aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
    created_at: '',
  };
}

export const SETUP_MESSAGE =
  "The Playground's database tables aren't set up yet. Run supabase/migrations/202609300001_playground.sql in the Supabase SQL Editor.";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function withUser(request: NextRequest): Promise<User> {
  try {
    const fast = await userFromToken(request).catch(() => null);
    if (fast) return fast;
    return await requireAuthenticatedUser(request);
  } catch {
    throw new ApiError(401, 'Please sign in to use the Playground.', 'auth');
  }
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'The request body must be JSON.', 'bad_request');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function requireUuid(value: unknown, what: string): string {
  if (!isUuid(value)) throw new ApiError(400, `Invalid ${what}.`, 'bad_request');
  return value;
}

/** A Supabase error that means the migration hasn't been run (missing table or function). */
export function isSetupError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')
    || /could not find the (table|function)|does not exist/i.test(error.message ?? '');
}

/** Throws the right ApiError for a failed Supabase call. */
export function assertDb(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (isSetupError(error)) throw new ApiError(503, SETUP_MESSAGE, 'setup');
  console.error(`Playground: ${action} failed:`, error);
  throw new ApiError(500, `Could not ${action}.`, 'db');
}

export function apiErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status: error.status });
  }
  console.error(`Playground: ${fallback}:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
