import { generateThumbnail } from '@/lib/banana/api';
import { uploadFromDataUrl } from '@/lib/supabase/storage';
import { supabase } from '@/lib/supabase/client';

export type ImageGenMode = 'generate' | 'thumbnail' | 'edit' | 'upscale' | 'unblur';

export function normalizeReferenceImages(body: Record<string, unknown>): string[] {
  const raw = body.referenceImages;
  if (Array.isArray(raw) && raw.length > 0) {
    return uniqueUrlsInOrder(raw.filter((u): u is string => typeof u === 'string' && u.length > 0));
  }
  const parts: string[] = [];
  if (typeof body.referenceImage === 'string' && body.referenceImage) parts.push(body.referenceImage);
  const src = body.sourceImages;
  if (Array.isArray(src)) {
    for (const u of src) {
      if (typeof u === 'string' && u) parts.push(u);
    }
  }
  if (typeof body.imageUrl === 'string' && body.imageUrl) parts.push(body.imageUrl);
  return uniqueUrlsInOrder(parts);
}

function uniqueUrlsInOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function resolveEffectivePrompt(mode: ImageGenMode, prompt: string | undefined): string {
  const p = (prompt ?? '').trim();
  switch (mode) {
    case 'thumbnail':
      return p
        ? `Create an eye-catching, professional YouTube thumbnail. ${p}. Make it vibrant, attention-grabbing with bold elements and clear focal points. Optimize for small screen viewing.`
        : 'Create an eye-catching, professional YouTube thumbnail. Make it vibrant and attention-grabbing with bold text, clear focal points, and high contrast. Optimize for small screen viewing and maximum click-through rate.';
    case 'edit':
      return `Edit this image: ${p}. Maintain the overall composition and quality while making the requested changes.`;
    case 'upscale':
      return 'Upscale this image to 4x resolution while preserving all details and quality. Enhance sharpness and clarity.';
    case 'unblur':
      return p
        ? `Sharpen and deblur this image. ${p}`
        : 'Sharpen and deblur this image. Remove blur, enhance details, improve clarity and focus. Make the image crystal clear.';
    default:
      return p;
  }
}

export interface RunImageGenerationOptions {
  mode: ImageGenMode;
  referenceImages: string[];
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  persistToGenerationsTable?: boolean;
}

export async function runImageGeneration(options: RunImageGenerationOptions): Promise<string[]> {
  const {
    mode,
    referenceImages,
    prompt,
    model,
    aspectRatio,
    resolution,
    persistToGenerationsTable = mode === 'generate',
  } = options;

  if (referenceImages.length === 0) {
    throw new Error('At least one image is required');
  }

  if (mode === 'edit' && !String(prompt ?? '').trim()) {
    throw new Error('Edit instructions (prompt) are required');
  }

  if (mode === 'generate' && referenceImages.length === 1 && !String(prompt ?? '').trim()) {
    throw new Error('Please provide a prompt to describe what you want to generate');
  }

  const effectivePrompt = resolveEffectivePrompt(mode, prompt);

  const dataUrls = await generateThumbnail(referenceImages, effectivePrompt, model, aspectRatio, resolution);

  const publicUrls = await Promise.all(
    dataUrls.map((dataUrl) => uploadFromDataUrl(dataUrl, 'generated-thumbnails'))
  );

  if (persistToGenerationsTable) {
    try {
      const { error } = await supabase
        .from('generations')
        .insert({
          reference_image_url: referenceImages[0] ?? null,
          source_images_urls: referenceImages.length > 1 ? referenceImages.slice(1) : [],
          generated_thumbnails: publicUrls,
          prompt: prompt || null,
          model: model || 'nano-banana-pro',
          aspect_ratio: aspectRatio || '16:9',
          resolution: resolution || '2K',
        })
        .select()
        .single();

      if (error) console.warn('Database save failed (non-critical):', error);
    } catch (dbError) {
      console.warn('Database operation failed (non-critical):', dbError);
    }
  }

  return publicUrls;
}
