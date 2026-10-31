'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { AlertTriangle, Clock, Loader2, Play, X } from 'lucide-react';
import { mainTake, studioVideoStatus, videoModelName, type StudioVideo, type VideoTake } from '@/lib/video/shared';
import { videoQualityLabel, type FinalQuality } from '@/lib/videoModels';
import { cx, timeAgo } from '@/components/playground/ui';
import { VideoPlayerCard } from '@/components/video-studio/VideoPlayerCard';

/**
 * The Create tab's history, like Higgsfield's: every video made here, newest first, playing
 * on hover; a render in progress shows its progress. A card opens the full player (takes,
 * download, upgrade a draft, try again).
 */

function Card({ video, fresh, sample, onOpen }: { video: StudioVideo; fresh: boolean; sample: boolean; onOpen: () => void }) {
  const take = mainTake(video);
  const status = studioVideoStatus(video);
  const ref = useRef<HTMLVideoElement>(null);
  const [posterBroken, setPosterBroken] = useState(false);
  const rendering = video.takes.find((known) => known.status === 'rendering');
  const ready = status === 'ready' && take?.url;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-video-id={video.id}
      onPointerEnter={() => void ref.current?.play().catch(() => undefined)}
      onPointerLeave={() => {
        if (ref.current) {
          ref.current.pause();
          ref.current.currentTime = 0;
        }
      }}
      className={cx(
        'group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border bg-[#111114] !p-0 text-left transition-colors hover:border-white/20',
        fresh ? 'border-[#fff05a] ring-2 ring-[#fff05a]/40' : 'border-white/[0.06]'
      )}
    >
      {ready ? (
        <video ref={ref} src={take.url!} poster={video.poster ?? undefined} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : video.poster && !posterBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.poster} alt="" loading="lazy" onError={() => setPosterBroken(true)} className={cx('h-full w-full object-cover', rendering && 'scale-105 blur-[2px] brightness-50')} />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(120%_90%_at_80%_10%,#2a2a30,#0e0e11_70%)]" />
      )}

      {rendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#fff05a]" />
          <p className="text-xs font-medium text-white">{rendering.message ?? 'Rendering…'}</p>
          <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-[#fff05a] transition-[width] duration-700" style={{ width: `${Math.max(5, rendering.progress ?? 5)}%` }} />
          </div>
        </div>
      )}
      {(status === 'failed' || status === 'unsaved' || status === 'cancelled') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 px-4 text-center">
          <AlertTriangle className="h-5 w-5 text-white/60" />
          <p className="text-xs text-white/75">{status === 'cancelled' ? 'Cancelled' : status === 'unsaved' ? 'No file kept' : 'Didn’t render · refunded'}</p>
        </div>
      )}
      {ready && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-100 backdrop-blur-sm transition-opacity group-hover:opacity-0">
          <Play className="h-4 w-4 fill-current" />
        </span>
      )}

      {(fresh || sample) && (
        <span className="absolute right-2.5 top-2.5 flex gap-1">
          {fresh && <span className="rounded-md bg-[#fff05a] px-1.5 py-0.5 text-[10px] font-bold text-[#1f1c00]">New</span>}
          {sample && <span className="rounded-md bg-sky-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-sky-950">Sample</span>}
        </span>
      )}
      {take && (
        <span className="absolute left-2.5 top-2.5 flex gap-1">
          <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">{take.durationSeconds}s</span>
          <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-md', take.quality === 'draft' ? 'bg-[#fff05a] text-[#1f1c00]' : 'bg-black/60 text-white')}>{videoQualityLabel(take.quality)}</span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-8">
        <span className="line-clamp-2 block text-[12px] leading-snug text-white/90">{video.title || video.prompt || 'Video'}</span>
        <span className="mt-1 flex items-center gap-1 text-[10px] text-white/50">
          <Clock className="h-2.5 w-2.5" /> {timeAgo(video.createdAt)}{take ? ` · ${videoModelName(take.model)}` : ''}
        </span>
      </span>
    </button>
  );
}

export function CreateHistory({ videos, freshId, onSeen, preview, busy, credits, hasMore, loadingMore, onLoadMore, onUpgrade, onTryAgain, onReuse }: {
  videos: StudioVideo[];
  /** The video just started here (highlighted until opened). */
  freshId: string | null;
  onSeen: (id: string) => void;
  preview: boolean;
  busy: boolean;
  credits: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onUpgrade: (video: StudioVideo, take: VideoTake, quality: FinalQuality) => void;
  onTryAgain: (video: StudioVideo) => void;
  onReuse: (video: StudioVideo) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = videos.find((video) => video.id === openId) ?? null;
  const openShape = open ? mainTake(open)?.aspectRatio ?? open.settings.aspectRatio : null;
  const sentinel = useRef<HTMLDivElement>(null);

  // Older videos load as the end of the grid comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {videos.map((video) => (
          <Card
            key={video.id}
            video={video}
            fresh={video.id === freshId}
            sample={preview}
            onOpen={() => {
              setOpenId(video.id);
              onSeen(video.id);
            }}
          />
        ))}
      </div>
      <div ref={sentinel} className="h-8" />
      {loadingMore && <div className="flex justify-center py-4 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /></div>}

      <Dialog.Root open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content
            className={cx(
              'fixed left-1/2 top-1/2 z-[81] flex max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#101013] text-white outline-none',
              // A tall video sits beside its takes and buttons, which need room; a wide one stacks.
              openShape === '9:16' ? 'w-[min(880px,calc(100vw-24px))]' : 'w-[min(640px,calc(100vw-24px))]'
            )}
          >
            <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
              <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-medium">{open?.title || 'Your video'}</Dialog.Title>
              <Dialog.Description className="sr-only">Watch, download or upgrade this video.</Dialog.Description>
              <Dialog.Close className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              {open && (
                <VideoPlayerCard
                  video={open}
                  preview={preview}
                  busy={busy}
                  credits={credits}
                  onUpgrade={(take, quality) => onUpgrade(open, take, quality)}
                  onTryAgain={open.retryable ? () => {
                    setOpenId(null);
                    onTryAgain(open);
                  } : undefined}
                  onReuse={() => {
                    setOpenId(null);
                    onReuse(open);
                  }}
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
