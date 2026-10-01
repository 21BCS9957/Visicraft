import 'server-only';

import sharp from 'sharp';
import { MIME_EXTENSIONS, uploadBufferToBucket } from '@/lib/server/supabaseStorage';

export const PLAYGROUND_BUCKET = 'generated-thumbnails';
const PREVIEW_EDGE = 1024;

export interface SavedImage {
  imageUrl: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  mimeType: string;
}

/**
 * Stores the image exactly as Gemini returned it (full quality, for downloads and the
 * Canvas) plus a small WebP preview for the gallery grid.
 */
export async function savePlaygroundImage(bytes: Buffer, mimeType: string): Promise<SavedImage> {
  const image = sharp(bytes, { failOn: 'none' });
  const meta = await image.metadata().catch(() => null);
  let fullBytes = bytes;
  let fullType = mimeType;
  if (!MIME_EXTENSIONS[fullType] || !fullType.startsWith('image/')) {
    fullBytes = await sharp(bytes, { failOn: 'none' }).png().toBuffer();
    fullType = 'image/png';
  }
  const preview = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  const [imageUrl, previewUrl] = await Promise.all([
    uploadBufferToBucket(fullBytes, PLAYGROUND_BUCKET, fullType),
    uploadBufferToBucket(preview, PLAYGROUND_BUCKET, 'image/webp'),
  ]);
  return {
    imageUrl,
    previewUrl,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    mimeType: fullType,
  };
}
