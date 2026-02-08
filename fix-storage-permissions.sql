-- Fix Storage Bucket Permissions for Thumbnail Generator
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/sql

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public uploads to source-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from source-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from source-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to generated-thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from generated-thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from generated-thumbnails" ON storage.objects;

-- Create policies for source-images bucket
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

CREATE POLICY "Allow public updates to source-images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'source-images')
WITH CHECK (bucket_id = 'source-images');

-- Create policies for generated-thumbnails bucket
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

CREATE POLICY "Allow public updates to generated-thumbnails"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'generated-thumbnails')
WITH CHECK (bucket_id = 'generated-thumbnails');

-- Verify policies were created
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage';
