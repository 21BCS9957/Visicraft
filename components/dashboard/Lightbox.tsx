'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Film, Image as ImageIcon, X } from 'lucide-react';
import type { FeedItem } from '@/lib/dashboard/types';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { downloadUrl } from '@/lib/playground/api';
import type { VideoTake } from '@/lib/video/shared';
import { cx } from '@/components/playground/ui';
import { takeLabel } from '@/components/video-studio/VideoPlayerCard';
import { useDashboard } from './DashboardData';
import { clock, itemError, itemFile, itemKey, itemPrompt, itemStartedAt, itemState, itemThumb, itemTitle, playableTake } from './items';
import { dashboardHref, displayName, elapsed, formatWhen, MemberAvatar, StateChip, useNow } from './parts';

/**
 * One generation full screen: the image or video on the left, who made it, where, when, the
 * prompt and a download on the right. ← and → step through `items`, Esc closes.
 */
export function Lightbox({ items, index, onIndex, onClose }: { items: FeedItem[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!item) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Generation" className="fixed inset-0 z-[90] flex flex-col bg-[#050506]/[0.97] lg:flex-row">
      <LightboxBody
        key={itemKey(item)}
        item={item}
        position={`${index + 1} of ${items.length}`}
        onPrev={hasPrev ? () => onIndex(index - 1) : null}
        onNext={hasNext ? () => onIndex(index + 1) : null}
        onClose={onClose}
      />
    </div>
  );
}

/** One item's media and details; for a video they share which version plays. */
function LightboxBody({ item, position, onPrev, onNext, onClose }: {
  item: FeedItem;
  position: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  const versions = item.kind === 'video' ? item.video.takes.filter((take) => take.status === 'ready' && take.url) : [];
  const [takeKey, setTakeKey] = useState<string | null>(() => playableTake(item)?.key ?? null);
  const take = versions.find((version) => version.key === takeKey) ?? playableTake(item);
  return (
    <>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 pt-14 lg:px-16 lg:py-12" onClick={onClose}>
        <p className="absolute left-4 top-4 text-xs tabular-nums text-zinc-500">{position}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <div className="flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <LightboxMedia item={item} take={take} />
        </div>
        {onPrev && <StepButton side="left" onClick={onPrev} />}
        {onNext && <StepButton side="right" onClick={onNext} />}
      </div>
      <aside className="max-h-[46dvh] w-full shrink-0 overflow-y-auto border-t border-white/[0.08] bg-[#121214] lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
        <LightboxDetails item={item} take={take} versions={versions} onVersion={setTakeKey} onLeave={onClose} />
      </aside>
    </>
  );
}

function StepButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cx(
        'absolute top-1/2 hidden -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2.5 text-zinc-200 backdrop-blur hover:bg-white/10 sm:block',
        side === 'left' ? 'left-3 lg:left-4' : 'right-3 lg:right-4'
      )}
    >
      {side === 'left' ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}

const MEDIA = 'max-h-[calc(54dvh-4.5rem)] max-w-full rounded-lg object-contain lg:max-h-[calc(100dvh-6rem)]';

function Placeholder({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex aspect-[4/5] h-[min(46dvh,420px)] flex-col items-center justify-center gap-3 rounded-lg border border-white/[0.07] bg-[#111113] p-6 text-center lg:h-[min(70dvh,560px)]">
      <span className="text-zinc-600">{icon}</span>
      <div className="text-sm text-zinc-400">{children}</div>
    </div>
  );
}

function LightboxMedia({ item, take }: { item: FeedItem; take: VideoTake | null }) {
  const [broken, setBroken] = useState(false);
  const file = itemFile(item);
  const state = itemState(item);
  const now = useNow(Boolean(state?.live));

  if (item.kind === 'image') {
    if (file && !broken) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={file} alt={item.prompt ?? ''} onError={() => setBroken(true)} className={MEDIA} />;
    }
    return (
      <Placeholder icon={<ImageIcon className="h-8 w-8" />}>
        {broken ? 'This image’s file is no longer available.' : state ? <StateLine state={state} since={state.live ? elapsed(itemStartedAt(item), now) : null} /> : 'No image'}
      </Placeholder>
    );
  }

  if (take?.url) {
    return <video key={take.key} src={take.url} poster={item.video.poster ?? undefined} controls autoPlay playsInline className={cx(MEDIA, 'bg-black')} />;
  }
  const review = item.video.review;
  if (review?.frames.length) {
    return (
      <div className="flex max-w-full flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={review.frames[0].url} alt={review.frames[0].label} className="max-h-[calc(54dvh-9rem)] max-w-full rounded-lg object-contain lg:max-h-[calc(100dvh-12rem)]" />
        {review.frames.length > 1 && (
          <div className="flex max-w-full gap-2 overflow-x-auto">
            {review.frames.slice(1).map((frame) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={frame.url + frame.label} src={frame.url} alt={frame.label} title={frame.label} className="h-16 w-auto shrink-0 rounded-md object-cover ring-1 ring-white/10" />
            ))}
          </div>
        )}
      </div>
    );
  }
  const poster = itemThumb(item);
  if (poster && !broken) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" onError={() => setBroken(true)} className={cx(MEDIA, 'opacity-40')} />
        {state && <div className="absolute inset-0 flex items-center justify-center"><StateChip tone={state.tone} spinning={state.live}>{state.label}</StateChip></div>}
      </div>
    );
  }
  return (
    <Placeholder icon={<Film className="h-8 w-8" />}>
      {state ? <StateLine state={state} since={state.live ? elapsed(itemStartedAt(item), now) : null} /> : 'No video file'}
    </Placeholder>
  );
}

