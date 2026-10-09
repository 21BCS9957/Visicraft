import 'server-only';

import type { createServiceClient } from '@/lib/supabase/server';
import { isMusicFailure, readAspect, readVideoReview, type StudioVideo, type VideoHistoryPage, type VideoTake } from '@/lib/video/shared';
import type { VideoQuality } from '@/lib/videoModels';

/**
 * A user's videos, newest first: each prepared video (waiting for approval, then its render),
 * product video ads made before the approval step, and quick image-to-video clips, with the
 * upgrades made from each as extra takes. Read-only: the Studio's history (the signed-in user)
 * and the admin's team view (a team member) both use it.
 */

/** Usage rows that start a video; `video_upgrade` rows are takes of one of these. */
const VIDEO_MODES = ['video_review', 'product_video_ad', 'img2vid'];

const PAGE = 24;
/**
 * How long a render without a saved file is still followed. Seedance keeps a finished video
 * for 24 hours and Veo for 2 days, so within this window the file can still be fetched and
 * saved when the Studio opens; after it, polling could only find an expired job (and trigger
 * a needless retry or refund), so such a take counts as lost.
 */
const RENDER_WINDOW_MS = 20 * 60 * 60 * 1000;

interface Row {
  id: string | number;
  created_at: string;
  model: string | null;
  credit_cost: number | null;
  metadata: Record<string, unknown> | null;
}

const text = (meta: Record<string, unknown>, key: string) => (typeof meta[key] === 'string' && meta[key] ? (meta[key] as string) : null);

function operationIdsOf(meta: Record<string, unknown>): string[] {
  const list = Array.isArray(meta.operationIds) ? meta.operationIds.filter((id): id is string => typeof id === 'string') : [];
  const single = text(meta, 'operationId');
  return single && !list.includes(single) ? [...list, single] : list;
}

/** Why a take failed, in plain words (a music-check stop is explained, whatever its wording). */
function failureText(reason: string | null, credits: number): string | null {
  if (!reason) return null;
  if (isMusicFailure(reason)) {
    return `Seedance’s music check stopped this video: the music it generated sounded too close to an existing song. The video itself was fine. ${credits ? `Your ${credits} video credits were refunded. ` : ''}Tap “Try again”: the sound comes out different every time.`;
  }
  return reason;
}

/** The take a usage row rendered, if it started one. */
function takeOf(row: Row, meta: Record<string, unknown>, review: Record<string, unknown> | null): VideoTake | null {
  const ids = operationIdsOf(meta);
  const operationId = ids.at(-1);
  if (!operationId) return null;
  const urls = meta.videoUrls && typeof meta.videoUrls === 'object' ? (meta.videoUrls as Record<string, unknown>) : {};
  const saved = typeof urls[operationId] === 'string' ? (urls[operationId] as string) : null;
  const startedAt = text(meta, 'approvedAt') ?? row.created_at;
  const status: VideoTake['status'] = saved
    ? 'ready'
    : meta.refunded === true
      ? 'failed'
      : Date.now() - Date.parse(startedAt) < RENDER_WINDOW_MS
        ? 'rendering'
        : 'unsaved';
  return {
    key: String(row.id),
    operationId,
    status,
    url: saved,
    model: text(meta, 'videoModel') ?? row.model ?? (typeof review?.model === 'string' ? review.model : 'veo'),
    quality: (text(meta, 'quality') ?? (typeof review?.quality === 'string' ? review.quality : '1080p')) as VideoQuality,
    durationSeconds: Number(meta.durationSeconds) || Number(review?.durationSeconds) || 8,
    aspectRatio: readAspect(text(meta, 'aspectRatio') ?? review?.aspectRatio),
    nativeDraft: meta.nativeDraft === true,
    credits: Number(row.credit_cost) || 0,
    error: failureText(text(meta, 'refundReason'), Number(row.credit_cost) || 0),
    createdAt: startedAt,
    prompt: text(meta, 'prompt'),
    frames: Array.isArray(meta.referenceImageUrls) && meta.referenceImageUrls.length
      ? (meta.referenceImageUrls as unknown[]).filter((url): url is string => typeof url === 'string')
      : [text(meta, 'heroUrl')].filter((url): url is string => Boolean(url)),
    edited: meta.redraft === true,
    from: text(meta, 'upgradedFrom'),
  };
}

