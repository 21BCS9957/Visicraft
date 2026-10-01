-- Video projects: the Playground's projects become either image projects (the default,
-- so every existing project stays one) or video projects for the Video Studio. A video
-- project keeps its product and last settings in `settings`, its guidelines in `brief`,
-- and its videos point back to it through `usage_logs.metadata->>'projectId'`.
-- Run it in the Supabase SQL Editor; it is safe to run again.

ALTER TABLE public.playground_projects ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE public.playground_projects DROP CONSTRAINT IF EXISTS playground_projects_kind_check;
ALTER TABLE public.playground_projects
  ADD CONSTRAINT playground_projects_kind_check CHECK (kind IN ('image', 'video'));

CREATE INDEX IF NOT EXISTS idx_playground_projects_user_kind
  ON public.playground_projects(user_id, kind, updated_at DESC);

-- A project's videos, found by the project id on their usage rows.
CREATE INDEX IF NOT EXISTS idx_usage_logs_video_project
  ON public.usage_logs(user_id, ((metadata->>'projectId')), created_at DESC)
  WHERE feature = 'video_generation';

NOTIFY pgrst, 'reload schema';
