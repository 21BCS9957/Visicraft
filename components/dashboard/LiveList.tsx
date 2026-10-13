'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Film, Loader2, Pause, Radio } from 'lucide-react';
import type { FeedImage, FeedItem, FeedVideo, LiveJob, LiveRun } from '@/lib/dashboard/types';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { cx, timeAgo } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { itemPrompt, itemStartedAt, itemState, itemThumb, itemTitle, jobKey, videoSeconds } from './items';
import { Lightbox } from './Lightbox';
import { dashboardHref, displayName, elapsed, EmptyState, Loading, MemberAvatar, PageHeader, PANEL, StateChip, useNow } from './parts';

/**
 * A run's images by state, in the order the bar shows them. Being made is striped (yellow on
 * the card's surface) rather than a faded yellow, which reads as olive on black.
 */
const SEGMENTS = [
  { key: 'done', label: 'done', bar: 'bg-[#fff05a]', dot: 'bg-[#fff05a]' },
  { key: 'making', label: 'making', bar: 'animate-pulse bg-[repeating-linear-gradient(-45deg,#fff05a_0_3px,#121214_3px_6px)]', dot: 'ring-[1.5px] ring-inset ring-[#fff05a]' },
  { key: 'waiting', label: 'waiting', bar: 'bg-zinc-700', dot: 'bg-zinc-600' },
  { key: 'failed', label: 'failed', bar: 'bg-red-400/80', dot: 'bg-red-400/80' },
] as const;

