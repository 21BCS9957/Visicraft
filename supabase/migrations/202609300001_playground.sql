-- Playground: projects that keep reference images and a brief as saved context, prompt runs,
-- and one row per generated (or Canvas-edited) image. Run it in the Supabase SQL Editor;
-- it is safe to run again.

CREATE TABLE IF NOT EXISTS public.playground_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled project' CHECK (char_length(name) BETWEEN 1 AND 120),
  brief TEXT NOT NULL DEFAULT '' CHECK (char_length(brief) <= 8000),
  -- The composer's last choices (model, size, ratios, variations), restored on open.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playground_projects_user
  ON public.playground_projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.playground_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.playground_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'product' CHECK (role IN ('product', 'person', 'style')),
  label TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  -- Set when a generated image was turned into a reference.
  source_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playground_references_project
  ON public.playground_references(project_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.playground_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.playground_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Sent by the browser so a double-clicked Generate creates one run.
  client_key UUID NOT NULL,
  model TEXT NOT NULL,
  image_size TEXT NOT NULL,
  aspect_ratios TEXT[] NOT NULL,
  variations SMALLINT NOT NULL DEFAULT 1 CHECK (variations BETWEEN 1 AND 4),
  thinking TEXT CHECK (thinking IN ('minimal', 'high')),
  -- What every image of the run was made with, as the user saw it when pressing Generate.
  brief TEXT NOT NULL DEFAULT '',
  reference_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompts TEXT[] NOT NULL,
  image_count INTEGER NOT NULL CHECK (image_count BETWEEN 1 AND 200),
  -- The price is fixed when the run is created; the claim reads it from here.
  credits_per_image INTEGER NOT NULL CHECK (credits_per_image >= 0),
  usd_per_image NUMERIC(10,4) NOT NULL DEFAULT 0,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playground_runs_client_key
  ON public.playground_runs(user_id, client_key);
CREATE INDEX IF NOT EXISTS idx_playground_runs_project
  ON public.playground_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.playground_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.playground_projects(id) ON DELETE CASCADE,
  -- NULL for images saved from the Canvas.
  run_id UUID REFERENCES public.playground_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'generated' CHECK (kind IN ('generated', 'edit')),
  parent_item_id UUID REFERENCES public.playground_items(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  prompt_index INTEGER,
  aspect_ratio TEXT NOT NULL,
  variation SMALLINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'done', 'failed', 'cancelled')),
  -- Credits currently held for this image: set by the claim, returned to 0 by a refund.
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  attempts INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  preview_url TEXT,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  error TEXT,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  -- Canvas layers of an edited image, so its text stays editable.
  canvas_doc JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playground_items_run_position
  ON public.playground_items(run_id, position);
