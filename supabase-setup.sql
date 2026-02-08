-- YouTube Thumbnail Generator - Supabase Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Create the generations table
CREATE TABLE IF NOT EXISTS generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  reference_image_url TEXT NOT NULL,
  source_images_urls TEXT[] NOT NULL,
  generated_thumbnails TEXT[] NOT NULL,
  prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create an index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);

-- 3. Create an index on user_id if you plan to filter by user
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);

-- 4. Enable Row Level Security (optional, but recommended)
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- 5. Create a policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations for now" ON generations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: For production, you should create more restrictive policies based on user authentication

-- Verify the table was created
SELECT * FROM generations LIMIT 1;
