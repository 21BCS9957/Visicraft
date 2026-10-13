'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { AlertTriangle, Check, Loader2, Proportions, Star, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { playgroundApi } from '@/lib/playground/api';
import { MAX_ENABLED_REFERENCES, outputDimensions, playgroundModel } from '@/lib/playground/models';
import {
  copyDimensions,
  copyKey,
  copyMinutes,
  copySize,
  DEFAULT_EXTEND_MODEL,
  EXTEND_MODELS,
  EXTEND_MOSTLY_NEW,
  FIT_COLOURS,
  looksLikeTextAds,
  newShare,
  placeOriginal,
  RATIO_NAMES,
  REELS_SAFE_ZONE,
  remakeSize,
  RESIZE_METHODS,
  RESIZE_RATIOS,
  resizePrice,
  safeApplies,
  type ResizeMethod,
  type RunResize,
} from '@/lib/playground/resize';
import { enqueue } from '@/lib/playground/runner';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem, PlaygroundRun } from '@/lib/playground/types';
import { cx, Toggle } from './ui';
import { SHOW_PRICING } from '@/lib/siteSections';

const TOAST = { position: 'top-center' as const };
const METHODS: ResizeMethod[] = ['extend', 'remake', 'fit'];
const colourKey = (projectId: string) => `visicraft:fitColour:${projectId}`;

function RatioIcon({ ratio, active }: { ratio: string; active?: boolean }) {
  const [w, h] = ratio.split(':').map(Number);
  const scale = 14 / Math.max(w, h);
  return <span className={cx('inline-block rounded-[2px] border', active ? 'border-[#fff05a]' : 'border-white/50')} style={{ width: Math.max(3, w * scale), height: Math.max(3, h * scale) }} />;
}

const credits = (value: number) => value.toLocaleString('en-IN');

/** The Fit colour last used in this project (in this browser), or a dark green. */
function savedColour(projectId: string | null): string {
  try {
    const saved = projectId ? window.localStorage.getItem(colourKey(projectId)) : null;
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) return saved;
  } catch {
    // Private browsing: the default colour.
  }
  return '#1f3b2d';
}

/** The originals behind the picked images: a copy stands for the image it was made from. */
export function originalsOf(picked: PlaygroundItem[], items: Record<string, PlaygroundItem>, runs: PlaygroundRun[]): PlaygroundItem[] {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const found = new Map<string, PlaygroundItem>();
  for (const item of picked) {
    const isCopy = Boolean(item.runId && runById.get(item.runId)?.resize);
    const original = isCopy ? (item.parentItemId ? items[item.parentItemId] : undefined) : item;
    if (original) found.set(original.id, original);
  }
  return [...found.values()].sort((a, b) => a.position - b.position);
}

