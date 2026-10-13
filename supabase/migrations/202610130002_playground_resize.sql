-- Make another size: a run can turn finished images into another shape. Each of its images
-- points at its original (parent_item_id); the run remembers how they are made (Extend, Remake
-- or Fit), so the queue knows what to do with every image. Fit makes no AI call and is free.
-- Run it in the Supabase SQL Editor; it is safe to run again.

ALTER TABLE public.playground_runs ADD COLUMN IF NOT EXISTS resize JSONB;
ALTER TABLE public.playground_runs DROP CONSTRAINT IF EXISTS playground_runs_resize_check;
ALTER TABLE public.playground_runs ADD CONSTRAINT playground_runs_resize_check CHECK (
  resize IS NULL
  OR resize->>'method' IN ('extend', 'remake')
  OR (resize->>'method' = 'fit' AND credits_per_image = 0)
);

-- Finding an image's other sizes, and deleting an original (its copies' link is cleared), stay fast.
CREATE INDEX IF NOT EXISTS idx_playground_items_parent
  ON public.playground_items(parent_item_id) WHERE parent_item_id IS NOT NULL;

-- The claim from 202609300001, except that a free image (Fit) starts whatever the balance:
-- only a priced image locks, checks and charges the user's credits.
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

  IF v_cost > 0 THEN
    SELECT credits INTO v_balance FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
    IF v_balance IS NULL OR v_balance < v_cost THEN
      RETURN jsonb_build_object('result', 'insufficient_credits', 'needed', v_cost, 'balance', COALESCE(v_balance, 0));
    END IF;
    UPDATE public.user_credits
       SET credits = credits - v_cost, updated_at = NOW()
     WHERE user_id = p_user_id;
  END IF;

  UPDATE public.playground_items
     SET status = 'generating', credits_charged = v_cost, attempts = attempts + 1,
         started_at = NOW(), finished_at = NULL, error = NULL
   WHERE id = p_item_id;

  RETURN jsonb_build_object('result', 'claimed', 'credits', v_cost, 'balance', COALESCE(v_balance - v_cost, 0));
END
$$;

-- Only the server may call it (Supabase grants new functions to anon and authenticated).
REVOKE ALL ON FUNCTION public.playground_claim_item(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playground_claim_item(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
