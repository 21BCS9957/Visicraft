'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, Layers, ListOrdered, Loader2, Minimize2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { playgroundApi } from '@/lib/playground/api';
import {
  dimensionLabel,
  MAX_ENABLED_REFERENCES,
  nearestSize,
  PLAYGROUND_MODELS,
  playgroundModel,
  RATIO_PRESETS,
  runCost,
  runMinutes,
  sizeOption,
} from '@/lib/playground/models';
import { MAX_IMAGES_PER_RUN, MAX_VARIATIONS, parseCsvPrompts, parsePromptList, type SplitMode } from '@/lib/playground/prompts';
import { enqueue } from '@/lib/playground/runner';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem, PlaygroundRun } from '@/lib/playground/types';
import { PromptWriter } from './PromptWriter';
import { Chip, cx, Popover } from './ui';

const TOAST = { position: 'top-center' as const };

function RatioIcon({ ratio, active }: { ratio: string; active?: boolean }) {
  const [w, h] = ratio.split(':').map(Number);
  const scale = 14 / Math.max(w, h);
  return (
    <span
      className={cx('inline-block rounded-[2px] border', active ? 'border-[#fff05a]' : 'border-white/50')}
      style={{ width: Math.max(3, w * scale), height: Math.max(3, h * scale) }}
    />
  );
}

