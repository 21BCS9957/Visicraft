import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase storage is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

function fileNameForMimeType(mimeType: string): string {
  const ext = MIME_EXTENSIONS[mimeType] ?? 'bin';
  return `${crypto.randomUUID()}.${ext}`;
}

export async function uploadBufferToBucket(
  buffer: Buffer,
  bucket: string,
  contentType: string
): Promise<string> {
  const fileName = fileNameForMimeType(contentType);
  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .upload(fileName, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = getSupabaseAdmin().storage.from(bucket).getPublicUrl(fileName);
  if (!data.publicUrl) {
    throw new Error('Image upload failed: public URL was not returned');
  }

  return data.publicUrl;
}

export async function uploadDataUrlToBucket(dataUrl: string, bucket: string): Promise<string> {
  const prefix = 'data:';
  const base64Marker = ';base64,';

  if (!dataUrl.startsWith(prefix) || !dataUrl.includes(base64Marker)) {
    throw new Error('Image upload failed: invalid generated image format');
  }

  const base64Index = dataUrl.indexOf(base64Marker);
  const mimeType = dataUrl.slice(prefix.length, base64Index);
  const base64Data = dataUrl.slice(base64Index + base64Marker.length);

  if (!MIME_EXTENSIONS[mimeType] || !mimeType.startsWith('image/')) {
    throw new Error(`Image upload failed: unsupported generated image type (${mimeType || 'unknown'})`);
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) {
    throw new Error('Image upload failed: generated image data was empty');
  }

  return uploadBufferToBucket(buffer, bucket, mimeType);
}