function StateLine({ state, since }: { state: NonNullable<ReturnType<typeof itemState>>; since: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StateChip tone={state.tone} spinning={state.live}>{state.label}</StateChip>
      {since && <span className="tabular-nums text-zinc-500">{since}</span>}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-zinc-200">{children}</dd>
    </>
  );
}

function fileName(item: FeedItem, take: VideoTake | null): string {
  const base = itemTitle(item).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'gogrowth';
  return item.kind === 'image' ? `${base}-${item.id.slice(0, 8)}.png` : `${base}-${take?.quality ?? 'video'}.mp4`;
}

function LightboxDetails({ item, take, versions, onVersion, onLeave }: {
  item: FeedItem;
  take: VideoTake | null;
  versions: VideoTake[];
  onVersion: (key: string) => void;
  onLeave: () => void;
}) {
  const preview = useDashboardPreview();
  const { memberById } = useDashboard();
  const member = memberById.get(item.userId);
  const state = itemState(item);
  const prompt = itemPrompt(item);
  const error = itemError(item);
  const file = item.kind === 'video' ? take?.url ?? null : itemFile(item);

  return (
    <div className="p-5">
      <Link
        href={dashboardHref(`/accounts/${item.userId}`, {}, preview)}
        onClick={onLeave}
        className="-m-2 flex items-center gap-3 rounded-2xl p-2 hover:bg-white/[0.04]"
      >
        <MemberAvatar name={member?.name ?? null} email={member?.email ?? '?'} url={member?.avatarUrl ?? null} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{displayName(member)}</p>
          <p className="truncate text-xs text-zinc-500">{member?.email ?? 'Team account'}</p>
        </div>
      </Link>

      <h2 className="mt-5 text-base font-semibold leading-snug text-zinc-50">{itemTitle(item)}</h2>
      {state && <div className="mt-2"><StateChip tone={state.tone} spinning={state.live}>{state.label}</StateChip></div>}

      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
        <Detail label="Made">{formatWhen(item.createdAt)}</Detail>
        {item.kind === 'image' ? (
          <>
            <Detail label="Type">Image{item.aspectRatio ? ` · ${item.aspectRatio}` : ''}</Detail>
            {(item.width && item.height) || item.size ? <Detail label="Size">{item.width && item.height ? `${item.width} × ${item.height}` : item.size}</Detail> : null}
            {item.model && <Detail label="Model">{item.model}</Detail>}
          </>
        ) : (
          <>
            <Detail label="Type">Video · {(take ?? item.video.takes.at(-1))?.aspectRatio ?? item.video.review?.aspectRatio ?? item.video.settings.aspectRatio}</Detail>
            <Detail label="Length">{clock((take ?? item.video.takes.at(-1))?.durationSeconds ?? item.video.review?.durationSeconds ?? item.video.settings.durationSeconds)}</Detail>
            {take && <Detail label="Quality">{takeLabel(take)}</Detail>}
          </>
        )}
      </dl>

      {versions.length > 1 && (
        <section className="mt-5">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Versions</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {versions.map((version) => (
              <button
                key={version.key}
                type="button"
                onClick={() => onVersion(version.key)}
                aria-pressed={version.key === take?.key}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  version.key === take?.key ? 'border-[#fff05a]/40 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/10 text-zinc-300 hover:bg-white/[0.06]'
                )}
              >
                {takeLabel(version)} · {clock(version.durationSeconds)}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-3.5 text-xs leading-relaxed text-red-200">{error}</p>}

      {prompt && (
        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Prompt</h3>
            <CopyButton text={prompt} />
          </div>
          <p className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/40 p-3.5 text-[13px] leading-relaxed text-zinc-300">{prompt}</p>
        </section>
      )}

      {file && (
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={downloadUrl(file, fileName(item, take))} download className="inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-[#1f1c00] hover:bg-[#fff59a]">
            <Download className="h-4 w-4" /> Download
          </a>
          <a href={file} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-zinc-200 hover:bg-white/[0.06]">
            <ExternalLink className="h-4 w-4" /> Open original
          </a>
        </div>
      )}
    </div>
  );
}
