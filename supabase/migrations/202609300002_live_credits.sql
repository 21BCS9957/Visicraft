-- Live credit balance: the browser subscribes to changes on the signed-in user's own
-- user_credits row (lib/contexts/CreditsContext.tsx), so charges and refunds show up at once.
-- Row security still decides which rows a subscriber may receive. Safe to run again.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_credits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;
  END IF;
END
$$;