/** A local "Another size" run for the dev preview: the same shape the server returns, nothing is sent. */
function previewResizeRun(options: {
  originals: PlaygroundItem[];
  ratio: string;
  resize: RunResize;
  model: string;
  size: PlaygroundRun['size'];
  creditsPerImage: number;
  promptOf: (item: PlaygroundItem) => string;
}): { run: PlaygroundRun; items: PlaygroundItem[] } {
  const id = `preview-resize-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const prompts: string[] = [];
  const items = options.originals.map((original, index) => {
    const prompt = options.promptOf(original);
    if (!prompts.includes(prompt)) prompts.push(prompt);
    return {
      id: `${id}-${index}`, runId: id, kind: 'generated' as const, parentItemId: original.id, position: options.resize.fromRunId ? original.position : index,
      promptIndex: prompts.indexOf(prompt), aspectRatio: options.ratio, variation: original.variation, status: 'queued' as const,
      imageUrl: null, previewUrl: null, width: null, height: null, error: null, favorite: false, attempts: 0, hasCanvas: false,
      startedAt: null, finishedAt: null, createdAt,
    };
  });
  return {
    run: {
      id, model: playgroundModel(options.model).id, size: options.size, ratios: [options.ratio], variations: 1, thinking: null, quality: null,
      brief: '', references: [], prompts, imageCount: items.length, creditsPerImage: options.creditsPerImage, cancelledAt: null, createdAt,
      resize: options.resize,
    },
    items,
  };
}

/**
 * The new shape with the original placed in it, the AI's part marked, and Reels' covered areas
 * on a 9:16. With "keep clear" the band the text is kept in is outlined (the image slides to put
 * its text there; where exactly depends on the image).
 */
function LayoutPreview({ original, ratio, method, background, keepClear }: { original: PlaygroundItem; ratio: string; method: ResizeMethod; background: string; keepClear: boolean }) {
  const [cw, ch] = ratio.split(':').map(Number);
  const canvas = outputDimensions('2K', ratio) ?? { width: cw * 100, height: ch * 100 };
  const [ow, oh] = original.width && original.height ? [original.width, original.height] : original.aspectRatio.split(':').map((n) => Number(n) * 100);
  const rect = placeOriginal(ow, oh, canvas.width, canvas.height, method === 'extend' ? 'extend' : 'fit', ratio);
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const image = original.previewUrl ?? original.imageUrl ?? '';
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/12 bg-black [--preview-h:170px] sm:[--preview-h:260px]"
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}`, maxHeight: 'var(--preview-h)', maxWidth: `calc(var(--preview-h) * ${canvas.width / canvas.height})` }}
    >
      {method === 'fit' && background === 'blur' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg brightness-75" />
      )}
      {method === 'fit' && background !== 'blur' && <div className="absolute inset-0" style={{ background }} />}
      {method === 'extend' && (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,240,90,0.16)_0_6px,rgba(255,240,90,0.04)_6px_12px)]" />
      )}
      {method === 'remake' ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-snug text-white/80">Made again for {ratio}, laid out like the original</div>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute object-cover" style={{ left: pct(rect.left, canvas.width), top: pct(rect.top, canvas.height), width: pct(rect.width, canvas.width), height: pct(rect.height, canvas.height) }} />
      )}
      {method === 'extend' && rect.top > 0 && <span className="absolute inset-x-0 top-1 text-center text-[10px] font-medium text-[#fff6a8]">AI paints</span>}
      {method === 'extend' && rect.left > 0 && <span className="absolute inset-y-0 left-1 flex items-center text-[10px] font-medium text-[#fff6a8] [writing-mode:vertical-rl]">AI paints</span>}
      {ratio === '9:16' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/60 bg-black/25" style={{ height: `${REELS_SAFE_ZONE.top * 100}%` }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/60 bg-black/25" style={{ height: `${REELS_SAFE_ZONE.bottom * 100}%` }} />
        </>
      )}
      {keepClear && (
        <div
          className="pointer-events-none absolute inset-x-1 flex items-start justify-center rounded border-2 border-[#fff05a]/90"
          style={{ top: `${REELS_SAFE_ZONE.top * 100}%`, bottom: `${REELS_SAFE_ZONE.bottom * 100}%` }}
        >
          <span className="mt-1 rounded-full bg-black/70 px-1.5 py-px text-[9px] font-medium text-[#fff05a]">text stays here</span>
        </div>
      )}
    </div>
  );
}

