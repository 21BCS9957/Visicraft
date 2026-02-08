# Fix Storage Bucket Policies

Your buckets exist but Row Level Security (RLS) is blocking uploads. You need to add policies to allow uploads.

## Quick Fix - Run This SQL

Go to: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/sql

Copy and paste this SQL, then click **RUN**:

```sql
-- Allow public uploads to source-images bucket
CREATE POLICY "Allow public uploads to source-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'source-images');

CREATE POLICY "Allow public reads from source-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'source-images');

CREATE POLICY "Allow public deletes from source-images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'source-images');

-- Allow public uploads to generated-thumbnails bucket
CREATE POLICY "Allow public uploads to generated-thumbnails"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'generated-thumbnails');

CREATE POLICY "Allow public reads from generated-thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'generated-thumbnails');

CREATE POLICY "Allow public deletes from generated-thumbnails"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'generated-thumbnails');
```

## Alternative: Disable RLS (Quick but less secure)

If you want to quickly test without policies:

1. Go to: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets
2. Click on `source-images` bucket
3. Go to **Policies** tab
4. Click **"Disable RLS"** (or add the policies above)
5. Repeat for `generated-thumbnails` bucket

## After Running SQL

Restart your dev server:
```bash
# Stop the current server (Ctrl+C)
npm run dev
```

Then test at: http://localhost:3000/generate
