-- Playground Library (your images and guideline documents, reusable in any project) and
-- project Guidelines as Markdown (the old brief, now up to 50,000 characters).
-- Run it in the Supabase SQL Editor; it is safe to run again.

CREATE TABLE IF NOT EXISTS public.playground_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  name TEXT NOT NULL DEFAULT '' CHECK (char_length(name) <= 160),
  -- Images: a file in our storage. Documents: the Markdown itself.
  url TEXT,
  content TEXT CHECK (content IS NULL OR char_length(content) <= 50000),
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  size_bytes INTEGER,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'generated', 'project')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT playground_library_has_payload CHECK (
    (kind = 'image' AND url IS NOT NULL) OR (kind = 'document' AND content IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_playground_library_user
  ON public.playground_library(user_id, kind, created_at DESC);

ALTER TABLE public.playground_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their library" ON public.playground_library;
CREATE POLICY "Owners read their library" ON public.playground_library
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages the library" ON public.playground_library;
CREATE POLICY "Service role manages the library" ON public.playground_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Guidelines: the project brief becomes a Markdown document of up to 50,000 characters,
-- with the name of the file it was uploaded from.
ALTER TABLE public.playground_projects DROP CONSTRAINT IF EXISTS playground_projects_brief_check;
ALTER TABLE public.playground_projects
  ADD CONSTRAINT playground_projects_brief_check CHECK (char_length(brief) <= 50000);
ALTER TABLE public.playground_projects ADD COLUMN IF NOT EXISTS brief_name TEXT;

NOTIFY pgrst, 'reload schema';
