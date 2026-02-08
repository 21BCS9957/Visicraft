# Quick Start Guide

Get your YouTube Thumbnail Generator running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)
- A Banana Nano API account

## Step 1: Install Dependencies (1 min)

\`\`\`bash
cd thumbnail-generator
npm install
\`\`\`

## Step 2: Supabase Setup (2 min)

### Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Wait for project to initialize

### Create Storage Buckets
1. Go to **Storage** → **New bucket**
2. Create bucket: `source-images` (make it **Public**)
3. Create bucket: `generated-thumbnails` (make it **Public**)

### Create Database Table
1. Go to **SQL Editor** → **New query**
2. Paste and run:

\`\`\`sql
CREATE TABLE generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  reference_image_url TEXT NOT NULL,
  source_images_urls TEXT[] NOT NULL,
  generated_thumbnails TEXT[] NOT NULL,
  prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### Get Credentials
1. Go to **Settings** → **API**
2. Copy:
   - **Project URL**
   - **anon public** key

## Step 3: Banana API Setup (1 min)

1. Sign up at [banana.dev](https://banana.dev)
2. Get your **API Key** from dashboard
3. Get your **Model Key** for thumbnail generation

## Step 4: Configure Environment (1 min)

Edit `.env.local`:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
BANANA_API_KEY=your-banana-api-key
\`\`\`

## Step 5: Run! (30 sec)

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)

## Test It Out

1. Click **"Start Creating"** on home page
2. Upload a **reference thumbnail** (any YouTube thumbnail image)
3. Upload **1-10 source images** (photos you want to transform)
4. (Optional) Add a prompt like "make it more vibrant"
5. Click **"Generate Thumbnails"**
6. Download your AI-generated thumbnails!

## Troubleshooting

### "Failed to upload image"
- Make sure Supabase buckets are **Public**
- Check your Supabase URL and key

### "Banana API error"
- Verify your API key is correct
- Check that your model is deployed
- Ensure you have API credits

### Build errors
- Run `npm install` again
- Delete `.next` folder and rebuild
- Check Node.js version (18+)

### Images not showing
- Verify buckets are public in Supabase
- Check browser console for errors
- Try a different image format

## What's Next?

- Customize colors in `app/globals.css`
- Add user authentication
- Deploy to Vercel
- Check `README.md` for more features

## Need Help?

1. Check `SETUP.md` for detailed instructions
2. Review `PROJECT_SUMMARY.md` for architecture
3. Check browser console for errors
4. Verify all environment variables are set

---

**That's it!** You should now have a fully functional AI thumbnail generator running locally. 🎉
