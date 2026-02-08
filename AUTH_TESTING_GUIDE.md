# Authentication Testing Guide

Complete guide to test the Google authentication implementation in Visicraft.

## 🎯 What Was Implemented

### Authentication Features

✅ **Google OAuth Sign In**
- Secure authentication via Supabase
- OAuth flow with Google
- Session management
- User profile data (name, email, avatar)

✅ **Protected Routes**
- Middleware protection for `/workflow`, `/generate`, `/history`
- Automatic redirect to login for unauthenticated users
- Redirect back to original page after login

✅ **User Interface**
- Beautiful login page with animations
- Sign In button in navbar (when logged out)
- User avatar dropdown menu (when logged in)
- Sign Out functionality

✅ **Session Management**
- Automatic session refresh
- Persistent authentication across page reloads
- Auth state listener for real-time updates

## 📁 Files Created/Modified

### New Files
- `lib/supabase/auth.ts` - Authentication helper functions
- `lib/contexts/AuthContext.tsx` - React context for auth state
- `app/auth/callback/route.ts` - OAuth callback handler
- `app/login/page.tsx` - Login page with Google sign-in
- `middleware.ts` - Protected route middleware
- `GOOGLE_AUTH_SETUP.md` - Setup instructions
- `AUTH_TESTING_GUIDE.md` - This file

### Modified Files
- `app/layout.tsx` - Added AuthProvider and Toaster
- `components/shared/navbar.tsx` - Added user menu and sign-in button
- `.env.example` - Added NEXT_PUBLIC_SITE_URL

## 🧪 Testing Checklist

### Prerequisites
- [ ] Supabase project configured
- [ ] Google OAuth credentials created
- [ ] Environment variables set in `.env.local`
- [ ] Development server running (`npm run dev`)

### Test 1: Initial State (Logged Out)

**Steps:**
1. Open browser in incognito/private mode
2. Navigate to `http://localhost:3000`

**Expected Results:**
- [ ] Navbar shows "Sign In" button
- [ ] No user avatar visible
- [ ] Can browse home page and pricing page

### Test 2: Protected Route Redirect

**Steps:**
1. While logged out, try to access:
   - `http://localhost:3000/workflow`
   - `http://localhost:3000/generate`
   - `http://localhost:3000/history`

**Expected Results:**
- [ ] Automatically redirected to `/login` page
- [ ] URL includes `?redirectTo=/workflow` (or respective page)
- [ ] Login page displays correctly

### Test 3: Google Sign In Flow

**Steps:**
1. Click "Sign In" button in navbar
2. Verify redirect to `/login` page
3. Click "Continue with Google" button
4. Complete Google OAuth flow:
   - Select Google account
   - Grant permissions if prompted

**Expected Results:**
- [ ] Redirected to Google sign-in page
- [ ] Can select Google account
- [ ] Redirected back to app after authorization
- [ ] Lands on home page (or original protected page)
- [ ] User avatar appears in navbar

### Test 4: User Menu

**Steps:**
1. After signing in, click user avatar in navbar

**Expected Results:**
- [ ] Dropdown menu appears
- [ ] Shows user name (or email if no name)
- [ ] Shows user email
- [ ] "Sign Out" button visible
- [ ] Menu has smooth animation

### Test 5: Session Persistence

**Steps:**
1. Sign in successfully
2. Refresh the page (F5 or Cmd+R)
3. Navigate to different pages
4. Close and reopen browser tab

**Expected Results:**
- [ ] User remains signed in after refresh
- [ ] Avatar still visible in navbar
- [ ] Can access protected pages
- [ ] Session persists across tabs

### Test 6: Protected Page Access

**Steps:**
1. While signed in, navigate to:
   - `/workflow`
   - `/generate`
   - `/history`

**Expected Results:**
- [ ] Can access all protected pages
- [ ] No redirect to login
- [ ] Pages load correctly

### Test 7: Sign Out Flow

**Steps:**
1. Click user avatar in navbar
2. Click "Sign Out" button

**Expected Results:**
- [ ] Redirected to `/login` page
- [ ] Avatar disappears from navbar
- [ ] "Sign In" button appears
- [ ] Cannot access protected pages anymore
- [ ] Toast notification shows "Signed out"

### Test 8: Redirect After Login

**Steps:**
1. Sign out completely
2. Try to access `/workflow` directly
3. Get redirected to login
4. Sign in with Google

**Expected Results:**
- [ ] After sign in, redirected back to `/workflow`
- [ ] Not redirected to home page
- [ ] Workflow page loads correctly

### Test 9: Multiple Tabs