/** A run's progress as one bar: done, being made, waiting, failed. */
export function RunBar({ run, className }: { run: LiveRun; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${run.done} of ${run.total} done, ${run.making} being made, ${run.waiting} waiting, ${run.failed} failed`}
      className={cx('flex h-2 gap-[2px] overflow-hidden rounded-full', className)}
    >
      {SEGMENTS.filter((segment) => run[segment.key] > 0).map((segment) => (
        <span key={segment.key} className={cx('h-full min-w-[4px]', segment.bar)} style={{ flexGrow: run[segment.key], flexBasis: 0 }} />
      ))}
    </div>
  );
}

function RunLegend({ run, className }: { run: LiveRun; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400', className)}>
      {SEGMENTS.filter((segment) => segment.key === 'done' || run[segment.key] > 0).map((segment) => (
        <li key={segment.key} className="inline-flex items-center gap-1.5">
          <span className={cx('h-2 w-2 rounded-full', segment.dot)} />
          <span className="tabular-nums text-zinc-200">{run[segment.key]}</span> {segment.label}
        </li>
      ))}
    </ul>
  );
}

/** "About 4 min left", from how fast the run has gone so far (nothing until 3 have finished). */
function timeLeft(run: LiveRun, now: number): string | null {
  const settled = run.done + run.failed;
  if (run.paused || !run.startedAt || settled < 3) return null;
  const last = Date.parse(run.lastActivityAt);
  const perImage = (last - Date.parse(run.startedAt)) / settled;
  const minutes = Math.ceil((perImage * (run.making + run.waiting) - (now - last)) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  return minutes <= 1 ? 'About a minute left' : `About ${minutes} min left`;
}

/** "9:16" → "9 / 16" for CSS (square when unknown). */
function cssRatio(ratio: string | null): string {
  const [width, height] = (ratio ?? '').split(':').map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : '1 / 1';
}

/** The run's images as a strip: the ones being made, then the newest finished (newest first). */
function RunStrip({ run, projectHref, onOpen }: { run: LiveRun; projectHref: string | null; onOpen: (index: number) => void }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const ratio = cssRatio(run.aspectRatio);
  const making = run.paused ? 0 : Math.min(run.making, 3);
  const more = run.done - run.latest.length;
  if (!making && !run.latest.length) return null;
  return (
    <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5">
      {Array.from({ length: making }, (_, index) => (
        <span key={`making-${index}`} className="relative flex h-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/[0.08]" style={{ aspectRatio: ratio }}>
          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-transparent" />
          <Loader2 className="relative h-4 w-4 animate-spin text-[#fff05a]" />
        </span>
      ))}
      {run.latest.map((image, index) => broken.has(image.id) ? null : (
        <button
          key={image.id}
          type="button"
          onClick={() => onOpen(index)}
          aria-label="Open this image"
          className="h-24 shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/[0.07] transition hover:ring-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff05a]/60"
          style={{ aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : ratio }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl ?? image.url ?? ''} alt="" loading="lazy" onError={() => setBroken((current) => new Set(current).add(image.id))} className="h-full w-full object-cover" />
        </button>
      ))}
      {more > 0 && projectHref && (
        <Link href={projectHref} className="flex h-24 min-w-[76px] shrink-0 flex-col items-center justify-center rounded-xl border border-white/[0.08] px-3 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100">
          <span className="text-base font-semibold tabular-nums text-zinc-100">+{more}</span>
          more
        </Link>
      )}
    </div>
  );
}

/** One Playground run: who and where, how far it has got, what it is making now and its newest images. */
function RunCard({ run, showWho, onOpen }: { run: LiveRun; showWho: boolean; onOpen: (images: FeedImage[], index: number) => void }) {
  const preview = useDashboardPreview();
  const { memberById } = useDashboard();
  const member = memberById.get(run.userId);
  const now = useNow(true);
  const left = run.making + run.waiting;
  const eta = timeLeft(run, now);
  const idle = Math.max(1, Math.round((now - Date.parse(run.lastActivityAt)) / 60_000));
  const projectHref = run.projectId ? dashboardHref(`/accounts/${run.userId}`, { tab: 'projects', project: run.projectId, kind: 'image' }, preview) : null;
  const meta = [`${run.total} image${run.total === 1 ? '' : 's'}`, run.model, run.size].filter(Boolean).join(' · ');
  const project = run.projectName ?? 'Playground';
  return (
    <article className={cx(PANEL, 'p-4 sm:p-5')}>
      <div className="flex items-start gap-3">
        {showWho && <MemberAvatar name={member?.name ?? null} email={member?.email ?? '?'} url={member?.avatarUrl ?? null} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-6 text-zinc-100">
            {showWho && <span className="font-medium">{displayName(member)}</span>}
            {showWho && <span className="text-zinc-600"> · </span>}
            {projectHref
              ? <Link href={projectHref} className={cx('hover:underline', showWho ? 'text-zinc-300' : 'font-medium')}>{project}</Link>
              : <span className={showWho ? 'text-zinc-300' : 'font-medium'}>{project}</span>}
          </p>
          <p className="truncate text-xs text-zinc-500">{meta}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          {run.paused
            ? <StateChip tone="neutral"><Pause className="h-3 w-3" /> Paused</StateChip>
            : <StateChip tone="live" spinning>Generating</StateChip>}
          {/* A paused run's card says how long nothing has moved instead. */}
          {!run.paused && <span className="text-xs tabular-nums text-zinc-500 sm:w-14 sm:text-right">{elapsed(run.startedAt ?? run.createdAt, now)}</span>}
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">
          {run.done}<span className="ml-1.5 text-sm font-normal tracking-normal text-zinc-500">of {run.total} done</span>
        </p>
        {eta && <p className="shrink-0 text-xs text-zinc-400">{eta}</p>}
      </div>
      <RunBar run={run} className="mt-3" />
      <RunLegend run={run} className="mt-2.5" />

      {run.paused ? (
        <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-zinc-400">
          <p>
            Nothing has moved for {idle} min. The {left} left {left === 1 ? 'starts' : 'start'} again when {member ? displayName(member).split(' ')[0] : 'its owner'} resumes
            the project in the Playground, which makes images only while its tab is open.
          </p>
          {run.waitingNote && <p className="mt-1 text-zinc-500">Last message: {run.waitingNote}</p>}
        </div>
      ) : run.makingTitles.length > 0 ? (
        <p className="mt-3 truncate text-xs text-zinc-500">Making now: <span className="text-zinc-300">{run.makingTitles.join(' · ')}</span></p>
      ) : null}

      <RunStrip run={run} projectHref={projectHref} onOpen={(index) => onOpen(run.latest, index)} />
    </article>
  );
}

/** A video rendering (with its progress) or waiting for approval. */
function VideoCard({ item, showWho, onOpen }: { item: FeedVideo; showWho: boolean; onOpen: () => void }) {
  const { memberById } = useDashboard();
  const member = memberById.get(item.userId);
  const now = useNow(true);
  const [broken, setBroken] = useState(false);
  const state = itemState(item);
  const thumb = itemThumb(item);
  const progress = item.video.takes.find((take) => take.status === 'rendering')?.progress ?? 0;
  const seconds = videoSeconds(item);
  return (
    <article className={PANEL}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-[20px] p-4 text-left transition-colors hover:bg-white/[0.02] sm:p-5">
        <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/[0.07]">
          {thumb && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : <Film className="h-4 w-4 text-zinc-600" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-6 text-zinc-100">
            {showWho && <span className="font-medium">{displayName(member)}</span>}
            {showWho && <span className="text-zinc-600"> · </span>}
            <span className={showWho ? 'text-zinc-300' : 'font-medium'}>{itemTitle(item)}</span>
          </span>
          <span className="block truncate text-xs text-zinc-500">{[seconds ? `${seconds}s video` : 'Video', itemPrompt(item)].filter(Boolean).join(' · ')}</span>
          {progress > 0 && (
            <span className="mt-3 block h-2 overflow-hidden rounded-full bg-zinc-800">
              <span className="block h-full rounded-full bg-[#fff05a]" style={{ width: `${Math.min(100, progress)}%` }} />
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          {state && <StateChip tone={state.tone} spinning={state.tone === 'live'}>{state.label}</StateChip>}
          <span className="text-xs tabular-nums text-zinc-500 sm:w-14 sm:text-right">{elapsed(itemStartedAt(item), now)}</span>
        </span>
      </button>
    </article>
  );
}

/**
 * What is in progress, one card each: a Playground run (however many images it has) with its
 * progress, or a video. Images and videos open full screen.
 */
export function LiveJobs({ jobs, showWho = true }: { jobs: LiveJob[]; showWho?: boolean }) {
  const [open, setOpen] = useState<{ key: string; items: FeedItem[]; index: number } | null>(null);
  // A video keeps updating while it is open; a run's images are kept as they were when opened.
  const current = open ? jobs.find((job) => jobKey(job) === open.key) : undefined;
  const items = open ? (current?.kind === 'video' ? [current] : open.items) : [];
  return (
    <>
      <div className="space-y-3">
        {jobs.map((job) => job.kind === 'run' ? (
          <RunCard key={jobKey(job)} run={job} showWho={showWho} onOpen={(images, index) => setOpen({ key: jobKey(job), items: images, index })} />
        ) : (
          <VideoCard key={jobKey(job)} item={job} showWho={showWho} onOpen={() => setOpen({ key: jobKey(job), items: [job], index: 0 })} />
        ))}
      </div>
      {open && items[open.index] && (
        <Lightbox items={items} index={open.index} onIndex={(index) => setOpen((state) => state && { ...state, index })} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** The Live page: everything generating right now, refreshed every 5 seconds. */
export function LivePage() {
  return (
    <DashboardShell active="live">
      <LiveBody />
    </DashboardShell>
  );
}

function LiveBody() {
  const { live, liveCheckedAt, liveFailure } = useDashboard();
  return (
    <>
      <PageHeader
        title="Live"
        description="What the team is making right now, one card per batch. Updates every 5 seconds."
        actions={liveCheckedAt ? <span className="text-xs text-zinc-500">Checked {timeAgo(liveCheckedAt)}</span> : null}
      />
      {liveFailure && <p className="mb-3 text-sm text-red-300">{liveFailure.message}</p>}
      {live === null ? (
        <div className={PANEL}><Loading className="py-16" /></div>
      ) : live.length === 0 ? (
        <div className={PANEL}>
          <EmptyState icon={<Radio className="h-5 w-5" />} title="Nothing is generating right now" body="Images, video renders and videos waiting for approval show up here the moment someone starts one." />
        </div>
      ) : (
        <LiveJobs jobs={live} />
      )}
    </>
  );
}
