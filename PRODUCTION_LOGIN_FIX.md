# Production Login Issue - Fix Guide

## Issue
Users unable to log in from different accounts in production (Vercel).

## Root Causes
1. Cookie settings not optimized for production
2. Missing error handling in auth callback
3. Supabase redirect URLs not properly configured

## Fixes Applied

### 1. Enhanced Auth Callback (`app/auth/callback/route.ts`)
- Added error handling for failed auth exchanges
- Added logging for debugging
- Added support for `next` parameter for custom redirects
- Proper error redirects to login page

### 2. Improved Cookie Settings (`lib/supabase/server.ts`)
- Set `sameSite: 'lax'` for better cross-site compatibility
- Set `secure: true` in production
- Set `path: '/'` to ensure cookies work across all routes
- Added error logging for cookie issues

### 3. Better Redirect Handling
- Auth callback now respects `next` parameter
- Fallback to home page if no redirect specified
- Error states redirect back to login with error message

## Verification Steps

### 1. Check Supabase Configuration

In Supabase Dashboard → Authentication → URL Configuration:

**Add these redirect URLs:**
```
https://visicraft-eta.vercel.app/auth/callback
https://visicraft-eta.vercel.app
http://localhost:3000/auth/callback
http://localhost:3000
```

### 2. Check Vercel Environment Variables

Ensure these are set:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SITE_URL=https://visicraft-eta.vercel.app
```

### 3. Check Google OAuth Configuration

In Google Cloud Console → APIs & Services → Credentials:

**Authorized redirect URIs:**
```
https://your-project.supabase.co/auth/v1/callback
```

**Authorized JavaScript origins:**
```
https://visicraft-eta.vercel.app
http://localhost:3000
```

## Testing

### Test Different Scenarios:

1. **New User Login**
   - Clear browser cookies
   - Go to production site
   - Click "Sign in with Google"
   - Select account
   - Should redirect to home page
   - Check navbar shows user info

2. **Existing User Login**
   - Sign out
   - Sign in again with same account
   - Should work without issues

3. **Switch Accounts**
   - Sign out
   - Sign in with different Google account
   - Should work without issues
   - Credits should be separate per account

4. **Cross-Browser Test**
   - Test in Chrome, Firefox, Safari
   - Test in incognito/private mode
   - Should work in all browsers

## Common Issues & Solutions

### Issue: "Auth callback error"
**Solution**: Check Vercel logs for specific error message
```bash
vercel logs --follow
```

### Issue: Stuck on login page
**Solution**: 
1. Clear browser cookies
2. Check browser console for errors
3. Verify redirect URLs in Supabase

### Issue: "Invalid redirect URL"
**Solution**: Add production URL to Supabase redirect URLs

### Issue: Works locally but not in production
**Solution**:
1. Verify `NEXT_PUBLIC_SITE_URL` is set in Vercel
2. Check all environment variables are in production
3. Redeploy after adding variables

## Debugging

### Check Browser Console
Look for:
- `🔐 Attempting Google sign-in with redirect:`
- Any error messages
- Network tab for failed requests

### Check Vercel Logs
```bash
vercel logs --follow
```

Look for:
- `✅ Auth successful, redirecting to:`
- `Auth callback error:`
- Cookie-related errors

### Check Supabase Logs
In Supabase Dashboard → Logs:
- Look for auth events
- Check for failed login attempts
- Verify user creation

## Prevention

### Best Practices:
1. Always test auth in production before launch
2. Test with multiple accounts
3. Test in different browsers
4. Monitor Vercel logs for auth errors
5. Keep Supabase SDK updated

## Rollback Plan

If issues persist:
1. Check if old code worked: `git log --oneline`
2. Revert changes: `git revert <commit-hash>`
3. Redeploy to Vercel
4. Contact support with logs

## Support

If issues continue:
1. Share Vercel logs
2. Share browser console errors
3. Share Supabase logs
4. Provide steps to reproduce

---

**Last Updated**: 2026-02-09
**Status**: Fixed and deployed
