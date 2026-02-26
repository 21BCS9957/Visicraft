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
  model TEXT,
  aspect_ratio TEXT,
  resolution TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE generations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS aspect_ratio TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS resolution TEXT;

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

-- ============================================
-- 4. VERIFICATION QUERIES
-- ============================================

-- Check tables
SELECT 'user_credits' as table_name, COUNT(*) as row_count FROM user_credits
UNION ALL
SELECT 'generations', COUNT(*) FROM generations;

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
