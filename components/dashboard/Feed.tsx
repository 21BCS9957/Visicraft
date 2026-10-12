'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clapperboard, Clock, Download, Image as ImageIcon, Loader2, Radio } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import type { FeedImage, FeedItem, FeedStatus, FeedType, FeedVideo, TeamMember } from '@/lib/dashboard/types';
import { downloadUrl } from '@/lib/playground/api';
import { mainTake, studioVideoStatus } from '@/lib/video/shared';
import { Chip, cx, timeAgo } from '@/components/playground/ui';
import { ImageViewer } from '@/components/shared/ImageViewer';
import { VideoPlayerCard } from '@/components/video-studio/VideoPlayerCard';
import { takeLabel } from '@/components/video-studio/VideoPlayerCard';
import { elapsed, failureOf, MemberAvatar, Overlay, type Failure } from './parts';

/** How often "Live now" asks what is generating. */
const LIVE_EVERY_MS = 5000;

type Members = Map<string, TeamMember>;

/** A clock that ticks every second while something live is shown (for "running 1m 20s"). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function Who({ member, fallback }: { member?: TeamMember; fallback: string }) {
  const email = member?.email ?? fallback;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <MemberAvatar name={member?.name ?? null} email={email} url={member?.avatarUrl ?? null} size="sm" />
      <span className="truncate">{member?.name ?? email.split('@')[0]}</span>
    </span>
  );
}

/** A video's state in a word. */
function videoState(item: FeedVideo): { label: string; tone: string; live: boolean } {
  const state = studioVideoStatus(item.video);
  const rendering = item.video.takes.find((take) => take.status === 'rendering');
  if (state === 'review') return { label: 'Waiting for approval', tone: 'text-[#fff05a] border-[#fff05a]/30', live: true };
  if (state === 'rendering') return { label: rendering?.progress ? `Rendering ${rendering.progress}%` : 'Rendering', tone: 'text-[#d9ccff] border-[#c8b8ff]/30', live: true };
  if (state === 'ready') return { label: 'Ready', tone: 'text-emerald-200 border-emerald-300/30', live: false };
  if (state === 'cancelled') return { label: 'Cancelled', tone: 'text-white/60 border-white/15', live: false };
  if (state === 'unsaved') return { label: 'No file kept', tone: 'text-white/60 border-white/15', live: false };
  return { label: 'Failed', tone: 'text-red-200 border-red-300/30', live: false };
}

function imageState(item: FeedImage): { label: string; tone: string; live: boolean } | null {
  if (item.status === 'generating') return { label: 'Generating', tone: 'text-[#fff05a] border-[#fff05a]/30', live: true };
  if (item.status === 'queued') return { label: 'Queued', tone: 'text-[#fff05a]/80 border-[#fff05a]/20', live: true };
  if (item.status === 'failed') return { label: 'Failed', tone: 'text-red-200 border-red-300/30', live: false };
  if (item.status === 'cancelled') return { label: 'Cancelled', tone: 'text-white/60 border-white/15', live: false };
  return null;
}

