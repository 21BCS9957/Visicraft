-- Library videos (reference videos whose shots a new video copies, and videos saved from the
-- Video Studio) and folders in every Library tab.
-- Run it in the Supabase SQL Editor; it is safe to run again.

-- Folders: one list per tab (images, guideline docs, videos). Removing a folder only un-files
-- its items; it never deletes them.
CREATE TABLE IF NOT EXISTS public.playground_library_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document', 'video')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playground_library_folders_name
  ON public.playground_library_folders(user_id, kind, lower(name));

ALTER TABLE public.playground_library_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their library folders" ON public.playground_library_folders;
CREATE POLICY "Owners read their library folders" ON public.playground_library_folders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages library folders" ON public.playground_library_folders;
CREATE POLICY "Service role manages library folders" ON public.playground_library_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Videos join images and documents. A video is a file in our storage, like an image.
ALTER TABLE public.playground_library DROP CONSTRAINT IF EXISTS playground_library_kind_check;
ALTER TABLE public.playground_library
  ADD CONSTRAINT playground_library_kind_check CHECK (kind IN ('image', 'document', 'video'));
ALTER TABLE public.playground_library DROP CONSTRAINT IF EXISTS playground_library_has_payload;
ALTER TABLE public.playground_library
  ADD CONSTRAINT playground_library_has_payload CHECK (
    (kind IN ('image', 'video') AND url IS NOT NULL) OR (kind = 'document' AND content IS NOT NULL)
  );

ALTER TABLE public.playground_library
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.playground_library_folders(id) ON DELETE SET NULL;
-- Videos: a still for the tile, the length, the frames taken in the browser at upload
-- ([{ "url": "...", "t": 2.5 }], t in seconds) and what Gemini saw when it watched it.
ALTER TABLE public.playground_library ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE public.playground_library ADD COLUMN IF NOT EXISTS duration_seconds REAL;
ALTER TABLE public.playground_library ADD COLUMN IF NOT EXISTS frames JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.playground_library ADD COLUMN IF NOT EXISTS analysis JSONB;

CREATE INDEX IF NOT EXISTS idx_playground_library_folder
  ON public.playground_library(user_id, folder_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
