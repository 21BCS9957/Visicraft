# Supabase Setup Guide

Your Supabase credentials are already configured in `.env.local`. Now you need to set up the database and storage.

## Current Configuration

```
Project URL: https://zzbdfzwkvogegqdyblre.supabase.co
Project Ref: zzbdfzwkvogegqdyblre
```

## Step 1: Create Storage Buckets

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre

2. Navigate to **Storage** in the left sidebar

3. Create the first bucket:
   - Click **"New bucket"**
   - Name: `source-images`
   - Public bucket: **✓ Yes** (check this box)
   - Click **"Create bucket"**

4. Create the second bucket:
   - Click **"New bucket"** again
   - Name: `generated-thumbnails`
   - Public bucket: **✓ Yes** (check this box)
   - Click **"Create bucket"**

## Step 2: Create Database Table

1. In your Supabase dashboard, navigate to **SQL Editor** in the left sidebar

2. Click **"New query"**

3. Copy and paste the contents of `supabase-setup.sql` file

4. Click **"Run"** or press `Ctrl/Cmd + Enter`

5. You should see a success message

## Step 3: Verify Setup

### Check Storage Buckets

1. Go to **Storage** in your dashboard
2. You should see two buckets:
   - `source-images` (public)
   - `generated-thumbnails` (public)

### Check Database Table

1. Go to **Table Editor** in your dashboard
2. You should see the `generations` table
3. Click on it to view the schema:
   - `id` (uuid, primary key)
   - `user_id` (text, nullable)
   - `reference_image_url` (text)
   - `source_images_urls` (text array)
   - `generated_thumbnails` (text array)
   - `prompt` (text, nullable)
   - `created_at` (timestamp)

## Step 4: Test the Connection

Your app is already running at http://localhost:3000

1. Go to http://localhost:3000/generate
2. Try uploading a reference image
3. Upload 1-3 source images
4. Click "Generate Thumbnails"

If everything is set up correctly:
- Images will upload to Supabase Storage
- Generation data will be saved to the database
- You can view history at http://localhost:3000/history

## Troubleshooting

### "Failed to upload image"
- Check that storage buckets are created and set to **public**
- Verify bucket names are exactly: `source-images` and `generated-thumbnails`

### "Failed to save generation"
- Check that the `generations` table exists
- Verify the SQL script ran successfully
- Check the browser console for detailed error messages

### "Access denied" errors
- Ensure RLS policies are set up (the SQL script includes a permissive policy)
- For production, you'll want to add proper authentication and restrict policies

## Storage Bucket Policies (Optional)

If you want to add more security to your storage buckets:

1. Go to **Storage** → Select a bucket → **Policies**
2. Create policies for:
   - INSERT: Allow authenticated users to upload
   - SELECT: Allow public read access
   - DELETE: Allow users to delete their own files

## Next Steps

Once Supabase is set up:
1. ✅ Storage buckets created
2. ✅ Database table created
3. ✅ Test image upload
4. ✅ Test thumbnail generation
5. ✅ Check history page

Your app should now be fully functional!

## Quick Links

- Dashboard: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre
- Storage: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets
- SQL Editor: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/sql
- Table Editor: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/editor
