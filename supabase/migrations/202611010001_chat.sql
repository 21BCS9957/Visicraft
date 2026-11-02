-- Chat (/chat): ChatGPT-style image chats. Projects hold chats and the instructions sent with
-- every chat in them; each chat keeps its messages (text, attached images, generated images)
-- and the OpenAI response it continues from, so a follow-up ("make it blue") edits the last image.
-- Owners read their own rows; only the server writes.
-- Run it in the Supabase SQL Editor; it is safe to run again.

CREATE TABLE IF NOT EXISTS public.chat_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  instructions TEXT NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_projects_user ON public.chat_projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Deleting a project deletes its chats, as in ChatGPT.
  project_id UUID REFERENCES public.chat_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat' CHECK (char_length(title) BETWEEN 1 AND 120),
  -- The OpenAI response the next message continues from (multi-turn editing).
  last_response_id TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON public.chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON public.chat_threads(project_id, updated_at DESC) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),
  -- [{ url, name, width, height }]: images the user attached.
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ url, previewUrl, width, height, model, quality, revisedPrompt, upscaled }]: images the reply made.
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'generating', 'failed', 'stopped')),
  error TEXT,
  response_id TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON public.chat_messages(thread_id, created_at);

ALTER TABLE public.chat_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read chat projects" ON public.chat_projects;
CREATE POLICY "Owners read chat projects" ON public.chat_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages chat projects" ON public.chat_projects;
CREATE POLICY "Service role manages chat projects" ON public.chat_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read chat threads" ON public.chat_threads;
CREATE POLICY "Owners read chat threads" ON public.chat_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages chat threads" ON public.chat_threads;
CREATE POLICY "Service role manages chat threads" ON public.chat_threads FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read chat messages" ON public.chat_messages;
CREATE POLICY "Owners read chat messages" ON public.chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages chat messages" ON public.chat_messages;
CREATE POLICY "Service role manages chat messages" ON public.chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
