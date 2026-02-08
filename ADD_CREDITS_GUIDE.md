# How to Add Credits for Testing

You have several options to add credits to your account:

## Option 1: Using Supabase SQL Editor (Easiest) ⭐

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste this SQL:

```sql
-- Add 1000 credits to all users
INSERT INTO user_credits (user_id, credits)
SELECT id, 1000 FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET credits = user_credits.credits + 1000;

-- Check the results
SELECT 
  u.email,
  uc.credits,
  uc.updated_at
FROM user_credits uc
JOIN auth.users u ON uc.user_id = u.id;
```

6. Click "Run" (or press Cmd/Ctrl + Enter)
7. You should see your email and new credit balance!

## Option 2: Using the Node.js Script

If you're already logged into the app:

```bash
cd thumbnail-generator
node scripts/setup-test-credits.js
```

This will:
- Detect your logged-in session
- Add 1000 credits to your account
- Show your new balance

## Option 3: Manual SQL with Your Email

If you know your email, run this in Supabase SQL Editor:

```sql
-- Replace 'your@email.com' with your actual email
UPDATE user_credits 
SET credits = credits + 1000
WHERE user_id = (
  SELECT id FROM auth.users 
  WHERE email = 'your@email.com'
);

-- Verify
SELECT 
  u.email,
  uc.credits
FROM user_credits uc
JOIN auth.users u ON uc.user_id = u.id
WHERE u.email = 'your@email.com';
```

## Option 4: Temporary - Reduce Credit Costs

For quick testing, you can temporarily reduce credit costs in the code:

Edit `lib/credits/calculator.ts` and change:

```typescript
// Temporary testing values
const CREDIT_COSTS: Record<string, Record<string, number>> = {
  'gemini-2-flash': { '720p': 1, '1080p': 1, '2K': 1, '4K': 1 },
  'gemini-3-pro': { '720p': 1, '1080p': 1, '2K': 1, '4K': 1 },
  'banana-pro': { '720p': 1, '1080p': 1, '2K': 1, '4K': 1 },
};
```

This makes each generation cost only 1 credit instead of 20-70.

**Remember to change it back before production!**

## Troubleshooting

### "No users found in user_credits table"

This means you haven't logged in yet. Steps:

1. Start your dev server: `npm run dev`
2. Go to http://localhost:3000/login
3. Log in with Google
4. The trigger should automatically create your credits entry with 100 credits
5. Then run Option 1 or 2 above to add more

### "Error: relation 'user_credits' does not exist"

You need to create the credits table first:

```bash
cd thumbnail-generator
node scripts/setup-database.js
```

Or run the SQL from `create-credits-table.sql` in Supabase SQL Editor.

## Quick Reference

- **Default credits for new users**: 100
- **Credit costs**:
  - Gemini 2 Flash: 20-50 credits
  - Gemini 3 Pro: 30-60 credits  
  - Banana Pro: 35-70 credits
- **Recommended testing amount**: 1000 credits (enough for 20-50 generations)

## Files Created

- `add-1000-credits.sql` - Direct SQL to add credits
- `scripts/add-test-credits.js` - Auto-add to first user
- `scripts/setup-test-credits.js` - Add to logged-in user
- `scripts/add-credits.js` - Add to specific user by email

Choose whichever method works best for you! 🚀
