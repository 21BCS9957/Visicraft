'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Folder, Image as ImageIcon, Loader2, Play, X } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { previewDashboard } from '@/lib/dashboard/preview';
import type { FeedItem, FeedPage } from '@/lib/dashboard/types';
import { downloadUrl, playgroundApi } from '@/lib/playground/api';
import { previewProjects } from '@/lib/playground/preview';
import { previewVideoProjects } from '@/lib/video/preview';
import { clock, itemFile, itemKey, itemPrompt, itemThumb, playableTake, videoSeconds } from '@/components/dashboard/items';
import { usePreviewFlag } from '../hooks';
import { cx, timeAgo } from '../ui';

/** A client folder: one image or video project and how many finished creatives it holds. */
interface ClientFolder {
  id: string;
  name: string;
  kind: 'image' | 'video';
  count: number;
}

const ALL = 'all';

/** "9:16" or the image's own size, for the tile's shape before it loads. */
function ratioOf(item: FeedItem): string {
  if (item.kind === 'image') {
    if (item.width && item.height) return `${item.width} / ${item.height}`;
    const [w, h] = (item.aspectRatio ?? '4:5').split(':').map(Number);
    return w && h ? `${w} / ${h}` : '4 / 5';
  }
  const [w, h] = (item.video.settings.aspectRatio ?? '9:16').split(':').map(Number);
  return w && h ? `${w} / ${h}` : '9 / 16';
}

/** Where the creative was made: its Playground project or Video Studio project. */
function projectHref(item: FeedItem, preview: boolean): string | null {
  if (!item.projectId) return null;
  const path = item.kind === 'video' ? `/playground/video/${item.projectId}` : `/playground/${item.projectId}`;
  return `${path}${preview ? '?previewPlayground=1' : ''}`;
}

function Tile({ item, onOpen, onBroken }: { item: FeedItem; onOpen: () => void; onBroken: () => void }) {
  const thumb = itemThumb(item);
  const seconds = videoSeconds(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      // !p-0: the site's base styles pad every button.
      className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] !p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff05a]/60"
      style={{ aspectRatio: ratioOf(item) }}
      aria-label="Open this creative"
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={itemPrompt(item)?.slice(0, 120) ?? ''} loading="lazy" decoding="async" onError={onBroken} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      ) : (
        <span className="flex h-full items-center justify-center text-white/25"><ImageIcon className="h-6 w-6" /></span>
      )}
      {item.kind === 'video' && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white backdrop-blur-md">
          <Play className="h-3 w-3 fill-current" /> {seconds ? clock(seconds) : 'Video'}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10 text-xs leading-snug text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="line-clamp-2">{item.projectName ?? ''}{item.projectName ? ' · ' : ''}{timeAgo(item.createdAt)}</span>
      </span>
    </button>
  );
}

