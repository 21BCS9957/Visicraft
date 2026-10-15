import type { FeedItem, LiveJob } from '@/lib/dashboard/types';
import { mainTake, studioVideoStatus, type VideoTake } from '@/lib/video/shared';

/** What every view needs to know about a generation, in one place. */

export const itemKey = (item: FeedItem) => `${item.kind}-${item.id}`;

/** A live job's key: a Playground run, or a video. */
export const jobKey = (job: LiveJob) => (job.kind === 'run' ? `run-${job.id}` : itemKey(job));

/** How many of a job's images have finished (done or failed); goes up as a run moves on. */
export const jobSettled = (job: LiveJob) => (job.kind === 'run' ? job.done + job.failed : 0);

/** Counts as generating: anything live except a run that has stopped moving (its tab was left). */
export const isGenerating = (job: LiveJob) => job.kind !== 'run' || !job.paused;

export type ItemState = { label: string; tone: 'live' | 'waiting' | 'failed' | 'neutral'; live: boolean };

/** The state of anything not simply finished (null when it is). */
export function itemState(item: FeedItem): ItemState | null {
  if (item.kind === 'image') {
    if (item.status === 'generating') return { label: 'Generating', tone: 'live', live: true };
    if (item.status === 'queued') return { label: 'Queued', tone: 'live', live: true };
    if (item.status === 'failed') return { label: 'Failed', tone: 'failed', live: false };
    if (item.status === 'cancelled') return { label: 'Cancelled', tone: 'neutral', live: false };
    return null;
  }
  const state = studioVideoStatus(item.video);
  if (state === 'review') return { label: 'Waiting for approval', tone: 'waiting', live: true };
  if (state === 'rendering') {
    const progress = item.video.takes.find((take) => take.status === 'rendering')?.progress;
    return { label: progress ? `Rendering ${progress}%` : 'Rendering', tone: 'live', live: true };
  }
  if (state === 'cancelled') return { label: 'Cancelled', tone: 'neutral', live: false };
  if (state === 'unsaved') return { label: 'No file kept', tone: 'neutral', live: false };
  if (state === 'failed') return { label: 'Failed', tone: 'failed', live: false };
  return null;
}

/** The take to play: the newest with a file. */
export function playableTake(item: FeedItem): VideoTake | null {
  if (item.kind !== 'video') return null;
  const take = mainTake(item.video);
  return take?.status === 'ready' && take.url ? take : null;
}

/** A still for the tile: the image's preview, or the video's poster (or its first planned frame). */
export function itemThumb(item: FeedItem): string | null {
  if (item.kind === 'image') return item.status === 'done' ? item.previewUrl ?? item.url : null;
  return item.video.poster ?? item.video.review?.frames[0]?.url ?? null;
}

/** The file itself (full-size image, or the video to play). */
export function itemFile(item: FeedItem): string | null {
  if (item.kind === 'image') return item.status === 'done' ? item.url ?? item.previewUrl : null;
  return playableTake(item)?.url ?? null;
}

/** Where it was made: the project, the video's title, or "Quick generation". */
export function itemTitle(item: FeedItem): string {
  if (item.kind === 'image') return item.projectName ?? (item.source === 'quick' ? 'Quick generation' : 'Playground');
  return item.video.title ?? item.projectName ?? 'Video';
}

export function itemPrompt(item: FeedItem): string | null {
  if (item.kind === 'image') return item.prompt;
  return item.video.prompt ?? item.video.review?.prompt ?? mainTake(item.video)?.prompt ?? null;
}

/** When the work started (for live timers). */
export function itemStartedAt(item: FeedItem): string {
  if (item.kind === 'image') return item.startedAt ?? item.createdAt;
  return item.video.takes.find((take) => take.status === 'rendering')?.createdAt ?? item.createdAt;
}

/** A video's length in seconds. */
export function videoSeconds(item: FeedItem): number | null {
  if (item.kind !== 'video') return null;
  return mainTake(item.video)?.durationSeconds ?? item.video.review?.durationSeconds ?? item.video.settings.durationSeconds ?? null;
}

/** "0:08", "1:05". */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** The error to show for a failed generation. */
export function itemError(item: FeedItem): string | null {
  // A finished image's "error" is a note (see itemNote), not a failure.
  if (item.kind === 'image') return item.status === 'done' ? null : item.error;
  return [...item.video.takes].reverse().find((take) => take.error)?.error ?? null;
}

/** A finished image's note, e.g. a keep-clear copy that had to keep its full size. */
export function itemNote(item: FeedItem): string | null {
  return item.kind === 'image' && item.status === 'done' ? item.error : null;
}