export function ResizeDialog({ open, onOpenChange, picked, context }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The images to resize: a run's images, or one image. */
  picked: PlaygroundItem[];
  /** "from this run" or "this image", for the heading. */
  context: 'run' | 'image';
}) {
  const { user } = useAuth();
  const { credits: balance, loading: creditsLoading } = useCredits();
  const projectId = usePlaygroundStore((state) => state.projectId);
  const preview = usePlaygroundStore((state) => state.preview);
  const items = usePlaygroundStore((state) => state.items);
  const runs = usePlaygroundStore((state) => state.runs);
  const addRun = usePlaygroundStore((state) => state.addRun);

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const originals = useMemo(() => originalsOf(picked, items, runs), [picked, items, runs]);
  const finished = useMemo(() => originals.filter((item) => item.status === 'done' && item.imageUrl), [originals]);
  const sourceRun = finished[0]?.runId ? runById.get(finished[0].runId) ?? null : null;
  const unfinished = originals.length - finished.length;

  // The dialog mounts each time it opens: 9:16 unless the images already are, Extend, this project's last colour.
  const [ratio, setRatio] = useState(() => (finished.length && finished.every((item) => item.aspectRatio === '9:16') ? '4:5' : '9:16'));
  const [method, setMethod] = useState<ResizeMethod>('extend');
  const [extendModel, setExtendModel] = useState<string>(DEFAULT_EXTEND_MODEL);
  const [background, setBackground] = useState('blur');
  const [colour, setColour] = useState(() => savedColour(projectId));
  // Images tapped off in the picker: every image is in until the user leaves it out.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  // Designed ads (their prompts talk about headlines, logos, offers…) keep clear of Reels' buttons by default.
  const textAds = useMemo(() => looksLikeTextAds(finished.map((item) => {
    const run = item.runId ? runById.get(item.runId) : undefined;
    return run?.prompts[item.promptIndex ?? 0] ?? '';
  })), [finished, runById]);
  const [safe, setSafe] = useState(textAds);
  const [busy, setBusy] = useState<'all' | 'one' | null>(null);

  const remakeModel = sourceRun ? playgroundModel(sourceRun.model) : null;
  const remakeBlocked = !sourceRun
    ? 'Images edited in Canvas have no prompt to make again. Use Extend or Fit.'
    : sourceRun.references.length + 1 > MAX_ENABLED_REFERENCES
      ? `This run already sends ${sourceRun.references.length} references; Remake adds the original as one more.`
      : remakeModel && !remakeModel.ratios.includes(ratio)
        ? `${remakeModel.name} can't make ${ratio} images.`
        : null;
  const activeMethod: ResizeMethod = method === 'remake' && remakeBlocked ? 'extend' : method;

  const sameShape = finished.filter((item) => item.aspectRatio === ratio);
  const candidates = finished.filter((item) => item.aspectRatio !== ratio);
  const copyModel = activeMethod === 'extend' ? extendModel : sourceRun?.model ?? DEFAULT_EXTEND_MODEL;
  const fitBackground = background === 'blur' ? 'blur' : background === 'colour' ? colour.toLowerCase() : background;
  const safeOffered = safeApplies(activeMethod, ratio);
  const keepClear = safeOffered && safe;
  const resize: RunResize = {
    method: activeMethod,
    fromRunId: sourceRun?.id ?? null,
    ...(activeMethod === 'fit' ? { background: fitBackground } : {}),
    ...(keepClear ? { safe: true } : {}),
  };

  // Originals that already have this copy (made or on its way) are left out; a failed one can be made again.
  const key = copyKey(ratio, { model: copyModel, resize });
  const taken = new Set<string>();
  for (const item of Object.values(items)) {
    if (!item.parentItemId || !item.runId || item.status === 'cancelled' || item.status === 'failed' || item.aspectRatio !== ratio) continue;
    const run = runById.get(item.runId);
    if (run?.resize && copyKey(item.aspectRatio, run) === key) taken.add(item.parentItemId);
  }
  // What can still get this copy, and of that what the user kept in the picker.
  const pickable = candidates.filter((item) => !taken.has(item.id));
  const existing = candidates.length - pickable.length;
  const toMake = pickable.filter((item) => !excluded.has(item.id));
  const leftOut = pickable.length - toMake.length;
  const favourites = pickable.filter((item) => item.favorite);
  // The copies' size comes from the images being made, as on the server.
  const sizedBy = toMake.length ? toMake : candidates;
  const widest = Math.max(0, ...sizedBy.map((item) => item.width ?? 0));
  const tallest = Math.max(0, ...sizedBy.map((item) => item.height ?? 0));
  const copySizeClass = copySize(widest, tallest, sourceRun?.size);
  const toggle = (id: string) => setExcluded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const priceFor = (option: ResizeMethod, model = extendModel) => option === 'fit'
    ? { credits: 0, usd: 0 }
    : option === 'extend'
      ? resizePrice({ method: 'extend', model, size: copySizeClass })
      : sourceRun
        ? resizePrice({ method: 'remake', model: sourceRun.model, size: sourceRun.size, quality: sourceRun.quality, referenceCount: sourceRun.references.length })
        : { credits: 0, usd: 0 };
  const price = priceFor(activeMethod);
  const total = price.credits * toMake.length;
  const short = !preview && !creditsLoading && Boolean(user) && total > balance;
  const shortForOne = !preview && !creditsLoading && Boolean(user) && price.credits > balance;
  const shown = toMake[0] ?? pickable[0] ?? candidates[0] ?? finished[0];
  const share = shown ? newShare(shown.width ?? 0, shown.height ?? 0, ratio) : 0;
  const runSize = activeMethod === 'remake' && sourceRun ? remakeSize(sourceRun.model, sourceRun.size) : copySizeClass;
  const pixels = copyDimensions(runSize, ratio);
  const minutes = copyMinutes(activeMethod, copyModel, runSize, toMake.length, sourceRun?.quality);
  const canMake = toMake.length > 0 && !short && !busy && Boolean(projectId);
  // "Try 1 first" when several are picked: one copy to check the look before paying for all.
  const canTryOne = toMake.length > 1 && price.credits > 0 && !shortForOne && !busy && Boolean(projectId);

  const promptOf = (item: PlaygroundItem) => {
    const run = item.runId ? runById.get(item.runId) : undefined;
    return (run?.prompts[item.promptIndex ?? 0] ?? '').trim() || 'Edited in Canvas';
  };

  const make = async (list: PlaygroundItem[], which: 'all' | 'one') => {
    if (!projectId || !list.length || busy) return;
    setBusy(which);
    try {
      if (activeMethod === 'fit' && background === 'colour') {
        try {
          window.localStorage.setItem(colourKey(projectId), colour);
        } catch {
          // Private browsing: nothing is kept.
        }
      }
      const { run, items: queued, note } = preview
        ? { ...previewResizeRun({ originals: list, ratio, resize, model: copyModel, size: runSize, creditsPerImage: price.credits, promptOf }), note: null }
        : await playgroundApi.resizeImages(projectId, {
          clientKey: crypto.randomUUID(),
          itemIds: list.map((item) => item.id),
          ratio,
          method: activeMethod,
          ...(activeMethod === 'extend' ? { model: extendModel } : {}),
          ...(activeMethod === 'fit' ? { background: fitBackground } : {}),
          ...(keepClear ? { safe: true } : {}),
          expectedCredits: price.credits * list.length,
        });
      addRun(run, queued);
      enqueue(queued.map((item) => item.id));
      onOpenChange(false);
      toast.success(
        which === 'one'
          ? `Trying 1 ${ratio} copy (#${(list[0].position ?? 0) + 1}). Check it, then make the rest.`
          : `${queued.length} ${ratio} ${queued.length === 1 ? 'copy' : 'copies'} queued${note ? ` (${note})` : ''}`,
        TOAST
      );
      // The new run sits under its source run in the gallery.
      setTimeout(() => document.getElementById(`run-${run.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not make the other size', TOAST);
      setBusy(null);
    }
  };

  const heading = context === 'image'
    ? 'This image'
    : `${finished.length} finished image${finished.length === 1 ? '' : 's'} from this run`;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[84] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content data-resize-dialog="" className="fixed inset-x-0 bottom-0 z-[85] flex max-h-[92dvh] flex-col rounded-t-3xl border border-white/12 bg-[#141418] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(760px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-lg font-medium"><Proportions className="h-5 w-5 text-[#fff05a]" /> Another size</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-white/55">
                {heading}{unfinished > 0 && <span className="text-white/40"> · {unfinished} still being made {unfinished === 1 ? 'is' : 'are'} left out</span>}
              </Dialog.Description>
            </div>
            <Dialog.Close disabled={Boolean(busy)} aria-label="Close" className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white disabled:opacity-40">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
              <div className="min-w-0 space-y-5">
                {context === 'run' && candidates.length > 1 && (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/45">
                        Images <span className="normal-case tracking-normal text-white/40">· {toMake.length} of {pickable.length} picked</span>
                      </h3>
                      <div className="flex items-center gap-1 text-[11px]">
                        <button type="button" onClick={() => setExcluded(new Set())} className="rounded-full px-2 py-1 text-white/60 hover:bg-white/8 hover:text-white">All</button>
                        <button type="button" onClick={() => setExcluded(new Set(pickable.map((item) => item.id)))} className="rounded-full px-2 py-1 text-white/60 hover:bg-white/8 hover:text-white">None</button>
                        {favourites.length > 0 && (
                          <button type="button" onClick={() => setExcluded(new Set(pickable.filter((item) => !item.favorite).map((item) => item.id)))} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/60 hover:bg-white/8 hover:text-white">
                            <Star className="h-3 w-3 fill-[#fff05a] text-[#fff05a]" /> Favourites
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid max-h-[148px] grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 overflow-y-auto pr-1">
                      {candidates.map((item) => {
                        const made = taken.has(item.id);
                        const on = !made && !excluded.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={made}
                            onClick={() => toggle(item.id)}
                            aria-pressed={on}
                            aria-label={`Image ${item.position + 1}: ${made ? 'already has this version' : on ? 'included' : 'left out'}`}
                            title={`#${item.position + 1}${made ? ' · already made' : ''}`}
                            className={cx('relative aspect-square overflow-hidden rounded-lg border-2 !p-0 transition', on ? 'border-[#fff05a]/80' : 'border-transparent opacity-40 hover:opacity-70', made && 'cursor-not-allowed hover:opacity-40')}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.previewUrl ?? item.imageUrl ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" />
                            {on && (
                              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#fff05a]">
                                <Check className="h-3 w-3 text-black" />
                              </span>
                            )}
                            {made && <span className="absolute inset-x-0 bottom-0 bg-black/75 py-px text-center text-[9px] text-white/85">made</span>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-white/40">Tap an image to leave it out (or put it back).</p>
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/45">Shape</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {RESIZE_RATIOS.map((option) => {
                      const active = option === ratio;
                      const all = finished.length > 0 && finished.every((item) => item.aspectRatio === option);
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={all}
                          title={all ? `Already ${option}` : undefined}
                          onClick={() => setRatio(option)}
                          className={cx('inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35', active ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:text-white')}
                        >
                          <RatioIcon ratio={option} active={active} /> {option}{RATIO_NAMES[option] && <span className={cx(active ? 'text-[#fff05a]/75' : 'text-white/40')}>{RATIO_NAMES[option]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/45">How</h3>
                  <div role="radiogroup" aria-label="How to make the new size" className="space-y-2">
                    {METHODS.map((option) => {
                      const blocked = option === 'remake' ? remakeBlocked : null;
                      const active = activeMethod === option;
                      const each = priceFor(option).credits;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={`${RESIZE_METHODS[option].label}, ${each ? `${credits(each)} credits each` : 'free'}`}
                          disabled={Boolean(blocked)}
                          onClick={() => setMethod(option)}
                          className={cx('flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45', active ? 'border-[#fff05a]/45 bg-[#fff05a]/[0.07]' : 'border-white/10 bg-white/[0.03] hover:border-white/20')}
                        >
                          <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-[#fff05a] bg-[#fff05a]' : 'border-white/30')}>
                            {active && <Check className="h-3 w-3 text-black" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <span className="text-sm font-medium text-white">
                                {RESIZE_METHODS[option].label}
                                {option === 'extend' && <span className="ml-2 text-[11px] font-normal text-white/40">photos</span>}
                                {option === 'remake' && <span className="ml-2 text-[11px] font-normal text-white/40">ads with text</span>}
                              </span>
                              <span className="text-xs text-white/60">{each ? `${credits(each)} credits each` : 'Free'}</span>
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-white/50">{blocked ?? RESIZE_METHODS[option].blurb}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {activeMethod === 'extend' && (
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/45">Model</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {EXTEND_MODELS.map((id) => (
                        <button key={id} type="button" onClick={() => setExtendModel(id)} className={cx('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs', extendModel === id ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 bg-white/[0.04] text-white/75 hover:text-white')}>
                          {playgroundModel(id).name} <span className="opacity-60">{priceFor('extend', id).credits}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {activeMethod === 'remake' && sourceRun && remakeModel && (
                  <p className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-white/55">
                    {remakeModel.name} · {remakeSize(sourceRun.model, sourceRun.size)} · the same prompts{sourceRun.references.length ? `, ${sourceRun.references.length} reference${sourceRun.references.length === 1 ? '' : 's'}` : ''}{sourceRun.brief ? ' and guidelines' : ''}, plus the original as the layout.
                    {ratio === '9:16' && ' It is asked to keep text and logos out of the top 14% and bottom 35%, where Reels shows its own buttons; check them before posting. For a sure result, use Extend or Fit with "Keep clear of Reels buttons".'}
                  </p>
                )}
                {activeMethod === 'fit' && (
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/45">Background</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[{ id: 'blur', label: 'Blurred' }, ...FIT_COLOURS].map((option) => (
                        <button key={option.id} type="button" onClick={() => setBackground(option.id)} className={cx('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs', background === option.id ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 bg-white/[0.04] text-white/75 hover:text-white')}>
                          <span className="h-3.5 w-3.5 rounded-full border border-white/25" style={{ background: option.id === 'blur' ? 'linear-gradient(135deg,#8a7a6a,#2d3a4a)' : option.id }} />
                          {option.label}
                        </button>
                      ))}
                      <label className={cx('inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs', background === 'colour' ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 bg-white/[0.04] text-white/75 hover:text-white')}>
                        <input type="color" value={colour} onChange={(event) => { setColour(event.target.value); setBackground('colour'); }} onClick={() => setBackground('colour')} className="h-4 w-4 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-white/25 [&::-webkit-color-swatch-wrapper]:p-0" aria-label="Brand colour" />
                        Colour {background === 'colour' && <span className="font-mono opacity-70">{colour}</span>}
                      </label>
                    </div>
                  </section>
                )}

                {safeOffered && (
                  <label className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3', keepClear ? 'border-[#fff05a]/30 bg-[#fff05a]/[0.05]' : 'border-white/10 bg-white/[0.03]')}>
                    <span className="mt-0.5"><Toggle checked={safe} onCheckedChange={setSafe} label="Keep clear of Reels buttons" /></span>
                    <span className="min-w-0 text-xs leading-relaxed">
                      <span className="block text-sm text-white">Keep clear of Reels buttons</span>
                      <span className="block text-white/50">
                        A quick look finds each ad&apos;s headline, logo and price, then the image slides up or down so they sit between the top bar and the caption area. It shrinks only if its text is too tall to fit. Same price.
                        {textAds && <span className="text-[#fff6a8]/80"> Suggested: these look like ads with text.</span>}
                      </span>
                    </span>
                  </label>
                )}

                {activeMethod === 'extend' && share > EXTEND_MOSTLY_NEW && (
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-[#fff6a8]/85">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {Math.round(share * 100)}% of each new image would be painted by AI. Remake usually does better here.
                  </p>
                )}
              </div>

              <div className="order-first space-y-2 sm:order-none">
                {shown && <LayoutPreview original={shown} ratio={ratio} method={activeMethod} background={fitBackground} keepClear={keepClear} />}
                {ratio === '9:16' && <p className="text-center text-[10px] leading-snug text-white/40">Shaded: where Reels covers the picture with its own buttons</p>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/8 p-4 sm:p-5">
            {/* Its own row on a phone, so the buttons don't squeeze it into a sliver. */}
            <div className="min-w-0 flex-1 basis-full text-xs leading-snug sm:basis-0">
              <div className="text-white/80">
                {toMake.length
                  ? `${toMake.length} image${toMake.length === 1 ? '' : 's'}${price.credits ? ` × ${credits(price.credits)} = ${credits(total)} credits` : ' · free'}${pixels ? ` · ${pixels.width} × ${pixels.height}` : ''}`
                  : 'Nothing to make'}
              </div>
              {toMake.length > 0 && (
                <div className="text-white/45">
                  {activeMethod === 'fit' ? 'Ready in seconds' : `About ${minutes} min · keep this tab open while they're made`}
                </div>
              )}
              <div className={cx(short ? 'text-red-300' : 'text-white/40')}>
                {[
                  leftOut ? `${leftOut} left out` : '',
                  sameShape.length ? `${sameShape.length} already ${ratio}` : '',
                  existing ? `${existing} already ${existing === 1 ? 'has' : 'have'} this version` : '',
                  short ? `you have ${credits(balance)}` : price.credits && !preview && user ? `you have ${credits(balance)}` : '',
                ].filter(Boolean).join(' · ')}
                {short && SHOW_PRICING && <> · <Link href="/pricing" className="underline">get credits</Link></>}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {toMake.length > 1 && price.credits > 0 && (
                <button
                  type="button"
                  onClick={() => make(toMake.slice(0, 1), 'one')}
                  disabled={!canTryOne}
                  title={`Make only #${toMake[0].position + 1} first, to check the look`}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/85 transition-colors hover:bg-white/8 disabled:opacity-40"
                >
                  {busy === 'one' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Try 1 first <span className="text-white/45">{credits(price.credits)}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => make(toMake, 'all')}
                disabled={!canMake}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
              >
                {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Proportions className="h-4 w-4" />}
                Make {toMake.length || ''} at {ratio}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
