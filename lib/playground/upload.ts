'use client';

import { uploadFileWithSignedUrl } from '@/lib/supabase/storage';
import type { NewLibraryVideo } from './api';
import { MAX_LIBRARY_VIDEO_BYTES, MAX_LIBRARY_VIDEO_SECONDS, VIDEO_FRAME_COUNT, VIDEO_TYPES } from './libraryVideo';

/** Browser-side image and video uploads shared by references, the Library and the Video Studio. */

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

/** Opens a video in a hidden <video> until a frame can be drawn. */
function openVideo(src: string, crossOrigin: boolean): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    if (crossOrigin) video.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => reject(new Error('The video took too long to open.')), 30_000);
    video.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve(video);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('This video can’t be read in the browser. Save it as an MP4 (H.264) and try again.'));
    };
    video.src = src;
  });
}

function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Could not read a frame of the video.')), 10_000);
    video.onseeked = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.currentTime = seconds;
  });
}

async function drawFrame(video: HTMLVideoElement, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
  if (!blob) throw new Error('Could not read a frame of the video.');
  return blob;
}

/**
 * A video's length and size, a poster, and evenly spaced frames (JPEG), read in the browser:
 * the frames are what Claude looks at when it copies the video's shots.
 */
export async function captureVideoStills(src: string, options: { crossOrigin?: boolean; frames?: number } = {}): Promise<{
  durationSeconds: number;
  width: number;
  height: number;
  poster: Blob;
  frames: Array<{ blob: Blob; t: number }>;
}> {
  const video = await openVideo(src, Boolean(options.crossOrigin));
  try {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || !video.videoWidth) throw new Error('Could not read this video. Save it as an MP4 (H.264) and try again.');
    const count = options.frames ?? VIDEO_FRAME_COUNT;
    const frames: Array<{ blob: Blob; t: number }> = [];
    for (let i = 0; i < count; i++) {
      const t = Math.max(0, Math.min(duration - 0.05, ((i + 0.5) / count) * duration));
      await seekTo(video, t);
      frames.push({ blob: await drawFrame(video, 768), t: Math.round(t * 100) / 100 });
    }
    await seekTo(video, Math.min(1, duration * 0.1));
    const poster = await drawFrame(video, 960);
    return { durationSeconds: Math.round(duration * 100) / 100, width: video.videoWidth, height: video.videoHeight, poster, frames };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

const jpeg = (blob: Blob, name: string) => new File([blob], name, { type: 'image/jpeg' });

/** Uploads the poster and frames of a video; in preview mode they stay local object URLs. */
async function uploadStills(stills: Awaited<ReturnType<typeof captureVideoStills>>, base: string, preview: boolean) {
  const upload = (blob: Blob, name: string) => (preview ? Promise.resolve(URL.createObjectURL(blob)) : uploadFileWithSignedUrl(jpeg(blob, name), 'source-images'));
  const [posterUrl, ...frameUrls] = await Promise.all([
    upload(stills.poster, `${base}-poster.jpg`),
    ...stills.frames.map((frame, i) => upload(frame.blob, `${base}-frame-${i + 1}.jpg`)),
  ]);
  return { posterUrl, frames: stills.frames.map((frame, i) => ({ url: frameUrls[i], t: frame.t })) };
}

/**
 * Uploads a video for the Library (MP4, MOV or WebM, up to 50 MB and 3 minutes) with a
 * poster and 12 frames taken from it. In preview mode nothing leaves the browser.
 */
export async function uploadLibraryVideo(file: File, options: { preview?: boolean } = {}): Promise<NewLibraryVideo> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error(`${file.name}: use an MP4, MOV or WebM video.`);
  if (file.size > MAX_LIBRARY_VIDEO_BYTES) throw new Error(`${file.name} is larger than ${MAX_LIBRARY_VIDEO_BYTES / 1024 / 1024} MB.`);
  const local = URL.createObjectURL(file);
  const preview = Boolean(options.preview);
  try {
    const stills = await captureVideoStills(local);
    if (stills.durationSeconds > MAX_LIBRARY_VIDEO_SECONDS + 1) throw new Error(`${file.name} is longer than ${MAX_LIBRARY_VIDEO_SECONDS / 60} minutes.`);
    const base = file.name.replace(/\.\w+$/, '').slice(0, 120) || 'video';
    const [url, uploaded] = await Promise.all([
      preview ? Promise.resolve(local) : uploadFileWithSignedUrl(file, 'source-video'),
      uploadStills(stills, base, preview),
    ]);
    return {
      url,
      name: base.slice(0, 160),
      posterUrl: uploaded.posterUrl,
      durationSeconds: stills.durationSeconds,
      width: stills.width,
      height: stills.height,
      mimeType: file.type,
      sizeBytes: file.size,
      frames: uploaded.frames,
      source: 'upload',
    };
  } finally {
    if (!preview) URL.revokeObjectURL(local);
  }
}

/**
 * A video the Video Studio rendered (already in our storage), ready for the Library: its
 * poster and frames are taken here. If the browser can't read its frames, it is saved
 * without them; Gemini can still watch it.
 */
export async function libraryVideoFromUrl(url: string, name: string, options: { preview?: boolean } = {}): Promise<NewLibraryVideo> {
  const base = name.replace(/[^\w\- ]+/g, '').trim().slice(0, 120) || 'video';
  const stills = await captureVideoStills(url, { crossOrigin: !options.preview }).catch((error) => {
    console.warn('Could not take frames from the video; saving it without them:', error instanceof Error ? error.message : error);
    return null;
  });
  const uploaded = stills ? await uploadStills(stills, base, Boolean(options.preview)) : null;
  return {
    url,
    name: name.slice(0, 160) || 'Video',
    posterUrl: uploaded?.posterUrl ?? null,
    durationSeconds: stills?.durationSeconds ?? null,
    width: stills?.width ?? null,
    height: stills?.height ?? null,
    mimeType: 'video/mp4',
    sizeBytes: null,
    frames: uploaded?.frames ?? [],
    source: 'generated',
  };
}