**Steps:**
1. Sign in on one tab
2. Open another tab with the app
3. Sign out from first tab
4. Check second tab

**Expected Results:**
- [ ] Second tab updates automatically
- [ ] User avatar disappears in second tab
- [ ] Auth state syncs across tabs

### Test 10: Error Handling

**Steps:**
1. Try to sign in without internet connection
2. Try to sign in and cancel Google OAuth

**Expected Results:**
- [ ] Error toast appears
- [ ] User stays on login page
- [ ] Can retry sign in
- [ ] No app crash

## 🐛 Common Issues and Solutions

### Issue: "Invalid redirect URI"

**Symptoms:**
- Error during Google OAuth flow
- Can't complete sign in

**Solution:**
1. Check Google Cloud Console credentials
2. Verify redirect URI is exactly:
   ```
   https://zzbdfzwkvogegqdyblre.supabase.co/auth/v1/callback
   ```
3. Make sure it's added to "Authorized redirect URIs"

### Issue: User not redirected after sign in

**Symptoms:**
- Sign in completes but stays on login page
- No redirect to home or protected page

**Solution:**
1. Check `NEXT_PUBLIC_SITE_URL` in `.env.local`
2. Verify auth callback route is working
3. Check browser console for errors
4. Clear browser cache and cookies

### Issue: Session not persisting

**Symptoms:**
- User signed out after page refresh
- Have to sign in repeatedly

**Solution:**
1. Check browser allows cookies
2. Verify Supabase client initialization
3. Check for errors in browser console
4. Try different browser

### Issue: Protected routes not working

**Symptoms:**
- Can access protected pages when logged out
- Middleware not triggering

**Solution:**
1. Verify `middleware.ts` is in project root
2. Check middleware matcher config
3. Restart development server
4. Check for TypeScript errors

### Issue: Avatar not showing

**Symptoms:**
- User signed in but no avatar in navbar
- Placeholder icon shows instead

**Solution:**
1. Check user object in browser console
2. Verify Google provides avatar URL
3. Check image loading in network tab
4. Fallback icon should show if no avatar

## 📊 Testing Results Template

Use this template to document your testing:

```
Date: ___________
Tester: ___________
Environment: Development / Production

Test Results:
✅ Test 1: Initial State - PASS
✅ Test 2: Protected Route Redirect - PASS
✅ Test 3: Google Sign In Flow - PASS
✅ Test 4: User Menu - PASS
✅ Test 5: Session Persistence - PASS
✅ Test 6: Protected Page Access - PASS
✅ Test 7: Sign Out Flow - PASS
✅ Test 8: Redirect After Login - PASS
✅ Test 9: Multiple Tabs - PASS
✅ Test 10: Error Handling - PASS

Issues Found:
- None / [List any issues]

Notes:
[Any additional observations]
```

## 🔍 Debugging Tips

### Check Auth State

Add this to any page to debug auth state:

```typescript
import { useAuth } from '@/lib/contexts/AuthContext';

export default function DebugPage() {
  const { user, loading } = useAuth();
  
  return (
    <div>
      <h1>Auth Debug</h1>
      <p>Loading: {loading ? 'Yes' : 'No'}</p>
      <p>User: {user ? 'Signed In' : 'Signed Out'}</p>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}
```

### Check Supabase Logs

1. Go to Supabase Dashboard
2. Navigate to **Logs** → **Auth Logs**
3. Look for sign-in attempts and errors

### Browser Console

Check for errors in browser console:
- Press F12 or Cmd+Option+I
- Look for red errors
- Check Network tab for failed requests

## 🎉 Success Criteria

Authentication is working correctly when:

- ✅ Can sign in with Google
- ✅ User avatar appears in navbar
- ✅ Can access protected pages when signed in
- ✅ Redirected to login when accessing protected pages while signed out
- ✅ Session persists across page reloads
- ✅ Can sign out successfully
- ✅ Auth state syncs across tabs
- ✅ Redirected back to original page after login

## 🚀 Next Steps After Testing

Once authentication is working:

1. **User Database**
   - Create users table in Supabase
   - Store additional user data
   - Track user preferences

2. **Credits System**
   - Add credits field to user profile
   - Deduct credits on generation
   - Show credits in navbar

3. **Usage Tracking**
   - Log generation history per user
   - Show user's past generations
   - Analytics dashboard

4. **Email Notifications**
   - Welcome email on sign up
   - Generation complete notifications
   - Credit low warnings

5. **Social Features**
   - Share generations publicly
   - User profiles
   - Community gallery

---

**Ready to test?** Follow the checklist above and document any issues you find!
