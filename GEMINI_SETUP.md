# Google Gemini API Setup Guide

## ✅ Why Switch to Gemini?

We've switched from Nano Banana API to **Google's official Gemini API** because:

- ✅ **Direct API access** - No polling or callback issues
- ✅ **Instant results** - Images returned immediately in the response
- ✅ **Better reliability** - Official Google API with proper documentation
- ✅ **More features** - Supports up to 14 reference images, 4K resolution, Google Search grounding
- ✅ **Simpler integration** - Single API call, no task polling needed

## 🔑 Get Your Gemini API Key

### Step 1: Visit Google AI Studio

Go to: **https://aistudio.google.com/apikey**

### Step 2: Sign in with Google Account

Use your Google account to sign in.

### Step 3: Create API Key

1. Click **"Get API key"** or **"Create API key"**
2. Select a Google Cloud project (or create a new one)
3. Copy your API key

### Step 4: Add to Your Project

Open `thumbnail-generator/.env.local` and add:

```bash
GEMINI_API_KEY=your_actual_api_key_here
```

Replace `your_actual_api_key_here` with the key you copied.

## 🎨 What Changed?

### API Integration

**Before (Nano Banana):**
- Submit task → Get task ID → Poll for results → 404 errors
- Required callback URLs or manual dashboard checking
- Complex polling logic with multiple endpoint attempts

**After (Gemini):**
- Send images + prompt → Get generated image immediately
- Single API call, instant response
- Images returned as base64 in the response

### Code Changes

**File: `lib/banana/api.ts`**
- Removed: Task submission and polling logic
- Added: Direct Gemini API integration
- Images sent as base64 inline data
- Results returned immediately

**Environment Variables:**
- Removed: `BANANA_API_KEY`
- Added: `GEMINI_API_KEY`

## 🚀 Features

### Gemini 3 Pro Image Preview

The model we're using (`gemini-3-pro-image-preview`) supports:

- **Up to 14 reference images** (we use reference + source images)
- **4K resolution** (we use 2K for faster generation)
- **16:9 aspect ratio** (perfect for YouTube thumbnails)
- **Advanced reasoning** for complex image composition
- **Google Search grounding** (can add real-time data)

### Configuration

In `lib/banana/api.ts`, we configure:

```typescript
generationConfig: {
  responseModalities: ['IMAGE'],  // Only return images
  imageConfig: {
    aspectRatio: '16:9',          // YouTube thumbnail format
    imageSize: '2K'                // High quality, fast generation
  }
}
```

## 📊 Pricing

Gemini API pricing (as of 2026):

- **Free tier**: 15 requests per minute
- **Paid tier**: Higher rate limits available

Check current pricing: https://ai.google.dev/pricing

## 🔧 Troubleshooting

### "Invalid API key" Error

- Make sure you copied the full API key
- Check for extra spaces in `.env.local`
- Restart your dev server after adding the key

### "Rate limit exceeded" Error

- Free tier: 15 requests/minute
- Wait a moment and try again
- Consider upgrading for higher limits

### Images Not Generating

1. Check API key is set correctly
2. Verify images are uploaded to Supabase first
3. Check browser console for detailed errors
4. Ensure images are accessible (public URLs)

## 📚 Documentation

- **Gemini API Docs**: https://ai.google.dev/gemini-api/docs/image-generation
- **Get API Key**: https://aistudio.google.com/apikey
- **Pricing**: https://ai.google.dev/pricing

## 🎯 Next Steps

1. Get your Gemini API key from https://aistudio.google.com/apikey
2. Add it to `.env.local`
3. Restart your dev server: `npm run dev`
4. Test the workflow editor at http://localhost:3000/workflow

That's it! Your thumbnail generator now uses Google's official Gemini API for reliable, instant image generation.
