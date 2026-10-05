-- Playground runs remember the quality level of OpenAI image models (High, Extra-high, Max).
-- Gemini runs leave it empty. Run it in the Supabase SQL Editor; it is safe to run again.

ALTER TABLE public.playground_runs ADD COLUMN IF NOT EXISTS quality TEXT;
ALTER TABLE public.playground_runs DROP CONSTRAINT IF EXISTS playground_runs_quality_check;
ALTER TABLE public.playground_runs
  ADD CONSTRAINT playground_runs_quality_check CHECK (quality IS NULL OR quality IN ('high', 'xhigh', 'max'));

NOTIFY pgrst, 'reload schema';