/** One creative full screen: the image or video, its prompt, where it was made, download. */
function Viewer({ items, index, onIndex, onClose, preview }: { items: FeedItem[]; index: number; onIndex: (index: number) => void; onClose: () => void; preview: boolean }) {
  const item = items[index];
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [index, items.length, onIndex, onClose]);
  if (!item) return null;

  const prompt = itemPrompt(item);
  const file = itemFile(item);
  const take = playableTake(item);
  const href = projectHref(item, preview);
  const details = item.kind === 'image'
    ? [item.model, item.size, item.aspectRatio, item.width && item.height ? `${item.width} × ${item.height}` : null]
    // No model names for videos (the Video Studio shows none either).
    : [take?.quality ?? null, item.video.settings.aspectRatio, videoSeconds(item) ? clock(videoSeconds(item)!) : null];
  const copy = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Creative" className="fixed inset-0 z-[90] flex flex-col bg-[#050506]/[0.97] lg:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 lg:p-8">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
        <span className="absolute left-4 top-4 text-xs text-white/45">{index + 1} of {items.length}</span>
        {item.kind === 'video' ? (
          take?.url ? <video key={take.url} src={take.url} poster={item.video.poster ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" /> : <p className="text-sm text-white/50">This video’s file is no longer available.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.url ?? item.previewUrl ?? ''} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        )}
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label="Previous" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="h-5 w-5" /></button>
        )}
        {index < items.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label="Next" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="h-5 w-5" /></button>
        )}
      </div>
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-white/8 bg-[#0e0e11] p-5 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-white/40">{item.kind === 'video' ? 'Video' : 'Image'}</p>
          <h2 className="mt-1 text-base font-medium text-white">{item.projectName ?? (item.kind === 'video' ? item.video.title ?? 'Video' : 'Playground')}</h2>
          <p className="mt-0.5 text-xs text-white/45">{timeAgo(item.createdAt)}{details.filter(Boolean).length ? ` · ${details.filter(Boolean).join(' · ')}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {file && (
            <a href={item.kind === 'image' ? downloadUrl(file, `${(item.projectName ?? 'creative').replace(/[^\w-]+/g, '-').toLowerCase()}-${item.id.slice(0, 8)}.png`) : file} download className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#fff05a] text-sm font-medium text-black hover:bg-white">
              <Download className="h-4 w-4" /> Download
            </a>
          )}
          {href && (
            <Link href={href} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] text-sm text-white hover:bg-white/12">
              <ExternalLink className="h-4 w-4" /> Open in project
            </Link>
          )}
        </div>
        {prompt && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">Prompt</h3>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/80">{prompt}</p>
          </section>
        )}
      </aside>
    </div>
  );
}

/**
 * Creatives: everything the person has made, as one wall, filed by client (each project is a
 * folder): Playground images and Video Studio videos, newest first.
 */
export function CreativesPage() {
  const { user, loading: authLoading } = useAuth();
  const preview = usePreviewFlag();
  const signedOut = !preview && !authLoading && !user;
  const ready = preview || (!authLoading && Boolean(user));
  const [folders, setFolders] = useState<ClientFolder[] | null>(null);
  const [folder, setFolder] = useState<string>(ALL);
  const [page, setPage] = useState<(FeedPage & { key: string }) | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  // The folders: every project that has finished work, most recently used first.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const load = preview
      ? Promise.resolve([{ projects: previewProjects() }, { projects: previewVideoProjects() }])
      : Promise.all([playgroundApi.listProjects('image'), playgroundApi.listProjects('video')]);
    load
      .then(([images, videos]) => {
        if (!active) return;
        const list: Array<ClientFolder & { updatedAt: string }> = [
          ...images.projects.map((project) => ({ id: project.id, name: project.name, kind: 'image' as const, count: project.imageCount, updatedAt: project.updatedAt })),
          ...videos.projects.map((project) => ({ id: project.id, name: project.name, kind: 'video' as const, count: project.videoCount ?? 0, updatedAt: project.updatedAt })),
        ];
        setFolders(list.filter((entry) => entry.count > 0).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      })
      .catch((error) => active && setFailure(error instanceof Error ? error.message : 'Could not load your projects.'));
    return () => {
      active = false;
    };
  }, [ready, preview]);

  const fetchPage = useCallback(async (before: string | null): Promise<FeedPage> => {
    const project = folder === ALL ? null : folder;
    if (preview) {
      const items = previewDashboard.feed({ status: 'done', project }).items.filter((item) => item.kind !== 'image' || item.source !== 'quick');
      return { items, nextBefore: null };
    }
    return playgroundApi.creatives({ project, before });
  }, [folder, preview]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const key = folder;
    fetchPage(null)
      .then((next) => {
        if (!active) return;
        setPage({ ...next, key });
        setFailure(null);
      })
      .catch((error) => active && setFailure(error instanceof Error ? error.message : 'Could not load your creatives.'));
    return () => {
      active = false;
    };
  }, [ready, folder, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!page?.nextBefore || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchPage(page.nextBefore);
      setPage((current) => {
        if (!current || current.key !== page.key) return current;
        const seen = new Set(current.items.map(itemKey));
        return { ...current, items: [...current.items, ...next.items.filter((item) => !seen.has(itemKey(item)))], nextBefore: next.nextBefore };
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not load more.');
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [page, fetchPage]);

  // More arrives as the end of the wall comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !page?.nextBefore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '900px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [page?.nextBefore, loadMore]);

  const shown = useMemo(() => (page && page.key === folder ? page.items.filter((item) => !broken.has(itemKey(item))) : []), [page, folder, broken]);
  const current = folders?.find((entry) => entry.id === folder) ?? null;
  const total = folders ? (current ? current.count : folders.reduce((sum, entry) => sum + entry.count, 0)) : null;
  const switching = page !== null && page.key !== folder;

  return (
    <div className="relative min-h-screen bg-[#08080a] text-white">
      <div className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
        <h1 className="text-3xl font-light tracking-tight sm:text-4xl">{current ? current.name : 'All creatives'}</h1>
        <p className="mt-2 text-sm text-white/50">
          {total === null ? ' ' : `${total.toLocaleString('en-IN')} creative${total === 1 ? '' : 's'}`}
          {!current && <span className="text-white/35"> · everything you’ve made, filed by client</span>}
        </p>

        {signedOut ? (
          <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            <h2 className="text-lg font-light">Sign in to see your creatives</h2>
            <Link href="/login?redirectTo=/creatives" className="mt-6 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">Sign in</Link>
          </div>
        ) : (
          <>
            {/* Client folders: one per project, like a shelf; it scrolls sideways on a phone. */}
            <div className="-mx-4 mt-8 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8">
              {[{ id: ALL, name: 'All', kind: 'image' as const, count: folders?.reduce((sum, entry) => sum + entry.count, 0) ?? 0 }, ...(folders ?? [])].map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { setFolder(entry.id); setOpen(null); }}
                  aria-pressed={folder === entry.id}
                  className={cx(
                    'flex min-w-[150px] max-w-[220px] shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                    folder === entry.id ? 'border-[#fff05a]/50 bg-white/[0.07]' : 'border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]'
                  )}
                >
                  <Folder className="h-5 w-5 shrink-0 text-[#fff05a]" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight text-white">{entry.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-white/45">{folders ? entry.count.toLocaleString('en-IN') : ''}</span>
                </button>
              ))}
              {folders === null && Array.from({ length: 4 }, (_, i) => <span key={i} className="h-[50px] min-w-[150px] shrink-0 animate-pulse rounded-2xl bg-white/[0.04]" />)}
            </div>

            {failure && <p className="mt-6 text-sm text-red-300">{failure}</p>}

            <div className={cx('mt-6 transition-opacity', switching && 'opacity-50')}>
              {page === null ? (
                <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
                  {Array.from({ length: 10 }, (_, i) => <div key={i} className="playground-shimmer mb-3 break-inside-avoid rounded-2xl bg-white/[0.04]" style={{ aspectRatio: i % 3 === 1 ? '1 / 1' : '4 / 5' }} />)}
                </div>
              ) : shown.length === 0 && !switching ? (
                <div className="rounded-3xl border border-white/8 bg-white/[0.02] px-6 py-16 text-center">
                  <p className="text-sm text-white/70">Nothing here yet</p>
                  <p className="mt-1 text-sm text-white/40">Finished images and videos from your projects show up here.</p>
                  <Link href={`/playground${preview ? '?previewPlayground=1' : ''}`} className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/8">Open the Playground</Link>
                </div>
              ) : (
                <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
                  {shown.map((item, index) => (
                    <Tile key={itemKey(item)} item={item} onOpen={() => setOpen(index)} onBroken={() => setBroken((set) => new Set(set).add(itemKey(item)))} />
                  ))}
                </div>
              )}
            </div>
            {page?.nextBefore && <div ref={sentinel} className="flex justify-center py-8">{loadingMore && <Loader2 className="h-5 w-5 animate-spin text-white/40" />}</div>}
          </>
        )}
      </div>
      {open !== null && shown[open] && <Viewer items={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)} preview={preview} />}
    </div>
  );
}