function videoOf(row: Row): StudioVideo {
  const meta = row.metadata ?? {};
  const review = meta.review && typeof meta.review === 'object' ? (meta.review as Record<string, unknown>) : null;
  const frames = Array.isArray(review?.frames) ? (review.frames as Array<Record<string, unknown>>) : [];
  const pending = meta.mode === 'video_review' && meta.pending === true;
  const take = pending ? null : takeOf(row, meta, review);
  return {
    id: String(row.id),
    createdAt: row.created_at,
    title: text(meta, 'productTitle'),
    style: text(meta, 'madeStyle') ?? text(meta, 'videoStyle'),
    poster: text(meta, 'heroFrameUrl') ?? text(meta, 'heroUrl') ?? (typeof frames[0]?.url === 'string' ? (frames[0].url as string) : null),
    review: pending ? readVideoReview(row.id, review) : null,
    cancelled: meta.cancelled === true,
    prompt: text(meta, 'prompt') ?? (typeof review?.prompt === 'string' ? review.prompt : null),
    settings: {
      model: text(meta, 'requestedVideoModel') ?? text(meta, 'videoModel') ?? (typeof review?.model === 'string' ? review.model : row.model ?? 'veo-3.1-generate-001'),
      quality: (text(meta, 'quality') ?? (typeof review?.quality === 'string' ? review.quality : '1080p')) as VideoQuality,
      durationSeconds: Number(meta.durationSeconds) || Number(review?.durationSeconds) || 8,
      aspectRatio: readAspect(text(meta, 'aspectRatio') ?? review?.aspectRatio),
      style: text(meta, 'videoStyle') ?? 'any',
    },
    takes: take ? [take] : [],
    retryable: meta.mode === 'video_review' && !pending && Boolean(review) && (meta.refunded === true || meta.cancelled === true),
    plan: planOf(row, review),
  };
}

/** How the video was planned (reference images or a first frame), for editing it into a new draft. */
function planOf(row: Row, review: Record<string, unknown> | null): StudioVideo['plan'] {
  const read = review ? readVideoReview(row.id, review) : null;
  return read ? { mode: read.mode, frames: read.frames, garment: read.garment } : null;
}

type Db = ReturnType<typeof createServiceClient>;

/** One page of a user's videos (24), optionally of one project, older than `before`. */
export async function loadVideoHistory(admin: Db, userId: string, options: { projectId?: string | null; before?: string | null } = {}): Promise<VideoHistoryPage> {
  const { projectId, before } = options;

  let query = admin
    .from('usage_logs')
    .select('id,created_at,model,credit_cost,metadata')
    .eq('user_id', userId)
    .eq('feature', 'video_generation')
    .in('metadata->>mode', VIDEO_MODES)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (projectId && /^[0-9a-f-]{36}$/i.test(projectId)) query = query.eq('metadata->>projectId', projectId);
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const page = rows.slice(0, PAGE);
  const all = page.map(videoOf);

  // Upgrades come after the video they were made from, so everything since this page's oldest
  // video covers its upgrades (and upgrades of upgrades).
  if (page.length) {
    const oldest = page.at(-1)!.created_at;
    const upgrades = await admin
      .from('usage_logs')
      .select('id,created_at,model,credit_cost,metadata')
      .eq('user_id', userId)
      .eq('feature', 'video_generation')
      .eq('metadata->>mode', 'video_upgrade')
      .gte('created_at', oldest)
      .order('created_at', { ascending: true })
      .limit(300);
    if (upgrades.error) throw new Error(upgrades.error.message);

    const owner = new Map<string, StudioVideo>();
    page.forEach((row, index) => operationIdsOf(row.metadata ?? {}).forEach((id) => owner.set(id, all[index])));
    for (const row of (upgrades.data ?? []) as Row[]) {
      const meta = row.metadata ?? {};
      const parent = owner.get(text(meta, 'upgradedFrom') ?? '');
      const take = parent ? takeOf(row, meta, null) : null;
      if (!parent || !take) continue;
      parent.takes.push(take);
      operationIdsOf(meta).forEach((id) => owner.set(id, parent));
    }
  }

  // Videos whose file was never kept (made before the Studio saved them) are left out.
  const videos = all.filter((video) => video.review || video.cancelled || video.takes.some((take) => take.status !== 'unsaved'));
  return { videos, nextBefore: rows.length > PAGE ? page.at(-1)!.created_at : null };
}
