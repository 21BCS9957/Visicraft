-- User Credits Table Setup
-- Run this in your Supabase SQL Editor

-- 1. Create the user_credits table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- 3. Enable Row Level Security
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON user_credits;
DROP POLICY IF EXISTS "Service role can do everything" ON user_credits;

-- 5. Create RLS policies

-- Allow users to view their own credits
CREATE POLICY "Users can view their own credits" ON user_credits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to update their own credits (for client-side operations)
CREATE POLICY "Users can update their own credits" ON user_credits
  FOR UPDATE
  USING (auth.uid() = user_id);

-- IMPORTANT: Allow service role (backend) to do everything
-- This is needed for payment verification to work
CREATE POLICY "Service role can do everything" ON user_credits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Create a function to automatically create credits for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits)
  VALUES (NEW.id, 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create a trigger to call the function when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 8. Verify the table was created
SELECT * FROM user_credits LIMIT 5;

-- 9. Check if your user has credits (replace with your email)
SELECT 
  u.email,
  uc.credits,
  uc.created_at,
  uc.updated_at
FROM user_credits uc
JOIN auth.users u ON uc.user_id = u.id
WHERE u.email = 'YOUR_EMAIL_HERE';  -- Replace with your email

-- 10. If you don't have credits yet, add them manually
-- INSERT INTO user_credits (user_id, credits)
-- SELECT id, 100 FROM auth.users WHERE email = 'YOUR_EMAIL_HERE'
-- ON CONFLICT (user_id) DO UPDATE SET credits = 100;
