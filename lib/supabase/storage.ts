import { supabase } from './client';

/**
 * Upload a file to Supabase Storage.
 * @param file - File to upload
 * @param bucket - Bucket name (e.g. 'source-images')
 * @param userId - Optional user ID to scope path (e.g. uploads/{userId}/filename). Omit only for backward compatibility.
 */
export async function uploadImage(file: File, bucket: string, userId?: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
  const filePath = userId ? `${userId}/${fileName}` : fileName;

  console.log(`📤 Uploading to bucket: ${bucket}, path: ${filePath}`);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file);

  if (error) {
    console.error('❌ Supabase upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  console.log('✅ Upload successful, public URL:', data.publicUrl);
  return data.publicUrl;
}

export async function uploadMultipleImages(files: File[], bucket: string, userId?: string): Promise<string[]> {
  const uploadPromises = files.map((file) => uploadImage(file, bucket, userId));
  return Promise.all(uploadPromises);
}

export async function deleteImage(path: string, bucket: string): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export function getPublicUrl(path: string, bucket: string): string {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}
