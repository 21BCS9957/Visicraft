-- Lock down three tables that were open to everyone.
--
-- database-setup.sql gave usage_logs, user_credits and generations a policy
-- "FOR ALL USING (true)" with no role, so anyone holding the public (anon) key, which every
-- visitor's browser has, could read and change every row: all usage logs (emails, prompts,
-- video links), every credit balance and every generation. user_credits also let a signed-in
-- user update their own balance to any number.
--
-- The app writes these tables only from the server with the service-role key, which bypasses
-- row security, so charging, refunds and logging keep working. Signed-in users can still read
-- their own rows (the browser reads, and subscribes to, its own credit balance).
-- Safe to run again.

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- user_credits: your own balance is readable, never writable from the browser.
DROP POLICY IF EXISTS "Service role can do everything" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can view their own credits" ON public.user_credits;
CREATE POLICY "Users can view their own credits" ON public.user_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- usage_logs: your own rows are readable.
DROP POLICY IF EXISTS "Service role can manage usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Users can view their own usage logs" ON public.usage_logs;
CREATE POLICY "Users can view their own usage logs" ON public.usage_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- generations: your own rows are readable (user_id is text in this table).
DROP POLICY IF EXISTS "Allow all operations" ON public.generations;
DROP POLICY IF EXISTS "Users can view their own generations" ON public.generations;
CREATE POLICY "Users can view their own generations" ON public.generations
  FOR SELECT TO authenticated USING (auth.uid()::text = user_id);

-- Credits are deducted only by the server.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'deduct_user_credits'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.deduct_user_credits(UUID, INTEGER) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.deduct_user_credits(UUID, INTEGER) TO service_role';
  END IF;
END
$$;
