'use client';

import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Loader2, Sparkles, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { playgroundApi } from '@/lib/playground/api';
import { MAX_ENABLED_REFERENCES, MAX_WRITTEN_PROMPTS, playgroundModel, promptWriterCredits, ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { usePlaygroundStore } from '@/lib/playground/store';
import { dictationErrorMessage, useSpeechDictation } from '@/lib/useSpeechDictation';
import { DictationButton } from '@/components/shared/DictationButton';
import { cx } from './ui';

const TOAST = { position: 'top-center' as const };
const COUNTS = [10, 20, 40, 50];
const MAX_GOAL_CHARS = 2000;

/** Dev preview: plausible prompts without calling Claude. */
function previewPrompts(goal: string, count: number): string[] {
  const scenes = ['on a sunlit marble counter', 'in a cosy living room at dusk', 'as a clean studio hero shot', 'in a flat lay with fresh props', 'held in hand outdoors', 'on a festive table with diyas'];
  return Array.from({ length: count }, (_, i) => `The product from the reference images ${scenes[i % scenes.length]}${goal ? `, for: ${goal.slice(0, 80)}` : ''}. Soft natural light, shallow depth of field, premium editorial look. (preview ${i + 1})`);
}

export function PromptWriter({ open, onOpenChange, existing, onPrompts }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prompts already in the composer: the choice becomes "add" or "replace". */
  existing: string[];
  onPrompts: (prompts: string[], mode: 'replace' | 'add') => void;
}) {
  const project = usePlaygroundStore((state) => state.project);
  const references = usePlaygroundStore((state) => state.references);
  const settings = usePlaygroundStore((state) => state.settings);
  const preview = usePlaygroundStore((state) => state.preview);
  const { credits, loading: creditsLoading, refreshCredits } = useCredits();
  const [goal, setGoal] = useState('');
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const dictation = useSpeechDictation(
    (value) => setGoal((prev) => (typeof value === 'function' ? value(prev) : value).slice(0, MAX_GOAL_CHARS)),
    {
      onError: (code) => {
        const message = dictationErrorMessage(code);
        if (message) toast.error(message, TOAST);
      },
    },
  );
  const { cancel: cancelDictation } = dictation;

  // The dialog stays mounted when closed: closing it turns the mic off.
  useEffect(() => {
    if (!open) cancelDictation();
  }, [open, cancelDictation]);

  const enabled = references.filter((reference) => reference.enabled).slice(0, MAX_ENABLED_REFERENCES);
  const counts = enabled.reduce<Record<ReferenceRole, number>>((acc, reference) => ({ ...acc, [reference.role]: acc[reference.role] + 1 }), { product: 0, person: 0, style: 0 });
  const cost = promptWriterCredits(count);
  const short = !preview && !creditsLoading && credits < cost;
  const model = playgroundModel(settings.model);
  const canWrite = Boolean(project) && !busy && !short && (goal.trim() || project?.brief.trim() || enabled.length);

  const write = async (mode: 'replace' | 'add') => {
    if (!project || !canWrite) return;
    cancelDictation();
    setBusy(true);
    try {
      const prompts = preview
        ? await new Promise<string[]>((resolve) => setTimeout(() => resolve(previewPrompts(goal, count)), 1500))
        : (await playgroundApi.writePrompts(project.id, {
          goal,
          count,
          brief: project.brief,
          referenceIds: enabled.map((reference) => reference.id),
          model: settings.model,
          ratios: settings.ratios,
          existing: mode === 'add' ? existing : undefined,
        })).prompts;
      onPrompts(prompts, mode);
      onOpenChange(false);
      toast.success(`${prompts.length} prompt${prompts.length === 1 ? '' : 's'} ready to review`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Claude could not write the prompts', { ...TOAST, duration: 6000 });
    } finally {
      setBusy(false);
      if (!preview) void refreshCredits();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/12 bg-[#141418] p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-lg font-medium">
                <Sparkles className="h-5 w-5 text-[#fff05a]" /> Write prompts with Claude
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-white/55">
                Claude reads your guidelines and looks at your references, then writes one prompt per image for you to review before anything is generated.
              </Dialog.Description>
            </div>
            <Dialog.Close disabled={busy} aria-label="Close" className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white disabled:opacity-40">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
              <span className="text-white/75">Claude will see:</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5">
                {enabled.length ? `${enabled.length} reference${enabled.length === 1 ? '' : 's'}${(['product', 'person', 'style'] as ReferenceRole[]).filter((role) => counts[role]).map((role) => ` · ${counts[role]} ${ROLE_LABELS[role].toLowerCase()}`).join('')}` : 'no references yet'}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5">{project?.brief.trim() ? `your guidelines${project.briefName ? ` (${project.briefName})` : ''}` : 'no guidelines'}</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5">{model.name} · {settings.ratios.join(', ')}</span>
            </div>
            {enabled.length > 0 && (
              <div className="mt-3 flex gap-1.5 overflow-x-auto">
                {enabled.map((reference) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={reference.id} src={reference.url} alt={reference.label || ROLE_LABELS[reference.role]} className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            <label htmlFor="prompt-writer-goal" className="text-sm text-white/85">What do you want?</label>
            <div className="relative mt-2">
              <textarea
                id="prompt-writer-goal"
                autoFocus
                value={goal}
                onChange={(event) => { if (dictation.isListening) cancelDictation(); setGoal(event.target.value); }}
                maxLength={MAX_GOAL_CHARS}
                rows={4}
                disabled={busy}
                placeholder={'e.g. Diwali Meta ads for the saree: half studio shots, half lifestyle with Indian models; warm festive light; three with the text "Festive offer: 20% off". Or tap the mic and say it.'}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 py-3 pl-3.5 pr-12 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/25 disabled:opacity-60"
              />
              <DictationButton dictation={dictation} text={goal} disabled={busy} size="sm" toastOptions={TOAST} className="absolute bottom-2.5 right-2.5 pointer-coarse:right-1" />
            </div>
          </div>

          <div className="mt-4">
            <span className="text-sm text-white/85">How many prompts?</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {COUNTS.map((option) => (
                <button key={option} type="button" disabled={busy} onClick={() => setCount(option)} className={cx('rounded-full border px-3.5 py-1.5 text-sm disabled:opacity-50', count === option ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 text-white/70 hover:bg-white/6')}>
                  {option}
                </button>
              ))}
              <label className="flex items-center gap-2 text-xs text-white/50">
                or
                <input
                  type="number"
                  min={1}
                  max={MAX_WRITTEN_PROMPTS}
                  value={count}
                  disabled={busy}
                  onChange={(event) => setCount(Math.min(MAX_WRITTEN_PROMPTS, Math.max(1, Math.round(Number(event.target.value) || 1))))}
                  className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white outline-none focus:border-white/25"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              Each prompt becomes {settings.ratios.length * settings.variations} image{settings.ratios.length * settings.variations === 1 ? '' : 's'} with your current sizes. Up to {MAX_WRITTEN_PROMPTS} at a time.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
            <span className={cx('text-xs', short ? 'text-red-300' : 'text-white/50')}>
              {cost} credits{short ? ` · you have ${credits}` : ' · refunded if Claude can’t finish'}
            </span>
            <div className="flex gap-2">
              {existing.length > 0 && (
                <button type="button" onClick={() => void write('add')} disabled={!canWrite} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white hover:bg-white/8 disabled:opacity-40">
                  Add to the list
                </button>
              )}
              <button type="button" onClick={() => void write('replace')} disabled={!canWrite} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? 'Claude is writing…' : existing.length ? `Replace with ${count}` : `Write ${count} prompts`}
              </button>
            </div>
          </div>
          {busy && (
            <p className="mt-3 text-[11px] text-white/45">
              Claude is looking at {enabled.length || 'your'} reference{enabled.length === 1 ? '' : 's'} and writing {count} prompts. This usually takes 20–60 seconds.
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
