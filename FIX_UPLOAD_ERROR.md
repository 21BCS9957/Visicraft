# Fix "Failed to upload reference image" Error

## The Problem
Your storage buckets exist but **Row Level Security (RLS)** is blocking uploads.

## Solution: Add Storage Policies

### Option 1: Run SQL (Recommended - 30 seconds)

1. **Open SQL Editor:**
   https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/sql

2. **Click "New Query"**

3. **Copy and paste this SQL:**
   ```sql
   -- Allow public access to source-images bucket
   CREATE POLICY "Allow public uploads to source-images"
   ON storage.objects FOR INSERT
   TO public
   WITH CHECK (bucket_id = 'source-images');

   CREATE POLICY "Allow public reads from source-images"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'source-images');

   -- Allow public access to generated-thumbnails bucket
   CREATE POLICY "Allow public uploads to generated-thumbnails"
   ON storage.objects FOR INSERT
   TO public
   WITH CHECK (bucket_id = 'generated-thumbnails');

   CREATE POLICY "Allow public reads from generated-thumbnails"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'generated-thumbnails');
   ```

4. **Click "RUN"** (or press Ctrl/Cmd + Enter)

5. **Done!** Try uploading again at http://localhost:3000/generate

---

### Option 2: Use Supabase UI (1 minute)

#### For `source-images` bucket:

1. Go to: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets/source-images

2. Click the **"Policies"** tab

3. Click **"New Policy"**

4. Select **"For full customization"**

5. Fill in:
   - Policy name: `Allow public access`
   - Allowed operation: Check **ALL** (SELECT, INSERT, UPDATE, DELETE)
   - Target roles: `public`
   - USING expression: `true`
   - WITH CHECK expression: `true`

6. Click **"Save policy"**

#### For `generated-thumbnails` bucket:

Repeat steps 1-6 above but for the `generated-thumbnails` bucket:
https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets/generated-thumbnails

---

## After Adding Policies

Your app should work immediately! Test it:

1. Go to: http://localhost:3000/generate
2. Upload a reference image
3. Upload source images
4. Click "Generate Thumbnails"

## Still Having Issues?

Check the browser console (F12) and server logs for detailed error messages.

### Common Issues:

**"Bucket not found"**
- Make sure bucket names are exactly: `source-images` and `generated-thumbnails`
- Check they are marked as **Public** buckets

**"RLS policy violation"**
- The policies weren't created correctly
- Try Option 2 (UI method) and make sure to check ALL operations

**"Invalid file type"**
- Only JPG, PNG, and WebP are supported
- Max file size: 5MB per image

## Verify Policies Were Created

Run this SQL to check:
```sql
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND (policyname LIKE '%source-images%' OR policyname LIKE '%generated-thumbnails%');
```

You should see at least 4 policies (2 for each bucket).
