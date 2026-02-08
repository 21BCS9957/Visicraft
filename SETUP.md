# Setup Guide

## Quick Start Checklist

- [ ] Node.js 18+ installed
- [ ] Supabase account created
- [ ] Banana Nano API account created
- [ ] Environment variables configured
- [ ] Supabase storage buckets created
- [ ] Database table created
- [ ] Dependencies installed

## Detailed Setup Steps

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Supabase Configuration

#### Create Storage Buckets

1. Go to your Supabase project dashboard
2. Navigate to Storage
3. Click "Create bucket"
4. Create two buckets:
   - Name: `source-images`, Public: Yes
   - Name: `generated-thumbnails`, Public: Yes

#### Create Database Table

Go to SQL Editor and run:

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

-- Optional: Add index for faster queries
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);
\`\`\`

#### Get API Credentials

1. Go to Settings → API
2. Copy:
   - Project URL
   - anon/public key

### 3. Banana Nano API Setup

1. Sign up at https://banana.dev
2. Create or select a model for thumbnail generation
3. Get your API key from the dashboard
4. Get your model key for the specific model

### 4. Environment Variables

Copy `.env.example` to `.env.local`:

\`\`\`bash
cp .env.example .env.local
\`\`\`

Edit `.env.local` with your credentials:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
BANANA_API_KEY=your-banana-api-key
BANANA_MODEL_KEY=your-banana-model-key
\`\`\`

### 5. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Visit http://localhost:3000

## Testing the Setup

### Test Supabase Connection

1. Go to http://localhost:3000/generate
2. Try uploading an image
3. Check browser console for errors
4. Verify image appears in Supabase Storage

### Test Banana API

1. Upload reference and source images
2. Click "Generate Thumbnails"
3. Check browser console and network tab
4. Verify API response

## Common Issues

### "Failed to upload image"
- Check Supabase bucket permissions (should be public)
- Verify NEXT_PUBLIC_SUPABASE_URL is correct
- Check file size (max 5MB)

### "Banana API error"
- Verify API key is correct
- Check model key matches your model
- Ensure model is active and deployed
- Check API rate limits

### "Database error"
- Verify table exists with correct schema
- Check Supabase connection
- Review RLS policies (disable for testing)

### Images not displaying
- Ensure storage buckets are public
- Check CORS settings in Supabase
- Verify image URLs are accessible

## Production Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables in Vercel

Add all variables from `.env.local`:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- BANANA_API_KEY

## Security Notes

- Never commit `.env.local` to git
- Use environment variables for all secrets
- Enable RLS on Supabase tables in production
- Consider rate limiting for API routes
- Validate file uploads on server side

## Next Steps

After setup:
1. Test image upload functionality
2. Test thumbnail generation
3. Check history page
4. Customize colors/styling if needed
5. Add user authentication (optional)
6. Set up monitoring and error tracking
