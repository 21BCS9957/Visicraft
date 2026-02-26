import { supabase } from './client';

export async function uploadImage(file: File, bucket: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function uploadMultipleImages(files: File[], bucket: string): Promise<string[]> {
  const uploadPromises = files.map(file => uploadImage(file, bucket));
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

/**
 * Upload from a data URL (e.g. data:image/png;base64,...) to Supabase Storage.
 * Used for generated images so we store a URL instead of base64 in DB/client.
 */
export async function uploadFromDataUrl(dataUrl: string, bucket: string): Promise<string> {
  // Use indexOf/substring instead of regex to avoid stack overflow on huge base64 strings
  const prefix = 'data:';
  const base64Marker = ';base64,';
  if (!dataUrl.startsWith(prefix) || !dataUrl.includes(base64Marker)) {
    throw new Error('Invalid data URL format');
  }
  const base64Index = dataUrl.indexOf(base64Marker);
  const mimeType = dataUrl.slice(prefix.length, base64Index);
  const base64Data = dataUrl.slice(base64Index + base64Marker.length);
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filePath = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(base64Data, 'base64');

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