/** One generation, as a tile: thumbnail, state, who and where. */
export function GenerationCard({ item, member, now, onOpen }: { item: FeedItem; member?: TeamMember; now: number; onOpen: () => void }) {
  const state = item.kind === 'image' ? imageState(item) : videoState(item);
  const take = item.kind === 'video' ? mainTake(item.video) : null;
  const thumb = item.kind === 'image' ? item.previewUrl ?? item.url : item.video.poster;
  const ratio = item.kind === 'image' && item.aspectRatio ? item.aspectRatio.replace(':', ' / ') : item.kind === 'video' ? (take?.aspectRatio ?? item.video.settings.aspectRatio).replace(':', ' / ') : '1 / 1';
  const started = item.kind === 'image' ? item.startedAt ?? item.createdAt : item.video.takes.find((t) => t.status === 'rendering')?.createdAt ?? item.createdAt;
  return (
    <button type="button" onClick={onOpen} className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] !p-0 text-left transition-colors hover:border-white/20">
      <div className="relative w-full overflow-hidden bg-[#111115]" style={{ aspectRatio: ratio }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className={cx('h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]', state?.live && 'opacity-60')} />
        ) : (
          <div className="flex h-full items-center justify-center">
            {state?.live ? <Loader2 className="h-6 w-6 animate-spin text-white/30" /> : item.kind === 'video' ? <Clapperboard className="h-6 w-6 text-white/15" /> : <ImageIcon className="h-6 w-6 text-white/15" />}
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur-md">
          {item.kind === 'video' ? <Clapperboard className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
          {item.kind === 'video' ? (take ? `${take.durationSeconds}s · ${takeLabel(take)}` : 'Video') : item.model ?? 'Image'}
        </span>
        {state && (
          <span className={cx('absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border bg-black/70 px-2 py-0.5 text-[10px] backdrop-blur-md', state.tone)}>
            {state.live && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {state.label}{state.live && started ? ` · ${elapsed(started, now)}` : ''}
          </span>
        )}
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-white/70">
          <Who member={member} fallback="team member" />
          <span className="shrink-0 text-white/40">{timeAgo(item.createdAt)}</span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-white/50">
          {item.projectName ? <span className="text-white/70">{item.projectName} · </span> : null}
          {item.kind === 'image' ? item.prompt ?? '' : item.video.prompt ?? item.video.title ?? ''}
        </p>
      </div>
    </button>
  );
}

/** The detail of a generation: the image full size, or the video's player (read-only). */
export function GenerationDetail({ item, member, onClose }: { item: FeedItem; member?: TeamMember; onClose: () => void }) {
  if (item.kind === 'image') {
    if (!item.url) {
      return (
        <Overlay onClose={onClose}>
          <p className="text-sm text-white">{imageState(item)?.label ?? 'Image'}</p>
          <p className="mt-1 text-xs text-white/50">{member?.email} · {item.projectName ?? 'Playground'} · {timeAgo(item.createdAt)}</p>
          {item.error && <p className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{item.error}</p>}
          {item.prompt && <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-white/70">{item.prompt}</p>}
        </Overlay>
      );
    }
    return (
      <ImageViewer url={item.url} onClose={onClose}>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{item.model ?? 'Image'}{item.size ? ` · ${item.size}` : ''}</p>
        <p className="mt-1 text-xs text-white/60">{member?.email ?? 'team member'}</p>
        <p className="mt-0.5 text-xs text-white/45">{item.projectName ?? 'Playground'}{item.aspectRatio ? ` · ${item.aspectRatio}` : ''} · {timeAgo(item.createdAt)}</p>
        {item.prompt && <p className="mt-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-white/75">{item.prompt}</p>}
        <a href={downloadUrl(item.url, `gogrowth-${item.id.slice(0, 8)}.png`)} download className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white">
          <Download className="h-4 w-4" /> Download
        </a>
      </ImageViewer>
    );
  }
  const review = item.video.review;
  return (
    <Overlay onClose={onClose} wide>
      <p className="mb-3 text-xs text-white/55">{member?.email ?? 'team member'} · {item.projectName ?? 'Video'} · {timeAgo(item.createdAt)}</p>
      {review ? (
        <div className="rounded-[24px] border border-white/10 bg-[#111114] p-4">
          <p className="text-sm text-white">Planned, waiting for approval</p>
          <p className="mt-0.5 text-xs text-white/45">{review.durationSeconds}s · {review.aspectRatio} · nothing rendered yet</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {review.frames.map((frame) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={frame.url} src={frame.url} alt={frame.label} className="h-28 w-auto shrink-0 rounded-lg border border-white/10 object-cover" />
            ))}
          </div>
          <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-white/55">{review.prompt}</p>
        </div>
      ) : (
        <VideoPlayerCard video={item.video} preview={false} busy={false} credits={null} readOnly />
      )}
    </Overlay>
  );
}

/**
 * What is generating right now, asked for every few seconds while the tab is open. Calls
 * `onSettled` when something finishes, so the feed can pick it up.
 */
export function LiveNow({ account, members, onSettled }: { account?: string | null; members: Members; onSettled?: () => void }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const known = useRef<Set<string> | null>(null);
  const now = useNow(Boolean(items?.length));

  useEffect(() => {
    let stopped = false;
    let running = false;
    const check = async () => {
      // One check at a time: a slow one (it can take several seconds) is not overtaken by the
      // next tick, whose older-looking answer would make a live item seem finished.
      if (running) return;
      running = true;
      try {
        const snapshot = await dashboardApi.live(account);
        if (stopped) return;
        setFailure(null);
        const ids = new Set(snapshot.items.map((item) => item.id));
        // Something that was live is gone: it finished (or failed).
        if (known.current && [...known.current].some((id) => !ids.has(id))) onSettled?.();
        known.current = ids;
        setItems(snapshot.items);
      } catch (error) {
        if (!stopped) setFailure(failureOf(error));
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, LIVE_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [account, onSettled]);

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#111114] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-light text-white">
          <span className="relative flex h-2.5 w-2.5">
            {items?.length ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fff05a] opacity-60" /> : null}
            <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', items?.length ? 'bg-[#fff05a]' : 'bg-white/25')} />
          </span>
          Live now
        </h2>
        <span className="text-xs text-white/40">{items === null ? 'Checking…' : items.length ? `${items.length} generating` : 'Nothing generating right now'}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-white/30"><Radio className="h-3 w-3" /> updates every 5 s</span>
      </div>
      {failure && <p className="mt-3 text-xs text-red-200">{failure.message}</p>}
      {items && items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {items.map((item) => <GenerationCard key={item.id} item={item} member={members.get(item.userId)} now={now} onOpen={() => setOpen(item)} />)}
        </div>
      )}
      {open && <GenerationDetail item={open} member={members.get(open.userId)} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Everything made, newest first, with type and status filters (and the account, on the overview). */
export function GenerationFeed({ account, members, accountFilter = false, refreshKey = 0 }: {
  account?: string | null;
  members: Members;
  /** Show the account picker (the overview). */
  accountFilter?: boolean;
  /** Bump to reload the first page (something finished). */
  refreshKey?: number;
}) {
  const [type, setType] = useState<FeedType>('all');
  const [status, setStatus] = useState<FeedStatus>('all');
  const [picked, setPicked] = useState<string>('');
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const who = account ?? (picked || null);
  const now = useNow(Boolean(items?.some((item) => (item.kind === 'image' ? imageState(item)?.live : videoState(item).live))));

  useEffect(() => {
    let live = true;
    dashboardApi.feed({ account: who, type, status })
      .then((page) => {
        if (!live) return;
        setItems(page.items);
        setNextBefore(page.nextBefore);
        setFailure(null);
      })
      .catch((error) => live && setFailure(failureOf(error)));
    return () => {
      live = false;
    };
  }, [who, type, status, refreshKey]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await dashboardApi.feed({ account: who, type, status, before: nextBefore });
      setItems((current) => {
        const seen = new Set((current ?? []).map((item) => item.id));
        return [...(current ?? []), ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextBefore(page.nextBefore);
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const accounts = useMemo(() => [...members.values()], [members]);
  const types: Array<{ id: FeedType; label: string }> = [{ id: 'all', label: 'Everything' }, { id: 'image', label: 'Images' }, { id: 'video', label: 'Videos' }];
  const statuses: Array<{ id: FeedStatus; label: string }> = [{ id: 'all', label: 'Any status' }, { id: 'done', label: 'Done' }, { id: 'live', label: 'In progress' }, { id: 'failed', label: 'Failed' }];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-light text-white">All generations</h2>
        {types.map((option) => <Chip key={option.id} active={type === option.id} onClick={() => setType(option.id)}>{option.label}</Chip>)}
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        {statuses.map((option) => <Chip key={option.id} active={status === option.id} onClick={() => setStatus(option.id)}>{option.label}</Chip>)}
        {accountFilter && accounts.length > 1 && (
          <select
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            aria-label="Account"
            className="ml-auto h-8 rounded-full border border-white/12 bg-black/30 px-3 text-xs text-white/80 outline-none"
          >
            <option value="">All accounts</option>
            {accounts.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}
          </select>
        )}
      </div>
      {failure && <p className="mb-3 flex items-center gap-1.5 text-xs text-red-200"><AlertTriangle className="h-3.5 w-3.5" /> {failure.message}</p>}
      {items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="playground-shimmer aspect-square rounded-2xl border border-white/6 bg-white/[0.03]" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {items.map((item) => <GenerationCard key={`${item.kind}-${item.id}`} item={item} member={members.get(item.userId)} now={now} onOpen={() => setOpen(item)} />)}
        </div>
      )}
      {nextBefore && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => void more()} disabled={loadingMore} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/75 hover:bg-white/8 disabled:opacity-50">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />} Older
          </button>
        </div>
      )}
      {open && <GenerationDetail item={open} member={members.get(open.userId)} onClose={() => setOpen(null)} />}
    </section>
  );
}
