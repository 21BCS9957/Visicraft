-- Finish the lock-down from 202610070001.
--
-- That migration dropped the open policies by the names database-setup.sql gives them, but the
-- live generations table also had an open policy under another name: anyone holding the public
-- (anon) key could still read all 542 generations. Policies are permissive, so one open policy is
-- enough. This drops every policy on the three tables, whatever it is called, and puts back only
-- the owner-read policy on each.
--
-- The app writes these tables only from the server with the service-role key, which bypasses row
-- security. Signed-in users can still read their own rows. Safe to run again.

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('user_credits', 'usage_logs', 'generations')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END
$$;

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credits" ON public.user_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own usage logs" ON public.usage_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- user_id is text in this table.
CREATE POLICY "Users can view their own generations" ON public.generations
  FOR SELECT TO authenticated USING (auth.uid()::text = user_id);

-- What's left: one read policy per table.
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('user_credits', 'usage_logs', 'generations')
 ORDER BY tablename;
