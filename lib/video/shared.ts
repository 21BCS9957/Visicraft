import { getCreditCost } from '@/lib/credits/calculator';
import { SEEDANCE_MODELS, seedanceSpec, videoEngineOf, type VideoQuality } from '@/lib/videoModels';

/**
 * Video Studio types and pure helpers, shared by the browser and the history API. A video is
 * one usage row (a review waiting for approval, then its render) plus any upgrades made from it.
 */

/** Seedance 2.5 renders from the product photos and Claude's prompt; the default for new projects. */
export const DEFAULT_VIDEO_MODEL = 'dreamina-seedance-2-5-260628';

/** The video models the app renders with, Seedance 2.5 first. The Veo id only marks the family; the server picks the best Veo. */
export const VIDEO_MODELS: Array<{ id: string; name: string; blurb: string }> = [
  ...SEEDANCE_MODELS.filter((spec) => spec.id === DEFAULT_VIDEO_MODEL).map((spec) => ({
    id: spec.id,
    name: spec.name,
    blurb: `${spec.minSeconds}–${spec.maxSeconds} s · sound · builds the film from your product photos · no real faces`,
  })),
  { id: 'veo-3.1-generate-001', name: 'Google Veo', blurb: 'Veo 3.1 or the newest your key allows · 4–8 s · sound · real models welcome' },
  ...SEEDANCE_MODELS.filter((spec) => spec.id !== DEFAULT_VIDEO_MODEL).map((spec) => ({
    id: spec.id,
    name: spec.name,
    blurb: [
      `${spec.minSeconds}–${spec.maxSeconds} s`,
      spec.audio ? 'sound' : 'silent',
      spec.realFaces ? 'real models welcome' : 'no real faces',
    ].join(' · '),
  })),
];

/** The hero frame of a video ad is one 2K Nano Banana Pro image, charged when planning. */
export const HERO_FRAME_CREDITS = getCreditCost('nano-banana-pro', '2K');

export function videoModelName(model: string): string {
  if (videoEngineOf(model) === 'seedance') return seedanceSpec(model).name;
  return /fast/.test(model) ? 'Veo Fast' : 'Veo';
}

/** What the server says it rendered with. */
export interface VideoInfo {
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  /** A Seedance 2.5 draft: upgrading keeps this exact take. */
  nativeDraft: boolean;
}

export function readVideoInfo(raw: unknown): VideoInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.model !== 'string' || typeof v.quality !== 'string') return null;
  return {
    model: v.model,
    quality: v.quality as VideoQuality,
    durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : 8,
    nativeDraft: v.nativeDraft === true,
  };
}

/** A video the pipeline prepared, waiting for the user's approval before it renders. */
export interface VideoReviewState {
  id: string;
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  /** first_frame: the clip starts from the frame. reference: the film is built from all images (Image 1..N). */
  mode: 'first_frame' | 'reference';
  frames: Array<{ url: string; label: string }>;
  prompt: string;
  negativePrompt?: string;
  credits: number;
  notes: string[];
  /** Who wrote the prompt ("Written by Claude Opus 5.5 from …"). */
  writtenBy?: string;
}

export function readVideoReview(id: unknown, raw: unknown): VideoReviewState | null {
  if ((typeof id !== 'string' && typeof id !== 'number') || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.prompt !== 'string' || typeof r.model !== 'string' || !Array.isArray(r.frames)) return null;
  return {
    id: String(id),
    model: r.model,
    quality: (typeof r.quality === 'string' ? r.quality : '1080p') as VideoQuality,
    durationSeconds: typeof r.durationSeconds === 'number' ? r.durationSeconds : 8,
    mode: r.mode === 'reference' ? 'reference' : 'first_frame',
    frames: (r.frames as Array<Record<string, unknown>>)
      .filter((f) => typeof f?.url === 'string')
      .map((f) => ({ url: f.url as string, label: typeof f.label === 'string' ? f.label : '' })),
    prompt: r.prompt,
    negativePrompt: typeof r.negativePrompt === 'string' ? r.negativePrompt : undefined,
    credits: typeof r.credits === 'number' ? r.credits : 0,
    notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string') : [],
    writtenBy: typeof r.writtenBy === 'string' ? r.writtenBy : undefined,
  };
}

/**
 * The prompt after reference image `removed` (1-based) is dropped: its mentions go, and
 * later images move up one number, so every "Image k" still points at the right picture.
 */
export function dropImageReference(prompt: string, removed: number): string {
  return prompt
    .replace(/^Opening scene: Image (\d+)\.\n*/m, (line, n) => (Number(n) === removed ? '' : line))
    .replace(/\s*\(Image (\d+)\)/g, (match, n) => (Number(n) === removed ? '' : match))
    .replace(/\bImage (\d+)\b/g, (match, n) => (Number(n) > removed ? `Image ${Number(n) - 1}` : match));
}

/** One render of a video: the first take, or an upgrade made from it. */
export interface VideoTake {
  /** Stable key: the usage row id, or `op:<operation id>` for a take started on this page. */
  key: string;
  operationId: string;
  /** unsaved: finished before videos were kept, so there is no file to show. */
  status: 'rendering' | 'ready' | 'failed' | 'unsaved';
  url: string | null;
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  nativeDraft: boolean;
  credits: number;
  error: string | null;
  createdAt: string;
  /** Live, while this page polls it. */
  progress?: number;
  message?: string;
}

export interface StudioVideo {
  id: string;
  createdAt: string;
  title: string | null;
  style: string | null;
  poster: string | null;
  /** Set while the video waits for approval. */
  review: VideoReviewState | null;
  cancelled: boolean;
  prompt: string | null;
  /** What "use these settings again" restores. */
  settings: { model: string; quality: VideoQuality; durationSeconds: number; style: string };
  /** The first take, then upgrades, oldest first. */
  takes: VideoTake[];
}

export type StudioVideoStatus = 'review' | 'rendering' | 'ready' | 'failed' | 'cancelled' | 'unsaved';

export function studioVideoStatus(video: StudioVideo): StudioVideoStatus {
  if (video.review) return 'review';
  if (video.cancelled) return 'cancelled';
  if (video.takes.some((take) => take.status === 'rendering')) return 'rendering';
  if (video.takes.some((take) => take.status === 'ready')) return 'ready';
  if (video.takes[0]?.status === 'unsaved') return 'unsaved';
  return 'failed';
}

/** The take to show first: the newest one with a file, else the newest. */
export function mainTake(video: StudioVideo): VideoTake | null {
  return [...video.takes].reverse().find((take) => take.status === 'ready') ?? video.takes.at(-1) ?? null;
}

export interface VideoHistoryPage {
  videos: StudioVideo[];
  nextBefore: string | null;
}
