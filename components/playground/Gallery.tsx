'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ImageIcon, Loader2, Pause, Play, RotateCcw, Sparkles, Square, TextQuote, Upload } from 'lucide-react';
import toast from '@/lib/toast';
import { playgroundApi } from '@/lib/playground/api';
import { playgroundModel, sizeOption } from '@/lib/playground/models';
import { cancelRun, cancelWaiting, resume, resumeWaiting, retryItem } from '@/lib/playground/runner';
import { runItems, usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem, PlaygroundRun } from '@/lib/playground/types';
import { downloadZip, imageFileName } from '@/lib/playground/zip';
import { ImageCard } from './ImageCard';
import { timeAgo } from './ui';

const TOAST = { position: 'top-center' as const };
/** The Canvas editor is the next step of the build; its buttons appear once it exists. */
const CANVAS_ENABLED = true;

function RunSection({ run, density, onOpen, onCanvas }: {
  run: PlaygroundRun;
  density: number;
  onOpen: (id: string) => void;
  onCanvas: (id: string) => void;
}) {
  const allItems = usePlaygroundStore((state) => state.items);
  const setComposerDraft = usePlaygroundStore((state) => state.setComposerDraft);
  const items = useMemo(() => runItems(allItems, run.id), [allItems, run.id]);
  const [zipProgress, setZipProgress] = useState<string | null>(null);

  const counts = items.reduce<Record<PlaygroundItem['status'], number>>(
    (acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }),
    { queued: 0, generating: 0, done: 0, failed: 0, cancelled: 0 }
  );
  const model = playgroundModel(run.model);
  const finished = counts.done + counts.failed + counts.cancelled;
  const active = counts.queued + counts.generating > 0;
  const promptFor = (item: PlaygroundItem) => run.prompts[item.promptIndex ?? 0] ?? '';

  const saveZip = async () => {
    const done = items.filter((item) => item.status === 'done' && item.imageUrl);
    setZipProgress(`0/${done.length}`);
    try {
      await downloadZip(
        done.map((item) => ({ name: imageFileName(item.position, promptFor(item), item.aspectRatio, item.imageUrl!, item.variation), url: item.imageUrl! })),
        `playground-${new Date(run.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}`,
        (count, total) => setZipProgress(`${count}/${total}`)
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build the ZIP', TOAST);
    } finally {
      setZipProgress(null);
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white">
            <span className="font-medium">{run.prompts.length} prompt{run.prompts.length === 1 ? '' : 's'}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/65">{model.name}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/65">{sizeOption(model, run.size)?.label ?? run.size}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/65">{run.ratios.join(', ')}</span>
            {run.variations > 1 && <><span className="text-white/25">·</span><span className="text-white/65">×{run.variations}</span></>}
            <span className="text-white/25">·</span>
            <span className="text-white/40">{timeAgo(run.createdAt)}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-[#fff05a] transition-[width] duration-500" style={{ width: `${items.length ? (finished / items.length) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-white/50">
              {counts.done}/{items.length} done
              {counts.generating > 0 && ` · ${counts.generating} generating`}
              {counts.queued > 0 && ` · ${counts.queued} queued`}
              {counts.failed > 0 && <span className="text-red-300/80"> · {counts.failed} failed</span>}
              {counts.cancelled > 0 && ` · ${counts.cancelled} cancelled`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active && (
            <button type="button" onClick={() => cancelRun(run.id).catch((error) => toast.error(error.message, TOAST))} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-white/70 hover:bg-white/8 hover:text-white">
              <Square className="h-3 w-3" /> Cancel the rest
            </button>
          )}
          {counts.failed > 0 && (
            <button type="button" onClick={() => items.filter((item) => item.status === 'failed').forEach((item) => void retryItem(item))} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-white/70 hover:bg-white/8 hover:text-white">
              <RotateCcw className="h-3 w-3" /> Retry {counts.failed} failed
            </button>
          )}
          <button type="button" onClick={() => setComposerDraft(run.prompts.join('\n\n'))} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-white/70 hover:bg-white/8 hover:text-white">
            <TextQuote className="h-3 w-3" /> Reuse prompts
          </button>
          {counts.done > 0 && (
            <button type="button" disabled={Boolean(zipProgress)} onClick={saveZip} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-60">
              {zipProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {zipProgress ? `Zipping ${zipProgress}` : `Download ${counts.done}`}
            </button>
          )}
        </div>
      </header>
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${density}px, 1fr))` }}>
        {items.map((item) => (
          <ImageCard key={item.id} item={item} prompt={promptFor(item)} onOpen={() => onOpen(item.id)} onCanvas={CANVAS_ENABLED ? () => onCanvas(item.id) : undefined} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  const steps = [
    { icon: Upload, title: 'Add references and guidelines', text: 'Drop product photos on the left (or pick them from your Library) and upload a guidelines .md. They stay with the project.' },
    { icon: TextQuote, title: 'Paste your prompts', text: 'All 40 at once: numbered, one per line, or separated by blank lines.' },
    { icon: Sparkles, title: 'Generate', text: 'Each prompt becomes its own image with your references, in order, 3 at a time.' },
  ];
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <ImageIcon className="h-6 w-6 text-[#fff05a]" />
      </div>
      <h2 className="mt-5 text-2xl font-light text-white">Your images will appear here</h2>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left">
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">{index + 1}</span>
              <step.icon className="h-4 w-4 text-white/50" />
              {step.title}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/50">{step.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Gallery({ density, bottomPadding }: { density: number; bottomPadding: number }) {
  const router = useRouter();
  const runs = usePlaygroundStore((state) => state.runs);
  const items = usePlaygroundStore((state) => state.items);
  const runner = usePlaygroundStore((state) => state.runner);
  const nextBefore = usePlaygroundStore((state) => state.nextBefore);
  const projectId = usePlaygroundStore((state) => state.projectId);
  const preview = usePlaygroundStore((state) => state.preview);
  const appendOlder = usePlaygroundStore((state) => state.appendOlder);
  const setLightbox = usePlaygroundStore((state) => state.setLightbox);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const idle = runner.queue.length === 0 && runner.inFlight.length === 0 && runner.checking.length === 0;
  // Images left queued from an earlier visit (nothing is sending them), oldest run first.
  const waiting = useMemo(
    () => (idle ? [...runs].reverse().flatMap((run) => runItems(items, run.id)).filter((item) => item.status === 'queued') : []),
    [idle, items, runs]
  );
  // A run whose images were all deleted has nothing left to show.
  const visibleRuns = useMemo(() => runs.filter((run) => Object.values(items).some((item) => item.runId === run.id)), [runs, items]);
  const edits = useMemo(
    () => Object.values(items).filter((item) => item.kind === 'edit').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items]
  );
  const openCanvas = (id: string) => {
    if (projectId) router.push(`/playground/${projectId}/canvas/${id}${preview ? '?previewPlayground=1' : ''}`);
  };

  const loadOlder = async () => {
    if (!projectId || !nextBefore) return;
    setLoadingOlder(true);
    try {
      appendOlder(await playgroundApi.getProject(projectId, nextBefore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load older runs', TOAST);
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className="space-y-10 px-4 pt-5 sm:px-6" style={{ paddingBottom: bottomPadding }}>
      {runner.paused && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#fff05a]/25 bg-[#fff05a]/[0.07] px-4 py-3 text-sm text-white">
          <Pause className="h-4 w-4 text-[#fff05a]" />
          <span className="min-w-[14rem] flex-1">{runner.paused}</span>
          <button type="button" onClick={resume} className="inline-flex items-center gap-1.5 rounded-full bg-[#fff05a] px-3 py-1.5 text-xs font-medium text-black hover:bg-white">
            <Play className="h-3 w-3" /> Resume
          </button>
          <button type="button" onClick={() => cancelWaiting().catch((error) => toast.error(error.message, TOAST))} className="rounded-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/8">
            Cancel the rest
          </button>
        </div>
      )}
      {!runner.paused && waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">
          <Pause className="h-4 w-4 text-white/60" />
          <span className="min-w-[14rem] flex-1">{waiting.length} image{waiting.length === 1 ? ' is' : 's are'} waiting from an earlier session. Nothing is charged until each one starts.</span>
          <button type="button" onClick={resumeWaiting} className="inline-flex items-center gap-1.5 rounded-full bg-[#fff05a] px-3 py-1.5 text-xs font-medium text-black hover:bg-white">
            <Play className="h-3 w-3" /> Resume
          </button>
          <button type="button" onClick={() => cancelWaiting().catch((error) => toast.error(error.message, TOAST))} className="rounded-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/8">
            Cancel them
          </button>
        </div>
      )}

      {edits.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-white">Edited in Canvas <span className="text-white/40">· {edits.length}</span></h3>
          <div className="grid items-start gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${density}px, 1fr))` }}>
            {edits.map((item) => (
              <ImageCard key={item.id} item={item} prompt="Edited in Canvas" onOpen={() => setLightbox(item.id)} onCanvas={CANVAS_ENABLED ? () => openCanvas(item.id) : undefined} />
            ))}
          </div>
        </section>
      )}

      {visibleRuns.length === 0 && edits.length === 0 ? (
        <EmptyState />
      ) : (
        visibleRuns.map((run) => (
          <RunSection key={run.id} run={run} density={density} onOpen={setLightbox} onCanvas={openCanvas} />
        ))
      )}

      {nextBefore && (
        <div className="flex justify-center">
          <button type="button" onClick={loadOlder} disabled={loadingOlder} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/8 disabled:opacity-60">
            {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />} Load older runs
          </button>
        </div>
      )}
    </div>
  );
}

