-- Clients: the brands GoGrowth works for. Every project (image or video) can belong to one, so
-- the owner's dashboard groups work and spend by client instead of guessing from project names.
-- One list for the whole agency; only the server reads or writes it.
-- Run it in the Supabase SQL Editor; it is safe to run again.

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One client per name, ignoring case, spaces and punctuation: "R casa" and "Rcasa" are the same.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_name_key
  ON public.clients ((regexp_replace(lower(name), '[^[:alnum:]]+', '', 'g')));

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages clients" ON public.clients;
CREATE POLICY "Service role manages clients" ON public.clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.playground_projects
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_playground_projects_client
  ON public.playground_projects(client_id, updated_at DESC) WHERE client_id IS NOT NULL;

-- Spend outlives its project: before a project with a client is deleted, its usage rows (the
-- billing record, which stays) remember the client, so the money still counts for it.
CREATE OR REPLACE FUNCTION public.playground_project_keep_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.client_id IS NOT NULL THEN
    UPDATE public.usage_logs
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('clientId', OLD.client_id::text)
     WHERE user_id = OLD.user_id
       AND metadata->>'projectId' = OLD.id::text;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS playground_projects_keep_client ON public.playground_projects;
CREATE TRIGGER playground_projects_keep_client
  BEFORE DELETE ON public.playground_projects
  FOR EACH ROW EXECUTE FUNCTION public.playground_project_keep_client();

CREATE INDEX IF NOT EXISTS idx_usage_logs_client
  ON public.usage_logs((metadata->>'clientId')) WHERE metadata ? 'clientId';

-- Two clients that are really one: the first one's projects and remembered spend move to the
-- second, then the first is removed. All or nothing.
CREATE OR REPLACE FUNCTION public.merge_clients(p_from UUID, p_into UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_projects INTEGER;
BEGIN
  IF p_from = p_into THEN
    RETURN jsonb_build_object('result', 'same');
  END IF;
  PERFORM 1 FROM public.clients WHERE id IN (p_from, p_into) FOR UPDATE;
  IF (SELECT count(*) FROM public.clients WHERE id IN (p_from, p_into)) < 2 THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  UPDATE public.playground_projects SET client_id = p_into WHERE client_id = p_from;
  GET DIAGNOSTICS v_projects = ROW_COUNT;
  UPDATE public.usage_logs
     SET metadata = jsonb_set(metadata, '{clientId}', to_jsonb(p_into::text))
   WHERE metadata ? 'clientId' AND metadata->>'clientId' = p_from::text;
  DELETE FROM public.clients WHERE id = p_from;
  UPDATE public.clients SET updated_at = NOW() WHERE id = p_into;

  RETURN jsonb_build_object('result', 'merged', 'projects', v_projects);
END;
$$;
REVOKE ALL ON FUNCTION public.merge_clients(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_clients(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
