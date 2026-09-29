import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireAuthenticatedUser } from '@/lib/server/usage';

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
