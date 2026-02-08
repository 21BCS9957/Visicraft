# Google Authentication Setup Guide

Complete guide to setting up Google OAuth authentication with Supabase for Visicraft.

## 📋 Prerequisites

- Supabase project created and configured
- Environment variables set in `.env.local`
- Google account for OAuth configuration

## 🔧 Step 1: Configure Google OAuth in Supabase

### 1.1 Access Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `zzbdfzwkvogegqdyblre`
3. Navigate to **Authentication** → **Providers**

### 1.2 Enable Google Provider

1. Find **Google** in the providers list
2. Toggle it to **Enabled**
3. You'll need to configure Google Cloud Console first (see Step 2)

## 🌐 Step 2: Configure Google Cloud Console

### 2.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**

### 2.2 Configure OAuth Consent Screen

Before creating credentials, you need to configure the consent screen:

1. Click **Configure Consent Screen**
2. Choose **External** user type
3. Fill in required fields:
   - **App name**: Visicraft
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Add scopes (optional for basic auth):
   - `userinfo.email`
   - `userinfo.profile`
5. Save and continue

### 2.3 Create OAuth Client ID

1. Return to **Credentials** → **Create Credentials** → **OAuth client ID**
2. Choose **Web application**
3. Configure:
   - **Name**: Visicraft Production
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for development)
     - `https://your-production-domain.com` (for production)
   - **Authorized redirect URIs**:
     - `https://zzbdfzwkvogegqdyblre.supabase.co/auth/v1/callback`
4. Click **Create**
5. Copy the **Client ID** and **Client Secret**

## 🔐 Step 3: Add Credentials to Supabase

1. Return to Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. Paste your credentials:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
3. Click **Save**

## 📝 Step 4: Update Environment Variables

Add to your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zzbdfzwkvogegqdyblre.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
```

For production, update `NEXT_PUBLIC_SITE_URL` to your production domain.

## 🧪 Step 5: Test Authentication Flow

### 5.1 Start Development Server

```bash
cd thumbnail-generator
npm run dev
```

### 5.2 Test Sign In

1. Navigate to `http://localhost:3000`
2. Click **Sign In** button in navbar
3. You'll be redirected to `/login` page
4. Click **Continue with Google**
5. Complete Google OAuth flow
6. You should be redirected back to home page
7. Your avatar should appear in navbar

### 5.3 Test Sign Out

1. Click your avatar in navbar
2. Click **Sign Out**
3. You should be redirected to `/login` page

## 🔒 Step 6: Add Protected Routes (Optional)

To restrict certain pages to authenticated users only, create middleware:

### Create `middleware.ts` in project root:

```typescript
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            res.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name: string, options: any) {
            res.cookies.set({
              name,
              value: '',
              ...options,
            });
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Protect workflow and generate pages
    if (!session && (req.nextUrl.pathname.startsWith('/workflow') || 
                      req.nextUrl.pathname.startsWith('/generate') ||
                      req.nextUrl.pathname.startsWith('/history'))) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return res;
  }
}

export const config = {
  matcher: ['/workflow/:path*', '/generate/:path*', '/history/:path*'],
};
```

## 🎯 Authentication Features

### Current Implementation

✅ **Google OAuth Sign In**
- Secure authentication via Supabase
- Automatic session management
- User profile data (name, email, avatar)

✅ **User Interface**
- Sign In button in navbar (when logged out)
- User avatar dropdown (when logged in)
- Sign Out functionality
- Beautiful login page with animations

✅ **Session Management**
- Automatic session refresh
- Persistent authentication
- Auth state listener

### User Flow

1. **Unauthenticated User**:
   - Sees "Sign In" button in navbar
   - Can browse public pages
   - Redirected to login for protected pages

2. **Sign In Process**:
   - Click "Sign In" → Redirects to `/login`
   - Click "Continue with Google" → Google OAuth
   - Authorize app → Redirects to `/auth/callback`
   - Session created → Redirects to home page

3. **Authenticated User**:
   - Avatar shown in navbar
   - Click avatar → Dropdown menu
   - Access to all features
   - Can sign out anytime

## 🐛 Troubleshooting

### Issue: "Invalid redirect URI"

**Solution**: Make sure the redirect URI in Google Cloud Console exactly matches:
```
https://zzbdfzwkvogegqdyblre.supabase.co/auth/v1/callback
```

### Issue: "OAuth consent screen not configured"

**Solution**: Complete the OAuth consent screen configuration in Google Cloud Console before creating credentials.

### Issue: User not redirected after sign in

**Solution**: Check that `NEXT_PUBLIC_SITE_URL` is set correctly in `.env.local`.

### Issue: Session not persisting

**Solution**: Clear browser cookies and try again. Make sure Supabase client is properly initialized.

## 📚 Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Next.js Authentication](https://nextjs.org/docs/authentication)

## 🎉 Success Checklist

- [ ] Google OAuth credentials created
- [ ] Credentials added to Supabase
- [ ] Environment variables configured
- [ ] Development server running
- [ ] Can sign in with Google
- [ ] Avatar appears in navbar
- [ ] Can sign out successfully
- [ ] Session persists on page refresh

## 🚀 Next Steps

1. **Add User Profiles**: Store additional user data in Supabase database
2. **Credits System**: Track user credits for AI generation
3. **Usage Analytics**: Monitor user activity and generation history
4. **Email Notifications**: Send welcome emails and updates
5. **Social Features**: Allow users to share their creations

---

**Need Help?** Check the troubleshooting section or review the Supabase logs in your dashboard.
