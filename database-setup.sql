-- Visicraft Database Setup
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. USER CREDITS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON user_credits;
DROP POLICY IF EXISTS "Service role can do everything" ON user_credits;

CREATE POLICY "Users can view their own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can do everything" ON user_credits
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-create credits for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits)
  VALUES (NEW.id, 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Atomic credit deduction (avoids race conditions). Call via supabase.rpc('deduct_credits', { p_user_id: uuid, p_amount: int }).
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  UPDATE public.user_credits
  SET credits = credits - p_amount::INTEGER,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND credits >= p_amount::INTEGER
  RETURNING credits INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;
  RETURN new_balance;
END;
$$;

-- ============================================
-- 2. GENERATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  reference_image_url TEXT NOT NULL,
  source_images_urls TEXT[] NOT NULL,
  generated_thumbnails TEXT[] NOT NULL,
  prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);

ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations" ON generations;
CREATE POLICY "Allow all operations" ON generations
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. STORAGE BUCKETS & POLICIES
-- ============================================

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for generated videos (Veo output)
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-videos', 'generated-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;

CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Allow public downloads" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'uploads');

CREATE POLICY "Allow authenticated deletes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Generated-videos: allow service role to upload, public read (video URLs)
DROP POLICY IF EXISTS "Allow public read generated-videos" ON storage.objects;
CREATE POLICY "Allow public read generated-videos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'generated-videos');
DROP POLICY IF EXISTS "Allow insert generated-videos" ON storage.objects;
CREATE POLICY "Allow insert generated-videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-videos');

-- ============================================
-- 4. VIDEO GENERATION JOBS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  source_image_url TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  model VARCHAR(50) DEFAULT 'veo-3.1',
  duration INTEGER DEFAULT 10,
  aspect_ratio VARCHAR(10) DEFAULT '16:9',
  style VARCHAR(50) DEFAULT 'cinematic',
  mood VARCHAR(50) DEFAULT 'energetic',
  operation_name TEXT,
  output_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_id ON video_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created_at ON video_generation_jobs(created_at DESC);

ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own video jobs" ON video_generation_jobs;
DROP POLICY IF EXISTS "Users can insert video jobs" ON video_generation_jobs;
DROP POLICY IF EXISTS "Service role can manage video jobs" ON video_generation_jobs;

CREATE POLICY "Users can view their own video jobs" ON video_generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert video jobs" ON video_generation_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage video jobs" ON video_generation_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 5. VERIFICATION QUERIES
-- ============================================

-- Check tables
SELECT 'user_credits' as table_name, COUNT(*) as row_count FROM user_credits
UNION ALL
SELECT 'generations', COUNT(*) FROM generations
UNION ALL
SELECT 'video_generation_jobs', COUNT(*) FROM video_generation_jobs;

-- Check your credits (replace with your email)
SELECT 
  u.email,
  uc.credits,
  uc.created_at,
  uc.updated_at
FROM user_credits uc
JOIN auth.users u ON uc.user_id = u.id
WHERE u.email = 'YOUR_EMAIL_HERE';

-- Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'uploads';