/** A local run for the dev preview: the same shape the server returns, nothing is sent. */
function previewRun(prompts: string[], settings: ReturnType<typeof usePlaygroundStore.getState>['settings'], brief: string): { run: PlaygroundRun; items: PlaygroundItem[] } {
  const model = playgroundModel(settings.model);
  const id = `preview-run-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const items: PlaygroundItem[] = [];
  prompts.forEach((_, promptIndex) => settings.ratios.forEach((ratio) => {
    for (let variation = 1; variation <= settings.variations; variation++) {
      items.push({
        id: `${id}-${items.length}`, runId: id, kind: 'generated', parentItemId: null, position: items.length, promptIndex,
        aspectRatio: ratio, variation, status: 'queued', imageUrl: null, previewUrl: null, width: null, height: null,
        error: null, favorite: false, attempts: 0, hasCanvas: false, startedAt: null, finishedAt: null, createdAt,
      });
    }
  }));
  return {
    run: {
      id, model: model.id, size: settings.size, ratios: settings.ratios, variations: settings.variations,
      thinking: model.thinking ? settings.thinking : null, brief, references: [], prompts,
      imageCount: items.length, creditsPerImage: sizeOption(model, settings.size)?.credits ?? 0, cancelledAt: null, createdAt,
    },
    items,
  };
}

export function Composer({ onHeight }: { onHeight: (height: number) => void }) {
  const { user } = useAuth();
  const { credits, loading: creditsLoading } = useCredits();
  const project = usePlaygroundStore((state) => state.project);
  const preview = usePlaygroundStore((state) => state.preview);
  const references = usePlaygroundStore((state) => state.references);
  const settings = usePlaygroundStore((state) => state.settings);
  const setSettings = usePlaygroundStore((state) => state.setSettings);
  const addRun = usePlaygroundStore((state) => state.addRun);
  const composerDraft = usePlaygroundStore((state) => state.composerDraft);
  const setComposerDraft = usePlaygroundStore((state) => state.setComposerDraft);

  const [text, setText] = useState('');
  const [mode, setMode] = useState<SplitMode>('auto');
  const [edited, setEdited] = useState<string[] | null>(null);
  const [view, setView] = useState<'write' | 'review'>('write');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstSettings = useRef(true);

  const parsed = useMemo(() => parsePromptList(text, mode), [text, mode]);
  const prompts = edited ?? parsed.prompts;
  const model = playgroundModel(settings.model);
  const size = sizeOption(model, settings.size) ?? model.sizes[0];
  const enabledRefs = references.filter((reference) => reference.enabled);
  const cost = runCost({
    model: model.id,
    size: size.id,
    promptCount: prompts.length,
    ratioCount: settings.ratios.length,
    variations: settings.variations,
    referenceCount: enabledRefs.length,
  });
  const tooMany = cost.images > MAX_IMAGES_PER_RUN;
  const tooManyRefs = enabledRefs.length > MAX_ENABLED_REFERENCES;
  const short = !preview && !creditsLoading && Boolean(user) && credits < cost.credits;
  const canGenerate = prompts.length > 0 && !tooMany && !tooManyRefs && !short && !submitting && Boolean(project);

  // "Reuse prompts" from a run.
  useEffect(() => {
    if (composerDraft === null) return;
    setText(composerDraft);
    setEdited(null);
    setView('write');
    setExpanded(true);
    setComposerDraft(null);
  }, [composerDraft, setComposerDraft]);

  // Remember the choices with the project.
  useEffect(() => {
    if (firstSettings.current) {
      firstSettings.current = false;
      return;
    }
    if (!project || preview) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      playgroundApi.updateProject(project.id, { settings }).catch(() => undefined);
    }, 1_000);
  }, [settings, project?.id, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => onHeight(box.offsetHeight + 32));
    observer.observe(box);
    return () => observer.disconnect();
  }, [onHeight]);

  const chooseModel = (id: string) => {
    const next = playgroundModel(id);
    const ratios = settings.ratios.filter((ratio) => next.ratios.includes(ratio));
    setSettings({ model: next.id, size: nearestSize(next, settings.size), ratios: ratios.length ? ratios : ['1:1'] });
  };
  const toggleRatio = (ratio: string) => {
    const has = settings.ratios.includes(ratio);
    if (has && settings.ratios.length === 1) return;
    setSettings({ ratios: has ? settings.ratios.filter((known) => known !== ratio) : [...settings.ratios, ratio] });
  };
  const editPrompt = (index: number, value: string) => {
    const next = [...prompts];
    next[index] = value;
    setEdited(next);
  };
  const removePrompt = (index: number) => setEdited(prompts.filter((_, i) => i !== index));

  const takeWritten = (list: string[], mode: 'replace' | 'add') => {
    const next = mode === 'add' ? [...prompts, ...list] : list;
    setText(next.join('\n\n'));
    setMode('blocks');
    setEdited(null);
    setView('review');
    setExpanded(true);
  };

  const importFile = async (file: File) => {
    const content = await file.text();
    const list = /\.csv$/i.test(file.name) ? parseCsvPrompts(content).prompts : parsePromptList(content).prompts;
    setText(list.join('\n\n'));
    setMode('auto');
    setEdited(null);
    setExpanded(true);
    toast.success(`${list.length} prompts imported`, TOAST);
  };

  const generate = async () => {
    if (!project || !canGenerate) return;
    const clean = prompts.map((prompt) => prompt.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      const { run, items } = preview
        ? previewRun(clean, settings, project.brief)
        : await playgroundApi.createRun(project.id, {
          clientKey: crypto.randomUUID(),
          prompts: clean,
          model: model.id,
          size: size.id,
          aspectRatios: settings.ratios,
          variations: settings.variations,
          thinking: model.thinking ? settings.thinking : undefined,
          brief: project.brief,
          referenceIds: enabledRefs.map((reference) => reference.id),
        });
      addRun(run, items);
      enqueue(items.map((item) => item.id));
      setText('');
      setEdited(null);
      setView('write');
      setExpanded(false);
      toast.success(`${items.length} image${items.length === 1 ? '' : 's'} queued`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the run', TOAST);
    } finally {
      setSubmitting(false);
    }
  };

  const summary = prompts.length
    ? `${prompts.length} prompt${prompts.length === 1 ? '' : 's'} × ${settings.ratios.length} size${settings.ratios.length === 1 ? '' : 's'}${settings.variations > 1 ? ` × ${settings.variations}` : ''} = ${cost.images} image${cost.images === 1 ? '' : 's'}`
    : 'Paste prompts to see the cost';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-4 sm:px-6">
      <div ref={boxRef} className="pointer-events-auto w-full max-w-4xl rounded-[26px] border border-white/12 bg-[#141418]/88 shadow-[0_24px_90px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
        {expanded ? (
          <div className="border-b border-white/8 p-3 pb-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-xs">
                <button type="button" onClick={() => setView('write')} className={cx('rounded-full px-3 py-1', view === 'write' ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white')}>
                  Write
                </button>
                <button type="button" onClick={() => setView('review')} disabled={!prompts.length} className={cx('flex items-center gap-1 rounded-full px-3 py-1 disabled:opacity-40', view === 'review' ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white')}>
                  <ListOrdered className="h-3 w-3" /> Review {prompts.length || ''}
                </button>
              </div>
              {view === 'write' && (
                <Popover
                  side="top"
                  className="w-64"
                  trigger={<Chip><Layers className="h-3 w-3" /> Split: {mode === 'auto' ? 'Auto' : mode === 'lines' ? 'Each line' : 'Blank lines'} <ChevronDown className="h-3 w-3" /></Chip>}
                >
                  {([['auto', 'Auto', 'Numbered list, bullets, blank lines or one per line'], ['lines', 'Each line', 'Every line is its own prompt'], ['blocks', 'Blank lines', 'Paragraphs separated by an empty line']] as const).map(([id, name, hint]) => (
                    <button key={id} type="button" onClick={() => { setMode(id); setEdited(null); }} className="flex w-full items-start justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/8">
                      <span><span className="block text-sm text-white">{name}</span><span className="block text-[11px] text-white/40">{hint}</span></span>
                      {mode === id && <Check className="mt-0.5 h-4 w-4 text-[#fff05a]" />}
                    </button>
                  ))}
                </Popover>
              )}
              <Chip onClick={() => setWriterOpen(true)} className="border-[#fff05a]/30 text-[#fff6a8] hover:border-[#fff05a]/60"><Sparkles className="h-3 w-3" /> Write with Claude</Chip>
              <Chip onClick={() => fileRef.current?.click()}><FileText className="h-3 w-3" /> Import .txt / .csv</Chip>
              <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />
              <span className="ml-auto flex items-center gap-1">
                {(text || edited) && (
                  <button type="button" onClick={() => { setText(''); setEdited(null); setView('write'); }} className="rounded-full px-2.5 py-1 text-xs text-white/50 hover:bg-white/8 hover:text-white">
                    Clear
                  </button>
                )}
                <button type="button" onClick={() => setExpanded(false)} aria-label="Collapse" title="Collapse" className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white">
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>

            {view === 'write' ? (
              <textarea
                autoFocus
                value={text}
                onChange={(event) => { setText(event.target.value); setEdited(null); }}
                onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void generate(); }}
                placeholder={'Paste all your prompts at once, for example:\n1. Hero shot of the product on dark walnut, warm diya light\n2. Flat lay on linen with loose chamomile\n3. …'}
                className="max-h-[38vh] min-h-[140px] w-full resize-y rounded-2xl border border-white/8 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/20"
              />
            ) : (
              <ol className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                {prompts.map((prompt, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="mt-2 w-6 shrink-0 text-right text-xs tabular-nums text-white/35">{index + 1}</span>
                    <textarea
                      value={prompt}
                      onChange={(event) => editPrompt(index, event.target.value)}
                      rows={Math.min(5, Math.max(1, Math.ceil(prompt.length / 110)))}
                      className="min-w-0 flex-1 resize-y rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-white/20"
                    />
                    <button type="button" onClick={() => removePrompt(index)} aria-label={`Remove prompt ${index + 1}`} title="Remove" className="mt-1.5 rounded-full p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                <li className="pl-8">
                  <button type="button" onClick={() => setEdited([...prompts, ''])} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/8 hover:text-white">
                    <Plus className="h-3 w-3" /> Add a prompt
                  </button>
                </li>
              </ol>
            )}
            {parsed.warnings.length > 0 && !edited && (
              <p className="mt-2 text-[11px] text-[#fff6a8]/80">{parsed.warnings.join(' ')}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 pb-1 pt-3">
            <button type="button" onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-0.5 text-left text-sm text-white/40 hover:text-white/60">
              <FileText className="h-4 w-4 shrink-0 text-white/40" />
              <span className="truncate">{prompts.length ? `${prompts.length} prompts ready. Click to review` : 'Paste your prompts: all 40 at once, one image each…'}</span>
            </button>
            <Chip onClick={() => setWriterOpen(true)} className="shrink-0 border-[#fff05a]/30 text-[#fff6a8] hover:border-[#fff05a]/60">
              <Sparkles className="h-3 w-3" /> Write with Claude
            </Chip>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 p-3">
          <Popover
            side="top"
            className="w-80"
            trigger={<Chip>{model.name} <ChevronDown className="h-3 w-3" /></Chip>}
          >
            {PLAYGROUND_MODELS.map((option) => (
              <button key={option.id} type="button" onClick={() => chooseModel(option.id)} className="flex w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/8">
                <span>
                  <span className="block text-sm text-white">{option.name}</span>
                  <span className="block text-[11px] text-white/45">{option.blurb}</span>
                  <span className="mt-0.5 block text-[11px] text-white/35">
                    {option.sizes.map((s) => s.label).join(' · ')} · from {Math.min(...option.sizes.map((s) => s.credits))} credits
                  </span>
                </span>
                {option.id === model.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#fff05a]" />}
              </button>
            ))}
          </Popover>

          <Popover side="top" className="w-72" trigger={<Chip>{size.label} <ChevronDown className="h-3 w-3" /></Chip>}>
            <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/40">Quality</p>
            {model.sizes.map((option) => (
              <button key={option.id} type="button" onClick={() => setSettings({ size: option.id })} className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/8">
                <span>
                  <span className="block text-sm text-white">{option.label}</span>
                  <span className="block text-[11px] text-white/40">{dimensionLabel(option.id, settings.ratios[0])} px at {settings.ratios[0]}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-white/60">
                  {option.credits} credits
                  {option.id === size.id && <Check className="h-4 w-4 text-[#fff05a]" />}
                </span>
              </button>
            ))}
          </Popover>

          <Popover
            side="top"
            className="w-80"
            trigger={
              <Chip>
                <span className="flex items-center gap-1">{settings.ratios.slice(0, 3).map((ratio) => <RatioIcon key={ratio} ratio={ratio} />)}</span>
                {settings.ratios.length === 1 ? settings.ratios[0] : `${settings.ratios.length} sizes`}
                <ChevronDown className="h-3 w-3" />
              </Chip>
            }
          >
            <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/40">Presets</p>
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {RATIO_PRESETS.map((preset) => (
                <Chip key={preset.ratio} active={settings.ratios.includes(preset.ratio)} onClick={() => toggleRatio(preset.ratio)}>
                  <RatioIcon ratio={preset.ratio} active={settings.ratios.includes(preset.ratio)} /> {preset.label} {preset.ratio}
                </Chip>
              ))}
            </div>
            <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/40">Every size ({model.name})</p>
            <div className="grid grid-cols-4 gap-1.5 px-1 pb-1">
              {model.ratios.map((ratio) => {
                const active = settings.ratios.includes(ratio);
                return (
                  <button key={ratio} type="button" onClick={() => toggleRatio(ratio)} className={cx('flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-[11px]', active ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/8 text-white/65 hover:bg-white/6')}>
                    <span className="flex h-4 items-center"><RatioIcon ratio={ratio} active={active} /></span>
                    {ratio}
                  </button>
                );
              })}
            </div>
            <p className="px-2 pt-1 text-[11px] text-white/35">Pick several to get every prompt in each size.</p>
          </Popover>

          <Popover side="top" className="w-56" trigger={<Chip>×{settings.variations} <ChevronDown className="h-3 w-3" /></Chip>}>
            <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/40">Images per prompt and size</p>
            <div className="grid grid-cols-4 gap-1.5 p-1">
              {Array.from({ length: MAX_VARIATIONS }, (_, i) => i + 1).map((count) => (
                <button key={count} type="button" onClick={() => setSettings({ variations: count })} className={cx('rounded-xl border py-2 text-sm', settings.variations === count ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/8 text-white/70 hover:bg-white/6')}>
                  {count}
                </button>
              ))}
            </div>
          </Popover>

          {model.thinking && (
            <Popover side="top" className="w-64" trigger={<Chip>{settings.thinking === 'high' ? 'Thorough' : 'Fast'} <ChevronDown className="h-3 w-3" /></Chip>}>
              {([['minimal', 'Fast', 'Quickest, good for most prompts'], ['high', 'Thorough', 'Thinks more first: better for complex scenes, slower']] as const).map(([id, name, hint]) => (
                <button key={id} type="button" onClick={() => setSettings({ thinking: id })} className="flex w-full items-start justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/8">
                  <span><span className="block text-sm text-white">{name}</span><span className="block text-[11px] text-white/40">{hint}</span></span>
                  {settings.thinking === id && <Check className="mt-0.5 h-4 w-4 text-[#fff05a]" />}
                </button>
              ))}
            </Popover>
          )}

          <span className={cx('text-[11px]', tooManyRefs ? 'text-red-300' : 'text-white/40')}>
            {enabledRefs.length} reference{enabledRefs.length === 1 ? '' : 's'}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-[11px] leading-tight">
              <div className={cx(tooMany ? 'text-red-300' : 'text-white/70')}>{summary}</div>
              {prompts.length > 0 && (
                <div className={cx(short ? 'text-red-300' : 'text-white/40')}>
                  {cost.credits.toLocaleString('en-IN')} credits · about {runMinutes(model.id, size.id, cost.images)} min
                  {tooMany && ` · max ${MAX_IMAGES_PER_RUN} per run`}
                  {short && <> · you have {credits.toLocaleString('en-IN')} · <Link href="/pricing" className="underline">get credits</Link></>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              aria-label="Generate"
              title={prompts.length ? `Generate ${cost.images} images (Cmd/Ctrl + Enter)` : 'Paste prompts first'}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black shadow-[0_10px_30px_rgba(255,240,90,0.18)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 disabled:shadow-none"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              Generate{cost.images ? ` ${cost.images}` : ''}
            </button>
          </div>
        </div>
        <PromptWriter open={writerOpen} onOpenChange={setWriterOpen} existing={prompts} onPrompts={takeWritten} />
        {tooManyRefs && (
          <p className="flex items-center gap-1.5 px-4 pb-3 text-[11px] text-red-300">
            <X className="h-3 w-3" /> Switch some references off: Gemini takes at most {MAX_ENABLED_REFERENCES} per image.
          </p>
        )}
      </div>
    </div>
  );
}
