'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { ChevronLeft, ChevronRight, Copy, Download, FolderOutput, ImagePlus, Proportions, RotateCcw, Star, Trash2, Wand2, X } from 'lucide-react';
import toast from '@/lib/toast';
import { playgroundApi } from '@/lib/playground/api';
import { dimensionLabel, nearestSize, playgroundModel, QUALITY_LABELS, ROLE_LABELS, runCost, sizeOption } from '@/lib/playground/models';
import { copyMethodLabel, orderRuns } from '@/lib/playground/resize';
import { enqueue } from '@/lib/playground/runner';
import { runItems, usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem, PlaygroundRun } from '@/lib/playground/types';
import { ReferenceRoleMenu, useItemActions } from './ImageCard';
import { Markdown } from './Markdown';
import { ResizeDialog } from './ResizeDialog';
import { cx } from './ui';

/** "Extend", "Remake", "Fit on blur · clear of Reels". */
function methodLabel(run: PlaygroundRun): string {
  return run.resize ? copyMethodLabel(run.resize) : '';
}

const TOAST = { position: 'top-center' as const };
/** The Canvas editor is the next step of the build; its button appears once it exists. */
const CANVAS_ENABLED = true;

function LightboxBody({ item, run, onPrev, onNext }: {
  item: PlaygroundItem;
  run: PlaygroundRun | undefined;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const router = useRouter();
  const projectId = usePlaygroundStore((state) => state.projectId);
  const preview = usePlaygroundStore((state) => state.preview);
  const addRun = usePlaygroundStore((state) => state.addRun);
  const setLightbox = usePlaygroundStore((state) => state.setLightbox);
  const items = usePlaygroundStore((state) => state.items);
  const runs = usePlaygroundStore((state) => state.runs);
  const enabledReferences = usePlaygroundStore((state) => state.references.filter((reference) => reference.enabled).length);
  const prompt = item.kind === 'edit' ? 'Edited in Canvas' : run?.prompts[item.promptIndex ?? 0] ?? '';
  const actions = useItemActions(item, prompt);
  const [loaded, setLoaded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const model = run ? playgroundModel(run.model) : null;
  const copy = run?.resize ?? null;

  // A copy's original, and an original's other sizes (Canvas edits also point at their source: not these).
  const original = copy && item.parentItemId ? items[item.parentItemId] : undefined;
  const otherSizes = useMemo(() => {
    if (copy) return [];
    const runById = new Map(runs.map((known) => [known.id, known]));
    return Object.values(items)
      .filter((other) => other.parentItemId === item.id && other.kind === 'generated' && other.runId && runById.get(other.runId)?.resize)
      .map((other) => ({ item: other, run: runById.get(other.runId!)! }))
      .sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt));
  }, [copy, items, runs, item.id]);

  // What a new take costs now: the run's model and size with the references switched on today.
  const newTakeCredits = !run
    ? 0
    : copy
      ? run.creditsPerImage
      : runCost({ model: run.model, size: nearestSize(playgroundModel(run.model), run.size), promptCount: 1, ratioCount: 1, variations: 1, referenceCount: enabledReferences, quality: run.quality }).creditsPerImage;

  /** A copy's new take: the same size made again from its original. */
  const remakeCopy = async () => {
    if (!run?.resize || !projectId || preview || !item.parentItemId) return;
    try {
      const { run: next, items: queued } = await playgroundApi.resizeImages(projectId, {
        clientKey: crypto.randomUUID(),
        itemIds: [item.parentItemId],
        ratio: item.aspectRatio,
        method: run.resize.method,
        ...(run.resize.method === 'extend' ? { model: run.model } : {}),
        ...(run.resize.method === 'fit' ? { background: run.resize.background ?? 'blur' } : {}),
        again: true,
        expectedCredits: run.creditsPerImage,
      });
      addRun(next, queued);
      enqueue(queued.map((queuedItem) => queuedItem.id));
      setLightbox(null);
      toast.success('A new take is being made', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the new take', TOAST);
    }
  };

  const regenerate = async () => {
    if (!run || !projectId || preview) return;
    if (copy) return remakeCopy();
    try {
      const { run: next, items } = await playgroundApi.createRun(projectId, {
        clientKey: crypto.randomUUID(),
        prompts: [prompt],
        model: run.model,
        // An old 4K run makes its new take at the nearest size still offered.
        size: nearestSize(playgroundModel(run.model), run.size),
        aspectRatios: [item.aspectRatio],
        variations: 1,
        thinking: run.thinking ?? undefined,
        quality: run.quality ?? undefined,
        brief: usePlaygroundStore.getState().project?.brief ?? run.brief,
        guidelinesWithImages: usePlaygroundStore.getState().settings.guidelinesWithImages,
        referenceIds: usePlaygroundStore.getState().references.filter((reference) => reference.enabled).map((reference) => reference.id),
      });
      addRun(next, items);
      enqueue(items.map((queued) => queued.id));
      setLightbox(null);
      toast.success('A new take is being made', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the new take', TOAST);
    }
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt).catch(() => undefined);
    toast.success('Prompt copied', TOAST);
  };

  return (
    <div className="flex h-full w-full flex-col lg:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        {!loaded && item.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="absolute max-h-[calc(100%-4rem)] max-w-[calc(100%-4rem)] object-contain opacity-70 blur-[1px]" />
        )}
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.imageUrl}
            src={item.imageUrl}
            alt={prompt}
            onLoad={() => setLoaded(true)}
            className={cx('relative max-h-full max-w-full rounded-lg object-contain shadow-[0_30px_120px_rgba(0,0,0,0.6)] transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
          />
        )}
        {onPrev && (
          <button type="button" onClick={onPrev} aria-label="Previous image" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/75">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNext && (
          <button type="button" onClick={onNext} aria-label="Next image" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/75">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-white/8 bg-[#0e0e11] p-5 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
        <div className="flex gap-2">
          <a href={actions.href} download={actions.fileName} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#fff05a] text-sm font-medium text-black hover:bg-white">
            <Download className="h-4 w-4" /> Download
          </a>
          {CANVAS_ENABLED && projectId && (
            <button type="button" onClick={() => router.push(`/playground/${projectId}/canvas/${item.id}${preview ? '?previewPlayground=1' : ''}`)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] text-sm text-white hover:bg-white/12">
              <Wand2 className="h-4 w-4" /> Open in Canvas
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={actions.toggleFavorite} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:bg-white/8">
            <Star className={cx('h-3.5 w-3.5', item.favorite && 'fill-[#fff05a] text-[#fff05a]')} /> {item.favorite ? 'Favourite' : 'Add to favourites'}
          </button>
          <ReferenceRoleMenu onPick={actions.useAsReference}>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:bg-white/8">
              <ImagePlus className="h-3.5 w-3.5" /> Use as reference
            </button>
          </ReferenceRoleMenu>
          <button type="button" onClick={actions.saveToLibrary} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:bg-white/8">
            <FolderOutput className="h-3.5 w-3.5" /> Save to Library
          </button>
          <button type="button" onClick={() => setResizing(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:bg-white/8">
            <Proportions className="h-3.5 w-3.5" /> Another size
          </button>
          {run && !preview && (!copy || item.parentItemId) && (
            <button type="button" onClick={regenerate} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/75 hover:bg-white/8">
              <RotateCcw className="h-3.5 w-3.5" /> New take · {newTakeCredits ? `${newTakeCredits} credits` : 'free'}
            </button>
          )}
          <button type="button" onClick={async () => { await actions.remove(); if (!usePlaygroundStore.getState().items[item.id]) setLightbox(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/60 hover:bg-red-500/10 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>

        {copy && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">Made from</h3>
            {original?.status === 'done' ? (
              <button type="button" onClick={() => setLightbox(original.id)} className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2 text-left hover:bg-white/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={original.previewUrl ?? original.imageUrl ?? ''} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                <span className="text-xs leading-relaxed text-white/75">
                  #{original.position + 1} · {original.aspectRatio}
                  <span className="block text-white/45">{methodLabel(run!)}{copy.method === 'extend' ? ': the original is kept exactly' : ''}</span>
                </span>
              </button>
            ) : (
              <p className="text-xs text-white/45">{item.parentItemId ? "The original isn't shown here: it was deleted or is in an older run." : 'The original was deleted.'}</p>
            )}
          </section>
        )}
        {otherSizes.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">Other sizes</h3>
            <div className="flex flex-wrap gap-2">
              {otherSizes.map(({ item: other, run: otherRun }) => (
                <button
                  key={other.id}
                  type="button"
                  disabled={other.status !== 'done'}
                  onClick={() => setLightbox(other.id)}
                  title={`${other.aspectRatio} · ${methodLabel(otherRun)}`}
                  className="w-20 space-y-1 !p-0 text-left disabled:cursor-default"
                >
                  <span className="relative block h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                    {other.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={other.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-white/45">{other.status === 'failed' ? 'Failed' : other.status === 'cancelled' ? 'Cancelled' : 'Making…'}</span>
                    )}
                  </span>
                  <span className="block truncate text-[10px] text-white/55">{other.aspectRatio} · {methodLabel(otherRun)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">Prompt</h3>
            <button type="button" onClick={copyPrompt} className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white">
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{prompt}</p>
        </section>

        {run && model && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">Settings</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {copy && <><dt className="text-white/40">Made with</dt><dd className="text-white/80">{methodLabel(run)}{copy.method === 'fit' ? ' (no AI)' : ''}</dd></>}
              {copy?.method !== 'fit' && <><dt className="text-white/40">Model</dt><dd className="text-white/80">{model.name}</dd></>}
              <dt className="text-white/40">Resolution</dt><dd className="text-white/80">{sizeOption(model, run.size)?.label ?? run.size}</dd>
              {run.quality && <><dt className="text-white/40">Quality</dt><dd className="text-white/80">{QUALITY_LABELS[run.quality]}</dd></>}
              <dt className="text-white/40">Size</dt><dd className="text-white/80">{item.aspectRatio}</dd>
              <dt className="text-white/40">Pixels</dt><dd className="text-white/80">{item.width && item.height ? `${item.width} × ${item.height}` : dimensionLabel(run.size, item.aspectRatio)}</dd>
              {run.thinking && <><dt className="text-white/40">Thinking</dt><dd className="text-white/80">{run.thinking === 'high' ? 'Thorough' : 'Fast'}</dd></>}
              <dt className="text-white/40">Image</dt><dd className="text-white/80">#{item.position + 1}{item.variation > 1 ? ` · take ${item.variation}` : ''}</dd>
            </dl>
          </section>
        )}

        {run && run.references.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">References used</h3>
            <div className="grid grid-cols-4 gap-2">
              {run.references.map((reference) => (
                <figure key={reference.id} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={reference.url} alt={reference.label} loading="lazy" className="aspect-square w-full rounded-lg border border-white/10 object-cover" />
                  <figcaption className="truncate text-[10px] text-white/45">{ROLE_LABELS[reference.role]}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {run?.brief && (
          <details className="group text-xs">
            <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-wide text-white/45 hover:text-white/70">Guidelines used</summary>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-3"><Markdown className="text-xs">{run.brief}</Markdown></div>
          </details>
        )}
      </aside>
      {resizing && <ResizeDialog open={resizing} onOpenChange={setResizing} picked={[item]} context="image" />}
    </div>
  );
}

export function Lightbox() {
  const lightboxId = usePlaygroundStore((state) => state.lightboxId);
  const setLightbox = usePlaygroundStore((state) => state.setLightbox);
  const items = usePlaygroundStore((state) => state.items);
  const runs = usePlaygroundStore((state) => state.runs);

  // Every finished image in gallery order: edits first, then runs newest first, other sizes under their run.
  const sequence = useMemo(() => {
    const edits = Object.values(items).filter((item) => item.kind === 'edit' && item.status === 'done').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const generated = orderRuns(runs).flatMap(({ run }) => runItems(items, run.id)).filter((item) => item.status === 'done');
    return [...edits, ...generated];
  }, [items, runs]);
  const index = sequence.findIndex((item) => item.id === lightboxId);
  const item = index >= 0 ? sequence[index] : null;
  const run = item?.runId ? runs.find((known) => known.id === item.runId) : undefined;

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      // Arrow keys inside "Another size" pick options there, not the next image.
      if ((event.target as HTMLElement)?.closest('input, textarea, [data-resize-dialog]')) return;
      if (event.key === 'ArrowLeft' && index > 0) setLightbox(sequence[index - 1].id);
      if (event.key === 'ArrowRight' && index < sequence.length - 1) setLightbox(sequence[index + 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, index, sequence, setLightbox]);

  return (
    <Dialog.Root open={Boolean(item)} onOpenChange={(open) => !open && setLightbox(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-0 z-[81] flex outline-none" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Image {index + 1} of {sequence.length}</Dialog.Title>
          {item && (
            <LightboxBody
              key={item.id}
              item={item}
              run={run}
              onPrev={index > 0 ? () => setLightbox(sequence[index - 1].id) : undefined}
              onNext={index < sequence.length - 1 ? () => setLightbox(sequence[index + 1].id) : undefined}
            />
          )}
          <Dialog.Close className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/75 lg:right-[396px]" aria-label="Close">
            <X className="h-5 w-5" />
          </Dialog.Close>
          <span className="pointer-events-none absolute left-4 top-5 z-10 rounded-full bg-black/40 px-3 py-1 text-xs text-white/70 backdrop-blur-md">
            {index + 1} / {sequence.length}
          </span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
