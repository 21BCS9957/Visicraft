import { z } from 'zod';

export const generationFormSchema = z.object({
  prompt: z.string().optional(),
});

export type GenerationFormData = z.infer<typeof generationFormSchema>;

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_SOURCE_IMAGES = 10;
export const MIN_SOURCE_IMAGES = 1;

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only JPG, PNG, and WebP images are allowed' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }

  return { valid: true };
}

export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only MP4, WebM, and MOV videos are allowed' };
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return { valid: false, error: 'File size must be less than 50MB' };
  }

  return { valid: true };
}
