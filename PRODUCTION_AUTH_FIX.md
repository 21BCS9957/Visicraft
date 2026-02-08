# Production Authentication Fix Guide

## Issue
Google Sign-In is not working in production (Vercel deployment).

## Root Cause
Supabase needs to have your production URL whitelisted in the redirect URLs.

## Solution Steps

### 1. Get Your Production URL
Your Vercel production URL is likely something like:
- `https://visicraft.vercel.app` or
- `https://your-custom-domain.com`

### 2. Configure Supabase Redirect URLs

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**
4. Add the following URLs to **Redirect URLs**:

```
https://your-production-url.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

Replace `your-production-url.vercel.app` with your actual Vercel URL.

### 3. Configure Site URL

In the same **URL Configuration** section:
- Set **Site URL** to: `https://your-production-url.vercel.app`

### 4. Configure Google OAuth Provider

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Google** provider
3. Make sure it's enabled
4. Verify your Google OAuth credentials are correct

### 5. Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, add:

```
https://your-supabase-project.supabase.co/auth/v1/callback
```

Replace `your-supabase-project` with your actual Supabase project reference.

### 6. Verify Environment Variables on Vercel

1. Go to your Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Verify these variables are set:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 7. Redeploy

After making these changes:
1. Go to Vercel Dashboard
2. Go to **Deployments**
3. Click on the latest deployment
4. Click **Redeploy**

## Testing

1. Visit your production URL
2. Click "Continue with Google"
3. You should be redirected to Google sign-in
4. After signing in, you should be redirected back to your app

## Common Issues

### Issue: "Invalid redirect URL"
**Solution**: Make sure the exact URL (including `/auth/callback`) is added to Supabase redirect URLs.

### Issue: "OAuth error"
**Solution**: Verify Google OAuth credentials in Supabase match those in Google Cloud Console.

### Issue: "Redirect loop"
**Solution**: Clear browser cookies and try again. Also check that Site URL in Supabase matches your production URL.

## Debug Mode

To see detailed error messages, check:
1. Browser Console (F12)
2. Vercel Function Logs (in Vercel Dashboard)
3. Supabase Logs (in Supabase Dashboard → Logs)

## Need Help?

If you're still having issues:
1. Check Supabase logs for authentication errors
2. Verify all URLs match exactly (no trailing slashes)
3. Make sure Google OAuth is enabled in Supabase
4. Confirm your Google Cloud project has the OAuth consent screen configured
