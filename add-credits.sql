-- Add 1000 credits to your account for testing
-- Replace 'YOUR_USER_ID' with your actual user ID from the auth.users table

-- First, let's see your current credits
SELECT id, email, credits FROM user_credits 
JOIN auth.users ON user_credits.user_id = auth.users.id;

-- Update credits for your user (replace the email with yours)
UPDATE user_credits 
SET credits = credits + 1000,
    updated_at = NOW()
WHERE user_id = (
  SELECT id FROM auth.users 
  WHERE email = 'YOUR_EMAIL_HERE'  -- Replace with your actual email
);

-- Verify the update
SELECT id, email, credits FROM user_credits 
JOIN auth.users ON user_credits.user_id = auth.users.id;
