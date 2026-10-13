-- Verified faces for videos (BytePlus ModelArk real-person portrait library).
--
-- Seedance 2.x refuses a real person's face in an uploaded image. A person who agrees to be in
-- videos scans their own face once (a liveness check on their phone), which gives a portrait
-- group; photos of them added to the group become assets Seedance 2.x accepts as
-- asset://<id>. The rows are written by the server (service role); each user reads their own.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS public.video_faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'verifying' CHECK (status IN ('verifying', 'verified', 'failed', 'expired')),
  -- The scan: BytePlus's one-time link and its token (30 minutes), then the portrait group.
  scan_token text,
  scan_link text,
  scan_expires_at timestamptz,
  group_id text,
  -- When the uploader confirmed the person agreed to appear in AI videos.
  consent_at timestamptz NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_faces_user_idx ON public.video_faces (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_face_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  face_id uuid NOT NULL REFERENCES public.video_faces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- BytePlus's asset id (its URL expires; the id is what videos send).
  asset_id text,
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'active', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_face_photos_face_idx ON public.video_face_photos (face_id, created_at);

ALTER TABLE public.video_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_face_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own faces" ON public.video_faces;
CREATE POLICY "Users can view their own faces" ON public.video_faces
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own face photos" ON public.video_face_photos;
CREATE POLICY "Users can view their own face photos" ON public.video_face_photos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
