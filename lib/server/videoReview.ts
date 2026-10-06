import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import type { VideoEngine, VideoQuality } from '@/lib/videoModels';

/**
 * A video waiting for the user's approval: the frame or reference images, the exact prompt
 * and the render settings the pipeline chose. It is saved as a usage row that charges
 * nothing; approving it (POST /api/video/render) renders the video and turns the row into
 * that video's charge, so retries, refunds and upgrades find it by operation id as usual.
 */

export interface VideoReviewFrame {
  url: string;
  label: string;
  /**
   * What it is, for the approval card: one of the user's photos, a close-up cut from one, a
   * scene image made for a shot, the hero (first or opening) frame, or the mannequin edit.
   */
  kind?: 'photo' | 'crop' | 'scene' | 'frame' | 'mannequin';
}

/** The plan in plain words, for the approval card (the prompt itself may be edited). */
export interface VideoReviewOutline {
  hook?: string;
  cast?: string;
  setting?: string;
  shots: Array<{ t: string; action: string; camera?: string }>;
  script?: string;
}

export interface VideoReview {
  engine: VideoEngine;
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  aspectRatio: string;
  /** first_frame: the clip starts from frames[0]. reference: the film is built from all frames (Image 1..N). */
  mode: 'first_frame' | 'reference';
  frames: VideoReviewFrame[];
  /** Exactly what the video model receives. */
  prompt: string;
  /** Veo only: what to keep out of the clip. */
  negativePrompt?: string;
  credits: number;
  /** Things to know before approving (a fallback, a limit of the model). */
  notes: string[];
  lastFramePinned: boolean;
  cameraFixed: boolean;
  realFace: boolean;
  needsAudio: boolean;
  /** Who wrote the prompt, shown on the approval card ("Written by Claude Opus 5.5 from …"). */
  writtenBy?: string;
  /** The reference videos the shots were copied from; never sent to the video model. */
  referenceVideos?: VideoReviewReference[];
  outline?: VideoReviewOutline;
}

export interface VideoReviewReference {
  id: string;
  name: string;
  posterUrl: string | null;
  /** The video itself, so the card can play it. */
  url?: string;
  shots?: number;
}

export async function saveVideoReview(user: User, review: VideoReview, extra: Record<string, unknown>): Promise<string> {
  const { data, error } = await createServiceClient()
    .from('usage_logs')
    .insert({
      user_id: user.id,
      user_email: user.email ?? null,
      provider: review.engine === 'seedance' ? 'byteplus' : 'google',
      model: review.model,
      feature: 'video_generation',
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      image_count: 0,
      video_seconds: 0,
      estimated_cost_usd: 0,
      credit_cost: 0,
      metadata: { ...extra, mode: 'video_review', pending: true, review, reviewCreatedAt: new Date().toISOString() },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not save the video for review: ${error?.message ?? 'no row returned'}`);
  return String(data.id);
}