CREATE INDEX IF NOT EXISTS idx_playground_items_project
  ON public.playground_items(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playground_items_generating
  ON public.playground_items(user_id, started_at) WHERE status = 'generating';

-- Owners can read their rows; every write goes through the server (service role).
ALTER TABLE public.playground_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playground_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playground_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playground_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read playground projects" ON public.playground_projects;
CREATE POLICY "Owners read playground projects" ON public.playground_projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages playground projects" ON public.playground_projects;
CREATE POLICY "Service role manages playground projects" ON public.playground_projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read playground references" ON public.playground_references;
CREATE POLICY "Owners read playground references" ON public.playground_references
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages playground references" ON public.playground_references;
CREATE POLICY "Service role manages playground references" ON public.playground_references
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read playground runs" ON public.playground_runs;
CREATE POLICY "Owners read playground runs" ON public.playground_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages playground runs" ON public.playground_runs;
CREATE POLICY "Service role manages playground runs" ON public.playground_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read playground items" ON public.playground_items;
CREATE POLICY "Owners read playground items" ON public.playground_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages playground items" ON public.playground_items;
CREATE POLICY "Service role manages playground items" ON public.playground_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Claims a queued (or failed) image and charges the run's price in one transaction, so an
-- image is never generated twice and never charged without being recorded.
CREATE OR REPLACE FUNCTION public.playground_claim_item(p_item_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item public.playground_items%ROWTYPE;
  v_cost INTEGER;
  v_balance INTEGER;
BEGIN
  SELECT * INTO v_item FROM public.playground_items
   WHERE id = p_item_id AND user_id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF v_item.status NOT IN ('queued', 'failed') THEN
    RETURN jsonb_build_object('result', 'not_claimable', 'status', v_item.status);
  END IF;

  SELECT credits_per_image INTO v_cost FROM public.playground_runs WHERE id = v_item.run_id;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT credits INTO v_balance FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('result', 'insufficient_credits', 'needed', v_cost, 'balance', COALESCE(v_balance, 0));
  END IF;

  UPDATE public.user_credits
     SET credits = credits - v_cost, updated_at = NOW()
   WHERE user_id = p_user_id;
  UPDATE public.playground_items
     SET status = 'generating', credits_charged = v_cost, attempts = attempts + 1,
         started_at = NOW(), finished_at = NULL, error = NULL
   WHERE id = p_item_id;

  RETURN jsonb_build_object('result', 'claimed', 'credits', v_cost, 'balance', v_balance - v_cost);
END
$$;

-- Ends a generating image as failed (or puts it back in the queue) and refunds what it
-- holds, in one transaction. Only a generating image can be released, so a refund happens
-- at most once per charge.
CREATE OR REPLACE FUNCTION public.playground_release_item(p_item_id UUID, p_user_id UUID, p_status TEXT, p_error TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_refund INTEGER;
BEGIN
  IF p_status NOT IN ('queued', 'failed') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;

  SELECT credits_charged INTO v_refund FROM public.playground_items
   WHERE id = p_item_id AND user_id = p_user_id AND status = 'generating'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.playground_items
     SET status = p_status,
         credits_charged = 0,
         error = LEFT(p_error, 500),
         finished_at = CASE WHEN p_status = 'failed' THEN NOW() END,
         started_at = CASE WHEN p_status = 'queued' THEN NULL ELSE started_at END
   WHERE id = p_item_id;

  IF v_refund > 0 THEN
    UPDATE public.user_credits
       SET credits = credits + v_refund, updated_at = NOW()
     WHERE user_id = p_user_id;
  END IF;
  RETURN v_refund;
END
$$;

-- Images left generating longer than any request can run (the function was stopped) are
-- failed and refunded. Called whenever a project is opened.
CREATE OR REPLACE FUNCTION public.playground_fail_stale_items(p_user_id UUID, p_older_than_seconds INTEGER DEFAULT 600)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  WITH stale AS (
    SELECT id, credits_charged FROM public.playground_items
     WHERE user_id = p_user_id
       AND status = 'generating'
       AND started_at < NOW() - p_older_than_seconds * INTERVAL '1 second'
     ORDER BY id
     FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.playground_items i
       SET status = 'failed', credits_charged = 0, finished_at = NOW(),
           error = 'This image took too long and was stopped. Your credits were refunded.'
      FROM stale
     WHERE i.id = stale.id
    RETURNING stale.credits_charged AS refunded
  )
  SELECT COALESCE(SUM(refunded), 0) INTO v_total FROM updated;

  IF v_total > 0 THEN
    UPDATE public.user_credits
       SET credits = credits + v_total, updated_at = NOW()
     WHERE user_id = p_user_id;
  END IF;
  RETURN v_total;
END
$$;

-- Atomic refund for the rest of the app (lib/server/usage.ts refundCreditsForUser), so
-- refunds that land at the same moment can no longer overwrite each other.
CREATE OR REPLACE FUNCTION public.refund_user_credits(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN TRUE;
  END IF;
  UPDATE public.user_credits
     SET credits = credits + p_amount, updated_at = NOW()
   WHERE user_id = p_user_id;
  RETURN FOUND;
END
$$;

-- Only the server may call these: Supabase grants new functions to anon and authenticated.
REVOKE ALL ON FUNCTION public.playground_claim_item(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.playground_release_item(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.playground_fail_stale_items(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_user_credits(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playground_claim_item(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.playground_release_item(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.playground_fail_stale_items(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_credits(UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
