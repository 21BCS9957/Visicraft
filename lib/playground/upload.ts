'use client';

import { uploadFileWithSignedUrl } from '@/lib/supabase/storage';

/** Browser-side image uploads shared by references, the Library and the Video Studio. */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export const IMAGE_ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };

export interface UploadedImageFile {
  url: string;
  name: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
}

/** Reads the image's size and, when it's over the 5 MB upload limit, re-encodes it smaller. */
export async function prepareUpload(file: File): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (file.size <= MAX_UPLOAD_BYTES && ACCEPTED.includes(file.type)) {
    bitmap.close();
    return { file, width, height };
  }
  const scale = Math.min(1, 3072 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.92, 0.85, 0.78]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      return { file: new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }), width: canvas.width, height: canvas.height };
    }
  }
  throw new Error(`${file.name} is too large even after shrinking.`);
}

/**
 * Uploads images to our storage (in preview mode, just local object URLs). Files that fail
 * are reported through `onError` and left out of the result.
 */
export async function uploadImages(files: File[], options: { preview?: boolean; onError?: (message: string) => void } = {}): Promise<UploadedImageFile[]> {
  const results = await Promise.all(files.map(async (original) => {
    try {
      const { file, width, height } = await prepareUpload(original);
      const url = options.preview ? URL.createObjectURL(file) : await uploadFileWithSignedUrl(file, 'source-images');
      return { url, name: original.name.replace(/\.\w+$/, '').slice(0, 160), width, height, mimeType: file.type, sizeBytes: file.size };
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : `Could not upload ${original.name}`);
      return null;
    }
  }));
  return results.filter((result): result is UploadedImageFile => Boolean(result));
}
