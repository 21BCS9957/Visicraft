'use client';

import { Clapperboard, Download, Loader2, RefreshCw } from 'lucide-react';
import { videoStyleLabel } from '@/lib/videoStyles';
import { downloadUrl } from '@/lib/playground/api';
import { mainTake, studioVideoStatus, videoModelName, type StudioVideo, type StudioVideoStatus } from '@/lib/video/shared';
import { cx, IconButton, timeAgo } from '@/components/playground/ui';
import { takeLabel } from './VideoPlayerCard';

// Dark pills, so they read on any poster.
const BADGES: Record<StudioVideoStatus, { label: string; tone: string }> = {
  review: { label: 'Awaiting approval', tone: 'border-[#fff05a]/50 text-[#fff05a]' },
  rendering: { label: 'Rendering', tone: 'border-[#c8b8ff]/50 text-[#ddd2ff]' },
  ready: { label: 'Ready', tone: 'border-emerald-300/40 text-emerald-200' },
  failed: { label: 'Failed · refunded', tone: 'border-red-300/40 text-red-200' },
  cancelled: { label: 'Cancelled', tone: 'border-white/20 text-white/70' },
  unsaved: { label: 'Not saved', tone: 'border-white/20 text-white/65' },
};

function VideoCard({ video, selected, preview, onOpen, onReuse }: {
  video: StudioVideo;
  selected: boolean;
  preview: boolean;
  onOpen: () => void;
  /** Absent in a read-only view. */
  onReuse?: () => void;
}) {
  const status = studioVideoStatus(video);
  const take = mainTake(video);
  const badge = BADGES[status];
  const playable = status === 'ready' && take?.url;
  const rendering = video.takes.find((item) => item.status === 'rendering');
  // The cards are 9:16; a wider video is shown whole inside its card.
  const shape = take?.aspectRatio ?? video.settings.aspectRatio;
  return (
    <article className={cx('group relative', selected && 'rounded-[20px] ring-2 ring-[#fff05a]/60 ring-offset-2 ring-offset-[#08080a]')}>
      <button type="button" onClick={onOpen} className="relative block aspect-[9/16] w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#141418] !p-0 text-left">
        {playable ? (
          <video
            src={take.url ?? undefined}
            poster={video.poster ?? undefined}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(event) => { event.currentTarget.play().catch(() => undefined); }}
            onMouseLeave={(event) => { event.currentTarget.pause(); }}
            className={cx('h-full w-full', shape === '9:16' ? 'object-cover' : 'object-contain')}
          />
        ) : video.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.poster} alt="" loading="lazy" className={cx('h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]', status !== 'review' && status !== 'rendering' && 'opacity-60')} />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><Clapperboard className="h-6 w-6 text-white/25" /></div>
        )}
        <span className={cx('absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border bg-black/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-md', badge.tone)}>
          {status === 'rendering' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {badge.label}{status === 'rendering' && typeof rendering?.progress === 'number' ? ` ${rendering.progress}%` : ''}
        </span>
        {take && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-md">
            {take.durationSeconds}s · {takeLabel(take)}{shape !== '9:16' ? ` · ${shape}` : ''}
          </span>
        )}
      </button>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {playable && take?.url && (
          <a
            href={preview ? take.url : downloadUrl(take.url, `visicraft-video-${take.quality}${shape === '9:16' ? '' : `-${shape.replace(':', 'x')}`}.mp4`)}
            download
            aria-label="Download"
            title="Download"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/75"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
        {onReuse && <IconButton label="Use these settings again" tone="solid" onClick={onReuse}><RefreshCw className="h-3.5 w-3.5" /></IconButton>}
      </div>
      <button type="button" onClick={onOpen} className="mt-2 block w-full min-w-0 !p-0 text-left">
        <p className="truncate text-sm text-white/90">{video.title ?? 'Untitled video'}</p>
        <p className="truncate text-[11px] text-white/40">
          {[video.style ? videoStyleLabel(video.style) : null, videoModelName(take?.model ?? video.review?.model ?? video.settings.model), timeAgo(video.createdAt)].filter(Boolean).join(' · ')}
        </p>
      </button>
    </article>
  );
}

export function VideoHistory({ videos, selectedId, preview, loadingMore, hasMore, onOpen, onReuse, onLoadMore, title = 'Your videos', owner = true }: {
  videos: StudioVideo[] | null;
  selectedId: string | null;
  preview: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onOpen: (video: StudioVideo) => void;
  /** Absent in a read-only view (the admin looking at a team member's videos). */
  onReuse?: (video: StudioVideo) => void;
  onLoadMore: () => void;
  title?: string;
  /** The viewer's own videos ("waiting for your approval"). */
  owner?: boolean;
}) {
  const waiting = videos?.filter((video) => studioVideoStatus(video) === 'review').length ?? 0;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-light text-white">{title}</h2>
        {videos && videos.length > 0 && <span className="text-xs text-white/40">{videos.length}{hasMore ? '+' : ''}</span>}
        {waiting > 0 && <span className="text-xs text-[#fff05a]/80">{waiting} waiting for {owner ? 'your ' : ''}approval</span>}
      </div>
      {videos === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4" aria-busy="true" aria-label="Loading your videos">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="playground-shimmer aspect-[9/16] rounded-[18px] border border-white/6 bg-white/[0.03]" />)}
        </div>
      ) : videos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">{owner ? 'Videos you make appear here, with their drafts and upgrades.' : 'No videos here yet.'}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} selected={video.id === selectedId} preview={preview} onOpen={() => onOpen(video)} onReuse={onReuse && (() => onReuse(video))} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={onLoadMore} disabled={loadingMore} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/75 hover:bg-white/8 disabled:opacity-50">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Load older videos
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
