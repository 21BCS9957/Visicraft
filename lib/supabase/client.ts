import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Uses cookies for auth so API routes (server) can read the same session.
 * Do not use the plain createClient from supabase-js here—it stores session in localStorage
 * and API routes would then get 401 Unauthorized.
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.error(
        'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
      );
    }
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = getSupabaseClient();
