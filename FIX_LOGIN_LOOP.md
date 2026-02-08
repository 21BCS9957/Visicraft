# Fix Login Loop Issue

## Problem
After signing in with Google, clicking on Workflow, Generate, or History keeps redirecting back to the login page.

## Root Cause
The middleware is not detecting the session properly after OAuth callback, causing it to think you're not authenticated.

## Quick Fix - Temporarily Disable Middleware

To test if authentication is working, temporarily disable the middleware:

### Option 1: Comment Out Middleware (Fastest)

Rename the middleware file:
```bash
cd thumbnail-generator
mv middleware.ts middleware.ts.disabled
```

Then restart your dev server:
```bash
npm run dev
```

Now try:
1. Sign in with Google
2. Click Workflow - should work now!

### Option 2: Make Pages Public Temporarily

Edit `middleware.ts` and change the protected paths to an empty array:

```typescript
// Temporarily disable protection
const protectedPaths: string[] = [];
// const protectedPaths = ['/workflow', '/generate', '/history'];
```

## Proper Fix - Update Auth Flow

The issue is that the OAuth callback needs to properly set server-side cookies. I've updated the files:

### 1. Check Browser Console

After signing in, open browser console (F12) and look for these logs:
```
🔐 Middleware check: { path: '/workflow', hasSession: true/false, userId: '...' }
```

If `hasSession: false`, the session isn't being stored properly.

### 2. Check Cookies

In browser DevTools:
1. Go to Application tab (Chrome) or Storage tab (Firefox)
2. Look under Cookies → `http://localhost:3000`
3. Look for cookies starting with `sb-` (Supabase cookies)

If you don't see these cookies, the OAuth callback isn't setting them.

### 3. Try Signing Out and In Again

1. Clear all browser cookies for localhost:3000
2. Close all tabs
3. Open a new incognito/private window
4. Go to `http://localhost:3000`
5. Sign in with Google
6. Check if cookies are set

## Debug Steps

### Step 1: Check if Sign In Works

After clicking "Continue with Google":
- ✅ Redirected to Google
- ✅ Can select account
- ✅ Redirected back to app
- ✅ Avatar appears in navbar

If avatar appears, authentication is working!

### Step 2: Check Session in Browser

Open browser console and run:
```javascript
// Check if session exists
const { data } = await window.supabase.auth.getSession();
console.log('Session:', data.session);
```

### Step 3: Check Middleware Logs

Look in terminal where dev server is running for:
```
🔐 Middleware check: ...
❌ No session, redirecting to login
```

or

```
✅ Session valid, allowing access
```

## Solutions

### Solution 1: Disable Middleware (Temporary)

If you just want to test the app without authentication:

```bash
mv middleware.ts middleware.ts.disabled
npm run dev
```

### Solution 2: Fix Cookie Settings

The issue might be cookie settings. Update `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zzbdfzwkvogegqdyblre.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Make sure `NEXT_PUBLIC_SITE_URL` matches exactly where you're accessing the app.

### Solution 3: Update Supabase Auth Settings

In Supabase Dashboard:
1. Go to Authentication → URL Configuration
2. Set **Site URL**: `http://localhost:3000`
3. Add **Redirect URLs**:
   - `http://localhost:3000`
   - `http://localhost:3000/auth/callback`
4. Save changes

### Solution 4: Clear Everything and Retry

```bash
# Stop dev server
# Clear browser cookies
# Clear browser cache
# Restart dev server
npm run dev
# Try signing in again
```

## Testing After Fix

1. **Sign Out** (if signed in)
2. **Clear browser cookies** for localhost:3000
3. **Restart dev server**
4. **Sign in with Google**
5. **Check terminal logs** for middleware messages
6. **Try accessing /workflow**

If you see:
```
🔐 Middleware check: { path: '/workflow', hasSession: true, userId: '...' }
✅ Session valid, allowing access
```

Then it's working!

## If Still Not Working

### Check Supabase Dashboard

1. Go to Supabase Dashboard
2. Authentication → Users
3. Check if your user appears after sign in
4. If user exists, authentication is working
5. The issue is just with session persistence

### Alternative: Use Client-Side Protection

Instead of middleware, protect pages in the component:

```typescript
// In app/workflow/page.tsx
'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function WorkflowPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirectTo=/workflow');
    }
  }, [user, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!user) return null;

  return (
    // Your workflow page content
  );
}
```

## Quick Test Command

Run this to see if session is working:

```bash
# In browser console after signing in
localStorage.getItem('supabase.auth.token')
```

If this returns null, session isn't being stored.

---

**Recommended**: Temporarily disable middleware to test the app, then we can fix the session persistence issue separately.
