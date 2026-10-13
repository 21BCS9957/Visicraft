'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Ban, Film, Image as ImageIcon, Images, Loader2, Play, Radio } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import type { FeedItem, FeedStatus, FeedType } from '@/lib/dashboard/types';
import { cx, timeAgo } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { clock, itemError, itemKey, itemPrompt, itemState, itemThumb, itemTitle, playableTake, videoSeconds } from './items';
import { Lightbox } from './Lightbox';
import { LiveJobs } from './LiveList';
import { dayKey, dayTitle, displayName, EmptyState, failureOf, MemberAvatar, PageHeader, PANEL, Segmented, StateChip, type Failure } from './parts';

/** The one grid every gallery uses: uniform 4:5 tiles, 2 to 6 columns. */
export const TILE_GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

/**
 * A finished image or video as a tile: the picture fills it, nothing written on it until you
 * point at it (who and where). A video shows its length and plays muted on hover. A picture
 * that fails to load calls `onBroken`, and the gallery drops the tile.
 */
export function MediaTile({ item, onOpen, onBroken, showWho = true }: { item: FeedItem; onOpen: () => void; onBroken: () => void; showWho?: boolean }) {
  const { memberById } = useDashboard();
  const member = memberById.get(item.userId);
  const thumb = itemThumb(item);
  const take = playableTake(item);
  const seconds = videoSeconds(item);
  const [hovering, setHovering] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  // A video without a poster that loads shows its own first frame instead.
  const frameOnly = item.kind === 'video' && Boolean(take?.url) && (!thumb || posterBroken);

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[14px] bg-zinc-900 !p-0 text-left outline-none ring-1 ring-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#fff05a]/70"
    >
      {thumb && !posterBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={itemPrompt(item) ?? ''}
          loading="lazy"
          decoding="async"
          onError={() => (item.kind === 'image' ? onBroken() : setPosterBroken(true))}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : frameOnly ? (
        <video src={`${take!.url}#t=0.1`} muted playsInline preload="metadata" onError={onBroken} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-700">
          {item.kind === 'video' ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        </span>
      )}
      {item.kind === 'video' && take?.url && hovering && (
        <video src={take.url} autoPlay muted loop playsInline className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      )}
      {item.kind === 'video' && (
        <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
          <Play className="h-2.5 w-2.5 fill-current" /> {seconds ? clock(seconds) : 'Video'}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 pb-2.5 pt-12 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        {showWho && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-white">
            <MemberAvatar name={member?.name ?? null} email={member?.email ?? '?'} url={member?.avatarUrl ?? null} size="xs" />
            <span className="truncate">{displayName(member)}</span>
          </span>
        )}
        <span className={cx('block truncate text-[11px] text-zinc-300', showWho && 'mt-1')}>{itemTitle(item)} · {timeAgo(item.createdAt)}</span>
      </span>
    </button>
  );
}

export function TileSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={TILE_GRID}>
      {Array.from({ length: count }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-[14px] bg-white/[0.035]" />)}
    </div>
  );
}

/** Failed and cancelled generations: rows with the reason, not empty tiles. */
function FailedList({ items, onOpen }: { items: FeedItem[]; onOpen: (index: number) => void }) {
  const { memberById } = useDashboard();
  return (
    <ul className={cx(PANEL, 'divide-y divide-white/[0.05]')}>
      {items.map((item, index) => {
        const state = itemState(item);
        const cancelled = state?.label === 'Cancelled';
        const error = itemError(item);
        return (
          <li key={itemKey(item)}>
            <button type="button" onClick={() => onOpen(index)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5">
              <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', cancelled ? 'bg-white/[0.04] text-zinc-500' : 'bg-red-400/10 text-red-300')}>
                {cancelled ? <Ban className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-100">
                  <span className="font-medium">{displayName(memberById.get(item.userId))}</span>
                  <span className="text-zinc-500"> · </span>
                  <span className="text-zinc-400">{itemTitle(item)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-zinc-500">{itemPrompt(item) ?? (item.kind === 'video' ? 'Video' : 'Image')}</span>
                {error && <span className="mt-1 line-clamp-2 block text-xs text-red-300/80">{error}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                {state && <StateChip tone={state.tone}>{state.label}</StateChip>}
                <span className="text-[11px] text-zinc-500">{timeAgo(item.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const TYPES: ReadonlyArray<{ id: FeedType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
];

function emptyCopy(status: FeedStatus, type: FeedType): { icon: ReactNode; title: string; body: string } {
  if (status === 'live') return { icon: <Radio className="h-5 w-5" />, title: 'Nothing is generating right now', body: 'Work in progress shows up here the moment someone starts it.' };
  if (status === 'failed') return { icon: <AlertTriangle className="h-5 w-5" />, title: 'Nothing has failed', body: 'Failed and cancelled generations would be listed here, with the reason.' };
  if (type === 'video') return { icon: <Film className="h-5 w-5" />, title: 'No videos yet', body: 'When someone renders a video, it shows up here.' };
  if (type === 'image') return { icon: <ImageIcon className="h-5 w-5" />, title: 'No images yet', body: 'Finished images show up here, newest first.' };
  return { icon: <Images className="h-5 w-5" />, title: 'Nothing made yet', body: 'Finished images and videos show up here, newest first.' };
}

type Page = { items: FeedItem[]; nextBefore: string | null; key: string };

/** How many columns the tile grid has at the current width. */
function useGridColumns<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setColumns(getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, columns] as const;
}

/** The newest few as whole rows only (no half-empty last row), whatever the width. */
function CompactRows({ items, rows, account, onBroken }: { items: FeedItem[]; rows: number; account: string | null; onBroken: (item: FeedItem) => void }) {
  const [ref, columns] = useGridColumns<HTMLDivElement>();
  const [open, setOpen] = useState<number | null>(null);
  const fit = columns ? Math.max(columns, Math.floor(Math.min(items.length, columns * rows) / columns) * columns) : items.length;
  const shown = items.slice(0, fit);
  return (
    <>
      <div ref={ref} className={TILE_GRID}>
        {shown.map((item, index) => <MediaTile key={itemKey(item)} item={item} onOpen={() => setOpen(index)} onBroken={() => onBroken(item)} showWho={!account} />)}
      </div>
      {open !== null && shown[open] && <Lightbox items={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Everything made, as one tidy grid grouped by day: finished work by default, or what is in
 * progress (rows, live), or what failed (rows, with the reason). Scoped to an `account` or a
 * `project` when given; `personFilter` adds an Everyone / member picker. `compact` shows only
 * the newest few (asking for that many), with no controls, as `compactRows` whole rows (the
 * Overview's "Recent").
 */
export function Gallery({ account = null, project = null, personFilter = false, showTypes = true, initialType = 'all', compact, compactRows = 2 }: {
  account?: string | null;
  project?: string | null;
  personFilter?: boolean;
  showTypes?: boolean;
  initialType?: FeedType;
  compact?: number;
  compactRows?: number;
}) {
  const { members, live, settledKey } = useDashboard();
  const [type, setType] = useState<FeedType>(initialType);
  const [status, setStatus] = useState<FeedStatus>('done');
  const [person, setPerson] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);
  const loadingMoreRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const who = account ?? (person || null);
  const key = JSON.stringify([who, project, type, status, compact ?? null]);

  // Finished and failed work comes from the feed; what is in progress, from the shared live check.
  useEffect(() => {
    if (status === 'live') return;
    let active = true;
    const requestKey = JSON.stringify([who, project, type, status, compact ?? null]);
    dashboardApi.feed({ account: who, project, type, status, limit: compact })
      .then((result) => {
        if (!active) return;
        setPage({ items: result.items, nextBefore: compact ? null : result.nextBefore, key: requestKey });
        setFailure(null);
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [who, project, type, status, compact, settledKey]);

  const loadMore = useCallback(async () => {
    if (!page?.nextBefore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = await dashboardApi.feed({ account: who, project, type, status, before: page.nextBefore });
      setPage((current) => {
        if (!current || current.key !== page.key) return current;
        const seen = new Set(current.items.map(itemKey));
        return { ...current, items: [...current.items, ...next.items.filter((item) => !seen.has(itemKey(item)))], nextBefore: next.nextBefore };
      });
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [page, who, project, type, status]);

  // More arrives as the end of the grid comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !page?.nextBefore || compact || status === 'live') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '800px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [page?.nextBefore, loadMore, compact, status]);

  const liveJobs = useMemo(() => (live ?? []).filter((job) => (!who || job.userId === who)
    && (!project || job.projectId === project)
    && (type === 'all' || (job.kind === 'run' ? 'image' : 'video') === type)), [live, who, project, type]);
  const visible = useMemo(() => (page?.items ?? []).filter((item) => !broken.has(itemKey(item))), [page, broken]);
  const groups = useMemo(() => {
    const now = Date.now();
    const list: Array<{ key: string; title: string; entries: Array<{ item: FeedItem; index: number }> }> = [];
    visible.forEach((item, index) => {
      const day = dayKey(item.createdAt);
      const last = list.at(-1);
      if (last?.key === day) last.entries.push({ item, index });
      else list.push({ key: day, title: dayTitle(item.createdAt, now), entries: [{ item, index }] });
    });
    return list;
  }, [visible]);

  const refetching = status !== 'live' && page !== null && page.key !== key;
  const empty = emptyCopy(status, type);
  const markBroken = (item: FeedItem) => setBroken((current) => new Set(current).add(itemKey(item)));

  if (compact) {
    if (failure) return <p className="text-sm text-red-300">{failure.message}</p>;
    if (!page) return <TileSkeleton count={compactRows * 5} />;
    if (!visible.length) return <EmptyState icon={empty.icon} title={empty.title} body={empty.body} className="py-8" />;
    return <CompactRows items={visible} rows={compactRows} account={account} onBroken={markBroken} />;
  }

  return (
    <div>
      {/* One row on a phone (it scrolls sideways), wrapping from tablet width up. */}
      <div className="sticky top-14 z-20 -mx-4 mb-1 flex items-center gap-2 overflow-x-auto bg-black/90 px-4 py-3 backdrop-blur-md [scrollbar-width:none] sm:-mx-6 sm:flex-wrap sm:overflow-visible sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        {showTypes && <Segmented label="Type" value={type} onChange={(next) => { setType(next); setOpen(null); }} options={TYPES} />}
        <Segmented
          label="Status"
          value={status}
          onChange={(next) => { setStatus(next); setOpen(null); }}
          options={[
            { id: 'done', label: 'Finished' },
            { id: 'live', label: 'In progress', count: live === null ? null : liveJobs.length || null },
            { id: 'failed', label: 'Failed' },
          ]}
        />
        {personFilter && !account && (members?.length ?? 0) > 1 && (
          <select
            value={person}
            onChange={(event) => { setPerson(event.target.value); setOpen(null); }}
            aria-label="Person"
            className="h-9 rounded-full border border-white/[0.08] bg-[#0b0b0d] px-3.5 text-[13px] text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-[#fff05a]/60"
          >
            <option value="">Everyone</option>
            {members!.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}
          </select>
        )}
        {(refetching || loadingMore) && <Loader2 className="ml-auto h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {failure && <p className="mb-3 flex items-center gap-1.5 text-sm text-red-300"><AlertTriangle className="h-4 w-4" /> {failure.message}</p>}

      <div className={cx('transition-opacity', refetching && 'opacity-50')}>
        {status === 'live' ? (
          live === null ? <TileSkeleton count={6} /> : liveJobs.length ? (
            <div className="pt-3"><LiveJobs jobs={liveJobs} showWho={!account} /></div>
          ) : <div className={cx(PANEL, 'mt-3')}><EmptyState icon={empty.icon} title={empty.title} body={empty.body} /></div>
        ) : page === null ? (
          <div className="pt-5"><TileSkeleton /></div>
        ) : !visible.length ? (
          <div className={cx(PANEL, 'mt-3')}><EmptyState icon={empty.icon} title={empty.title} body={empty.body} /></div>
        ) : status === 'failed' ? (
          <div className="pt-3"><FailedList items={visible} onOpen={setOpen} /></div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="pt-5 first:pt-3">
              <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium text-zinc-200">
                {group.title}
                <span className="text-xs font-normal tabular-nums text-zinc-500">{group.entries.length}</span>
              </h2>
              <div className={TILE_GRID}>
                {group.entries.map(({ item, index }) => (
                  <MediaTile key={itemKey(item)} item={item} onOpen={() => setOpen(index)} onBroken={() => markBroken(item)} showWho={!account} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {status !== 'live' && page?.nextBefore && <div ref={sentinel} className="flex justify-center py-8">{loadingMore && <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />}</div>}
      {status !== 'live' && page && !page.nextBefore && visible.length > 0 && <p className="py-10 text-center text-xs text-zinc-600">That’s everything.</p>}

      {status !== 'live' && open !== null && visible[open] && <Lightbox items={visible} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The Gallery page: everything the team made, with filters. */
export function GalleryPage() {
  return (
    <DashboardShell active="gallery">
      <PageHeader title="Gallery" description="Everything the team has made, newest first." />
      <Gallery personFilter />
    </DashboardShell>
  );
}
