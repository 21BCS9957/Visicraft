# How to Get Supabase Service Role Key

## ⚠️ CRITICAL: This is the issue preventing credits from being added!

The payment verification needs the **Service Role Key** to bypass Row Level Security (RLS) and add credits to your account.

## Steps to Get the Key:

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Select your project: `zzbdfzwkvogegqdyblre`

2. **Navigate to API Settings**
   - Click **Settings** (gear icon in sidebar)
   - Click **API**

3. **Find Service Role Key**
   - Scroll down to **Project API keys**
   - You'll see two keys:
     - `anon` `public` - Already configured ✅
     - `service_role` `secret` - **THIS IS WHAT YOU NEED** ⚠️
   
4. **Copy the Service Role Key**
   - Click the eye icon to reveal the key
   - Copy the entire key (starts with `eyJ...`)

5. **Add to Environment Variables**

   ### Local (.env.local)
   ```env
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   ### Production (Vercel)
   1. Go to Vercel Dashboard
   2. Your Project → Settings → Environment Variables
   3. Add new variable:
      - **Name**: `SUPABASE_SERVICE_ROLE_KEY`
      - **Value**: Your service role key
      - **Environment**: Production, Preview, Development
   4. **Redeploy** your app

## Why This is Needed

- **Anon Key**: Used by frontend, respects RLS policies
- **Service Role Key**: Used by backend, bypasses RLS for admin operations

Payment verification is a backend operation that needs to:
1. Read any user's credits
2. Update any user's credits
3. Bypass RLS policies

Without the service role key, the backend can't add credits!

## Security Notes

⚠️ **NEVER expose the service role key to the frontend!**
- Only use in backend API routes
- Never commit to git
- Only add to environment variables
- This key has full database access

## After Adding the Key

1. Restart your local dev server
2. Redeploy on Vercel
3. Test the ₹1 payment again
4. Credits should now be added successfully! ✅

## Troubleshooting

If you still get errors after adding the key:

1. **Check the key is correct**
   - Should start with `eyJ`
   - Should be very long (hundreds of characters)
   - No extra spaces or newlines

2. **Check Vercel deployment**
   - Environment variable is added
   - Redeployed after adding
   - Check Vercel logs for errors

3. **Check Supabase**
   - Run `setup-user-credits.sql` to create the table
   - Verify RLS policies are set up correctly
