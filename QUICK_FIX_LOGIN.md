# Quick Fix for Login Issue

## Problem
Error: "Database error saving new user" - The trigger to create user credits is failing.

## Immediate Solution (Choose One)

### Option 1: Fix the Trigger (Recommended)

Run this in Supabase SQL Editor:

```sql
-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function with error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits)
  VALUES (NEW.id, 100)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create credits for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### Option 2: Disable Trigger Temporarily

If Option 1 doesn't work, disable the trigger:

```sql
-- Disable the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
```

Then users can sign in, and credits will be created automatically by the CreditsContext when they first load the app.

## Verification Steps

1. **Check if trigger exists:**
```sql
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

2. **Check user_credits table:**
```sql
SELECT * FROM user_credits LIMIT 5;
```

3. **Test login:**
   - Clear browser cookies
   - Go to production site
   - Try to sign in
   - Should work without errors

## Why This Happened

The trigger was trying to insert into `user_credits` but:
1. Table might not exist
2. RLS policies might be blocking
3. Function might have syntax error

## Prevention

The new function has:
- `ON CONFLICT DO NOTHING` - prevents duplicate errors
- `EXCEPTION` handler - doesn't fail user creation if credits fail
- `SECURITY DEFINER` - runs with function owner's permissions

## If Still Not Working

### Check Table Exists
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'user_credits';
```

### Check RLS Policies
```sql
SELECT * FROM pg_policies WHERE tablename = 'user_credits';
```

### Manual Credit Creation
If a user signed in but has no credits:
```sql
INSERT INTO user_credits (user_id, credits)
SELECT id, 100 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits);
```

## Current Status

The CreditsContext already handles missing credits:
- Checks if user has credits
- Creates entry with 100 credits if missing
- This is a backup to the trigger

So even if trigger fails, users will get credits on first app load.

## Next Steps

1. Run Option 1 SQL in Supabase
2. Test login in incognito mode
3. Check Supabase logs for any errors
4. Verify credits are created

---

**File**: `fix-user-creation-trigger.sql` contains the complete fix.
