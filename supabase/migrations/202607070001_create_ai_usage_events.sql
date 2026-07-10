CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider = 'google'),
  billing_source TEXT NOT NULL CHECK (billing_source IN ('gemini_developer_api', 'vertex_ai')),
  provider_request_id TEXT,
  model TEXT NOT NULL,
  model_version TEXT,
  feature TEXT NOT NULL CHECK (feature IN ('image_generation', 'video_generation')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  video_seconds NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (video_seconds >= 0),
  requested_video_seconds NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (requested_video_seconds >= 0),
  output_count INTEGER NOT NULL DEFAULT 1 CHECK (output_count >= 0),
  resolution TEXT,
  input_cost_usd NUMERIC(20,10) NOT NULL DEFAULT 0 CHECK (input_cost_usd >= 0),
  output_cost_usd NUMERIC(20,10) NOT NULL DEFAULT 0 CHECK (output_cost_usd >= 0),
  media_cost_usd NUMERIC(20,10) NOT NULL DEFAULT 0 CHECK (media_cost_usd >= 0),
  estimated_cost_usd NUMERIC(20,10) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  actual_cost_usd NUMERIC(20,10),
  pricing_version TEXT NOT NULL,
  pricing_source TEXT NOT NULL,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_provider_request
  ON public.ai_usage_events(provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON public.ai_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created
  ON public.ai_usage_events(model, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own AI usage" ON public.ai_usage_events;
CREATE POLICY "Users can view their own AI usage" ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages AI usage" ON public.ai_usage_events;
CREATE POLICY "Service role manages AI usage" ON public.ai_usage_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON COLUMN public.ai_usage_events.estimated_cost_usd IS
  'Exact request cost from the stored Google price snapshot; reconcile to actual_cost_usd for invoice-level discounts, credits, tax, or rounding.';
COMMENT ON COLUMN public.ai_usage_events.actual_cost_usd IS
  'Final cost imported from Cloud Billing export when provider data can be reconciled.';
