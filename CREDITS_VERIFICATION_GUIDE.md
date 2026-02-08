# Credits System Verification Guide

## Issue: New Accounts Showing 0 Credits

If new accounts are showing 0 credits instead of 100, follow these steps:

## Step 1: Verify Database Setup

### Check if the table exists:
```sql
SELECT * FROM user_credits LIMIT 5;
```

### Check if the trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

### Check if the function exists:
```sql
SELECT proname FROM pg_proc WHERE proname = 'create_user_credits';
```

## Step 2: Run the SQL Setup (If Not Done)

Go to Supabase Dashboard → SQL Editor → New Query, then paste and run:

```sql
-- This is the content from create-credits-table.sql
-- Run this if you haven't already
```

Or use the file: `create-credits-table.sql`

## Step 3: Add Credits to Existing Users

If you have existing users without credits, run this:

```sql
-- Give 100 credits to all existing users who don't have credits yet
INSERT INTO user_credits (user_id, credits)
SELECT id, 100 
FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM user_credits);
```

## Step 4: Test New User Signup

### Method 1: Create a Test User
1. Sign out of your current account
2. Sign up with a new email (use a temp email service)
3. After signup, check the console logs:
   ```
   🔄 Fetching credits for user: xxx-xxx-xxx
   ✅ Credits fetched successfully: 100
   ```
4. Check the navbar - should show "100 credits"

### Method 2: Check Database Directly
```sql
-- Check credits for a specific user
SELECT u.email, uc.credits, uc.created_at
FROM auth.users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.email = 'your-test-email@example.com';
```

## Step 5: Verify Console Logs

With the updated code, you should see detailed logs:

### On Login/Page Load:
```
🔄 Fetching credits for user: abc-123-def-456
✅ Credits fetched successfully: 100
```

### If User Doesn't Have Credits (Auto-Create):
```
🔄 Fetching credits for user: abc-123-def-456
⚠️ Credits fetch error: PGRST116 No rows found
🎁 Creating new user credits entry with 100 free credits...
✅ Credits created successfully: 100
```

### When Deducting Credits:
```
💳 Deducting credits: { amount: 30, oldBalance: 100, newBalance: 70 }
✅ Credits deducted successfully
```

## Step 6: Common Issues & Solutions

### Issue 1: Trigger Not Working
**Symptom**: New users don't automatically get credits

**Solution**: Manually run the trigger creation:
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_credits();
```

### Issue 2: RLS Policies Blocking Insert
**Symptom**: Error when trying to create credits

**Solution**: Check RLS policies:
```sql
-- Make sure this policy exists
CREATE POLICY "System can insert credits"
  ON user_credits
  FOR INSERT
  WITH CHECK (true);
```

### Issue 3: Credits Show 0 Even After Creation
**Symptom**: Console shows credits created but UI shows 0

**Solution**: 
1. Check if CreditsProvider is wrapping your app in `layout.tsx`
2. Refresh the page to trigger `refreshCredits()`
3. Check browser console for errors

### Issue 4: Database Permissions
**Symptom**: "permission denied" errors

**Solution**: Make sure your Supabase service role key is correct in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Step 7: Manual Credit Management

### Check a User's Credits:
```sql
SELECT u.email, uc.credits
FROM auth.users u
JOIN user_credits uc ON u.id = uc.user_id
WHERE u.email = 'user@example.com';
```

### Add Credits to a User:
```sql
UPDATE user_credits
SET credits = credits + 100
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```

### Reset All Users to 100 Credits:
```sql
UPDATE user_credits SET credits = 100;
```

### Delete and Recreate Credits Table:
```sql
DROP TABLE IF EXISTS user_credits CASCADE;
-- Then run create-credits-table.sql again
```

## Step 8: Verify Credit Deduction

1. **Check Initial Balance**: Should show 100 credits in navbar
2. **Select Model + Resolution**: e.g., Gemini 3 Pro + 2K = 50 credits
3. **Run Generation**: Click "Run This Node"
4. **Check Console**:
   ```
   💳 Deducting credits: { amount: 50, oldBalance: 100, newBalance: 50 }
   ✅ Credits deducted successfully
   ```
5. **Check Navbar**: Should now show 50 credits

## Step 9: Test Insufficient Credits

1. **Use up most credits**: Run generations until you have < 30 credits
2. **Try expensive generation**: Select Banana Pro + 4K (70 credits)
3. **Should see**:
   - Red warning box: "Insufficient Credits"
   - Disabled "Run This Node" button
   - Error message: "You need X more credits"

## Step 10: Verify Credit Costs

Test each combination to ensure correct costs:

| Model | 720p | 1080p | 2K | 4K |
|-------|------|-------|----|----|
| Gemini 2 Flash ⚡ | 20 | 30 | 40 | 50 |
| Gemini 3 Pro 🍌 | 30 | 40 | 50 | 60 |
| Banana Pro 👑 | 35 | 45 | 50 | 70 |

## Debugging Checklist

- [ ] `create-credits-table.sql` has been run in Supabase
- [ ] Trigger `on_auth_user_created` exists
- [ ] Function `create_user_credits` exists
- [ ] RLS policies are enabled and correct
- [ ] CreditsProvider wraps the app in `layout.tsx`
- [ ] Console shows credit fetch logs
- [ ] Navbar displays credit count
- [ ] New users automatically get 100 credits
- [ ] Credit deduction works correctly
- [ ] Insufficient credits warning shows
- [ ] Different model/resolution combinations cost different amounts

## Expected Behavior

### ✅ Correct Behavior:
1. New user signs up → Automatically gets 100 credits
2. User logs in → Credits load from database
3. User selects model + resolution → Credit cost updates
4. User runs generation → Credits deducted
5. Insufficient credits → Button disabled, warning shown
6. Credits refresh → Navbar updates in real-time

### ❌ Incorrect Behavior:
1. New user shows 0 credits → Database trigger not working
2. Credits don't update after generation → Deduction function failing
3. All generations cost the same → Credit calculator not working
4. Can run with 0 credits → Validation not working

## Need Help?

If you're still seeing issues:

1. **Check Supabase Logs**: Dashboard → Logs → Check for errors
2. **Check Browser Console**: Look for red error messages
3. **Check Network Tab**: See if API calls are failing
4. **Verify Environment Variables**: Make sure `.env.local` is correct
5. **Restart Dev Server**: Sometimes needed after env changes

## Quick Test Script

Run this in Supabase SQL Editor to verify everything:

```sql
-- 1. Check if table exists
SELECT COUNT(*) as user_count, SUM(credits) as total_credits 
FROM user_credits;

-- 2. Check if trigger exists
SELECT tgname, tgenabled FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

-- 3. Check users without credits
SELECT u.email, u.created_at
FROM auth.users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE uc.user_id IS NULL;

-- 4. If users without credits exist, add them:
INSERT INTO user_credits (user_id, credits)
SELECT id, 100 
FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM user_credits);
```

## Summary

The credits system should now:
- ✅ Automatically give 100 credits to new users
- ✅ Show credit balance in navbar
- ✅ Calculate costs based on model + resolution
- ✅ Deduct credits on generation
- ✅ Prevent generation with insufficient credits
- ✅ Log all credit operations for debugging

Check the console logs to see exactly what's happening!
