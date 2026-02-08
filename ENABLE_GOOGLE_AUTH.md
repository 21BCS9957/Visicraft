# Enable Google Authentication in Supabase

## ❌ Error You're Seeing

```json
{
  "code": 400,
  "error_code": "validation_failed",
  "msg": "Unsupported provider: provider is not enabled"
}
```

This means Google OAuth is not enabled in your Supabase project yet.

## ✅ Quick Fix - Enable Google Provider

### Step 1: Go to Supabase Dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: **zzbdfzwkvogegqdyblre**
3. Navigate to **Authentication** (left sidebar)
4. Click on **Providers** tab

### Step 2: Enable Google Provider

You have two options:

#### Option A: Enable Without Custom Credentials (Quick Test)

1. Find **Google** in the providers list
2. Toggle it to **Enabled**
3. Leave the Client ID and Secret empty (Supabase will use default credentials for testing)
4. Click **Save**

**Note**: This uses Supabase's shared Google OAuth app. It works for testing but has limitations:
- Shared across all Supabase projects
- May show "Supabase" as the app name
- Not recommended for production

#### Option B: Enable With Your Own Google Credentials (Recommended)

Follow these steps to set up your own Google OAuth app:

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**

### 2. Configure OAuth Consent Screen

1. Click **Configure Consent Screen**
2. Choose **External** user type
3. Fill in required fields:
   - **App name**: `Visicraft`
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **Save and Continue**
5. Skip scopes (click **Save and Continue**)
6. Skip test users (click **Save and Continue**)
7. Click **Back to Dashboard**

### 3. Create OAuth Client ID

1. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
2. Choose **Web application**
3. Configure:
   - **Name**: `Visicraft`
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://your-production-domain.com
     ```
   - **Authorized redirect URIs** (CRITICAL - must be exact):
     ```
     https://zzbdfzwkvogegqdyblre.supabase.co/auth/v1/callback
     ```
4. Click **Create**
5. **Copy** the Client ID and Client Secret

### 4. Add Credentials to Supabase

1. Return to Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. Toggle **Enabled** to ON
3. Paste your credentials:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
4. Click **Save**

## 🧪 Test Authentication

After enabling Google provider:

1. Restart your development server:
   ```bash
   cd thumbnail-generator
   npm run dev
   ```

2. Open `http://localhost:3000`

3. Click **Sign In** button

4. Click **Continue with Google**

5. You should now see Google's sign-in page (no more error!)

## 🐛 Still Getting Errors?

### Error: "Invalid redirect URI"

**Solution**: Make sure the redirect URI in Google Cloud Console is EXACTLY:
```
https://zzbdfzwkvogegqdyblre.supabase.co/auth/v1/callback
```

No trailing slash, no extra characters.

### Error: "OAuth consent screen not configured"

**Solution**: Complete the OAuth consent screen setup in Google Cloud Console before creating credentials.

### Error: "Access blocked: This app's request is invalid"

**Solution**: 
1. Check that authorized redirect URI is correct
2. Make sure OAuth consent screen is published
3. Try using Supabase's default credentials first (Option A)

## 📋 Verification Checklist

- [ ] Supabase project opened
- [ ] Authentication → Providers page accessed
- [ ] Google provider toggled to Enabled
- [ ] Credentials added (if using Option B)
- [ ] Changes saved
- [ ] Development server restarted
- [ ] Tested sign-in flow

## 🎯 What Happens After Enabling

Once Google provider is enabled:

1. ✅ Sign-in button will work
2. ✅ Google OAuth flow will start
3. ✅ Users can authenticate with Google
4. ✅ User data will be stored in Supabase
5. ✅ Session will be created
6. ✅ Avatar will appear in navbar

## 🚀 Quick Start (Option A - Fastest)

If you just want to test quickly:

1. Go to Supabase Dashboard
2. Authentication → Providers
3. Find Google
4. Toggle to **Enabled**
5. Click **Save** (leave credentials empty)
6. Restart dev server
7. Try signing in

This uses Supabase's shared credentials and works immediately!

## 📚 More Information

For detailed setup instructions, see:
- `GOOGLE_AUTH_SETUP.md` - Complete setup guide
- `AUTH_TESTING_GUIDE.md` - Testing checklist
- `AUTH_INTEGRATION_COMPLETE.md` - Feature overview

---

**Need help?** The error you saw is normal - it just means you need to enable the Google provider in Supabase. Follow Option A above for the quickest fix!
