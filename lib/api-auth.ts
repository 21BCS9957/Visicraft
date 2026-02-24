import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Get the authenticated user from the request (cookies).
 * Use in API routes to enforce authentication.
 * Returns { user } or null if not authenticated.
 */
export async function getSessionForApi(): Promise<{ user: User } | null> {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return null;
  }
  return { user: session.user };
}

/**
 * Require authentication for an API route.
 * Returns the user if authenticated, or a 401 NextResponse to return to the client.
 */
export async function requireAuth(): Promise<
  | { user: User }
  | NextResponse
> {
  const session = await getSessionForApi();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in.' },
      { status: 401 }
    );
  }
  return session;
}
