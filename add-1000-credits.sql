-- Quick script to add 1000 credits to your account
-- Run this in your Supabase SQL Editor

-- STEP 1: First, see all users and their current credits
SELECT 
  u.email,
  u.id as user_id,
  COALESCE(uc.credits, 0) as current_credits,
  u.created_at as user_created
FROM auth.users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
ORDER BY u.created_at DESC;

-- STEP 2: Copy your email from the results above, then run ONE of these:

-- Option A: Add credits to a specific user by email (RECOMMENDED)
-- Replace 'your@email.com' with YOUR actual email from Step 1
/*
INSERT INTO user_credits (user_id, credits)
SELECT id, 1000 FROM auth.users WHERE email = 'your@email.com'
ON CONFLICT (user_id) DO UPDATE SET credits = user_credits.credits + 1000;
*/

-- Option B: Add credits to ALL users (if you only have one account, this is fine)
/*
INSERT INTO user_credits (user_id, credits)
SELECT id, 1000 FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET credits = user_credits.credits + 1000;
*/

-- STEP 3: Verify the credits were added
SELECT 
  u.email,
  uc.credits,
  uc.updated_at
FROM user_credits uc
JOIN auth.users u ON uc.user_id = u.id
ORDER BY uc.updated_at DESC;
