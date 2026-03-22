import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost:3000';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

console.log("DEBUG: ", supabaseUrl, supabaseAnonKey)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
