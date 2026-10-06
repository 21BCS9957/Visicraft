import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/usage';
import { saveVideoReview, type VideoReview, type VideoReviewFrame } from '@/lib/server/videoReview';
import { isMusicFailure, withoutMusic } from '@/lib/video/shared';
import { videoCredits, videoModelOptions } from '@/lib/videoModels';

/** What a review row carries into its new try (history, project, style, references). */
const CARRIED = ['requestedVideoModel', 'videoStyle', 'madeStyle', 'sensitive', 'exactGarment', 'heroFrameUrl', 'referenceVideoIds', 'sceneImages', 'modelledOn', 'productTitle', 'storyboardHook', 'projectId', 'promptWriter'];

/**
 * "Try again" on a video that didn't render (or was cancelled): its approved plan comes back
 * for approval as a new video, with the same images and prompt (the user's edits included),
 * and without music when Seedance's music check stopped it. Nothing is charged until approval.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as { videoId?: unknown };
    const videoId = typeof body.videoId === 'string' || typeof body.videoId === 'number' ? String(body.videoId) : '';
    if (!videoId) return NextResponse.json({ error: 'videoId is required.' }, { status: 400 });

    const { data } = await createServiceClient()
      .from('usage_logs')
      .select('id,metadata')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .eq('feature', 'video_generation')
      .limit(1);
    const row = data?.[0] as { id: string | number; metadata: Record<string, unknown> } | undefined;
    const meta = row?.metadata;
    if (!row || !meta || meta.mode !== 'video_review' || !meta.review || typeof meta.review !== 'object') {
      return NextResponse.json({ error: 'This video can’t be tried again. Plan a new one instead.' }, { status: 404 });
    }
    if (meta.pending === true) return NextResponse.json({ error: 'This video is still waiting for your approval.' }, { status: 409 });
    if (meta.refunded !== true && meta.cancelled !== true) {
      return NextResponse.json({ error: 'Only a video that didn’t render (or was cancelled) can be tried again.' }, { status: 409 });
    }

    const review = meta.review as VideoReview;
    const text = (key: string) => (typeof meta[key] === 'string' && (meta[key] as string).trim() ? (meta[key] as string) : null);
    const reason = text('refundReason') ?? text('lastError') ?? '';
    const music = isMusicFailure(reason);
    // A retry overwrote `prompt` on older rows, so without `approvedPrompt` the plan's own prompt is used.
    const approved = text('approvedPrompt') ?? (Number(meta.retries) > 0 ? null : text('prompt')) ?? review.prompt;
    const sent = review.mode === 'reference'
      ? (Array.isArray(meta.referenceImageUrls) ? (meta.referenceImageUrls as unknown[]).filter((url): url is string => typeof url === 'string') : [])
      : [text('heroUrl')].filter((url): url is string => Boolean(url));
    const frames: VideoReviewFrame[] = sent.length
      ? sent.map((url) => review.frames.find((frame) => frame.url === url) ?? { url, label: 'Your upload', kind: 'photo' })
      : review.frames;
    const note = music
      ? 'The last take was stopped by Seedance’s music check (its music sounded like an existing song), so this one has no music. You can describe music again in the prompt.'
      : meta.cancelled === true
        ? 'Your plan from before, ready to render. Change anything before you approve.'
        : 'The last take did not render. Change the shots that might have caused it before you approve.';
    // The length it was approved at (the user may have picked another one than the plan's).
    const approvedSeconds = Number(meta.durationSeconds);
    const seconds = videoModelOptions(review.model).durations.includes(approvedSeconds) ? approvedSeconds : review.durationSeconds;
    const next: VideoReview = {
      ...review,
      durationSeconds: seconds,
      credits: videoCredits(review.model, review.quality, seconds, review.aspectRatio),
      lastFramePinned: review.lastFramePinned && (review.engine !== 'veo' || seconds === 8),
      frames,
      prompt: music ? withoutMusic(approved) : approved,
      negativePrompt: text('negativePrompt') ?? review.negativePrompt,
      notes: [note, ...review.notes.filter((existing) => existing !== note)],
    };
    const extra = Object.fromEntries(CARRIED.filter((key) => key in meta).map((key) => [key, meta[key]]));
    const reviewId = await saveVideoReview(user, next, { ...extra, retriedFrom: String(row.id) });
    return NextResponse.json({ reviewId, review: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The video could not be prepared again';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
