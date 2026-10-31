'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/playground/models';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem, PlaygroundReference, PlaygroundRun, ReferenceSnapshot } from '@/lib/playground/types';
import { Markdown } from './Markdown';
import { cx } from './ui';

/**
 * What a run was made with, for the owner's view-only dashboard: every prompt with the images
 * it made, the references that were on (the run's own snapshot) and the project's references
 * that were off at the time, and whether the guidelines went with the images.
 */

function RefThumb({ reference, off = false }: { reference: Pick<ReferenceSnapshot, 'url' | 'role' | 'label'>; off?: boolean }) {
  const [broken, setBroken] = useState(false);
  const name = reference.label.trim() || ROLE_LABELS[reference.role];
  return (
    <figure className={cx('w-16 shrink-0 space-y-1', off && 'opacity-40')} title={`${ROLE_LABELS[reference.role]}${reference.label.trim() ? `: ${reference.label.trim()}` : ''}${off ? ' (off)' : ''}`}>
      {broken ? (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-white/10 text-[9px] text-white/35">Gone</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reference.url} alt={name} loading="lazy" onError={() => setBroken(true)} className="aspect-square w-full rounded-lg border border-white/10 object-cover" />
      )}
      <figcaption className="truncate text-[10px] text-white/50">{ROLE_LABELS[reference.role]}</figcaption>
      <figcaption className="truncate text-[10px] text-white/35">{reference.label.trim() || '—'}</figcaption>
    </figure>
  );
}

/** References of the project that existed when the run was made but weren't sent with it. */
function offAtTheTime(run: PlaygroundRun, references: PlaygroundReference[]): PlaygroundReference[] {
  const used = new Set(run.references.map((reference) => reference.id));
  const made = Date.parse(run.createdAt);
  return references.filter((reference) => !used.has(reference.id) && Date.parse(reference.createdAt) <= made);
}

export function RunDetails({ run, items, defaultOpen = false }: { run: PlaygroundRun; items: PlaygroundItem[]; defaultOpen?: boolean }) {
  const references = usePlaygroundStore((state) => state.references);
  const brief = usePlaygroundStore((state) => state.project?.brief ?? '');
  // Extend and Fit copies work from the original image alone: no references, nothing "off".
  const fromOriginal = run.resize?.method === 'extend' || run.resize?.method === 'fit';
  const off = fromOriginal ? [] : offAtTheTime(run, references);
  const sentBrief = run.brief.trim();
  const numbers = (index: number) => items
    .filter((item) => (item.promptIndex ?? 0) === index)
    .sort((a, b) => a.position - b.position)
    .map((item) => `#${item.position + 1}`);
  const guidelines = sentBrief ? 'guidelines sent with every image' : brief.trim() ? 'guidelines not sent with the images' : 'no guidelines';

  return (
    <details open={defaultOpen || undefined} className="group rounded-2xl border border-white/8 bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-xs text-white/70 hover:text-white">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        <span className="font-medium text-white/85">Prompts & references</span>
        <span className="text-white/35">
          {run.prompts.length} prompt{run.prompts.length === 1 ? '' : 's'} · {fromOriginal
            ? 'made from the original image'
            : <>{run.references.length} reference{run.references.length === 1 ? '' : 's'} on{off.length > 0 && ` · ${off.length} off`}</>} · {guidelines}
        </span>
      </summary>
      <div className="space-y-5 border-t border-white/6 px-4 pb-4 pt-3">
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase tracking-wide text-white/40">Prompts</h4>
          <ol className="space-y-2">
            {run.prompts.map((prompt, index) => {
              const made = numbers(index);
              return (
                <li key={index} className="rounded-xl border border-white/6 bg-black/20 p-3">
                  <p className="mb-1.5 text-[11px] text-white/40">
                    Prompt {index + 1}{made.length > 0 && <> · made {made.join(', ')}</>}
                  </p>
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-white/80">{prompt}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="space-y-2">
          <h4 className="text-[11px] uppercase tracking-wide text-white/40">References on <span className="normal-case text-white/30">· sent with every image</span></h4>
          {fromOriginal ? (
            <p className="text-xs text-white/45">
              None: {run.resize?.method === 'extend' ? 'Extend paints around the original image' : 'Fit places the original image on a background'}, so no references or prompt went to the model. The prompts above are the originals’.
            </p>
          ) : run.references.length ? (
            <div className="flex flex-wrap gap-2">{run.references.map((reference) => <RefThumb key={reference.id} reference={reference} />)}</div>
          ) : (
            <p className="text-xs text-white/35">None: the images were made from the prompts alone.</p>
          )}
        </section>

        {off.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-[11px] uppercase tracking-wide text-white/40">Off at the time <span className="normal-case text-white/30">· in the project, not sent</span></h4>
            <div className="flex flex-wrap gap-2">{off.map((reference) => <RefThumb key={reference.id} reference={reference} off />)}</div>
          </section>
        )}

        <section className="space-y-2">
          <h4 className="text-[11px] uppercase tracking-wide text-white/40">Guidelines</h4>
          {sentBrief ? (
            <details className="rounded-xl border border-white/6 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs text-white/70 hover:text-white">Sent with every image · {sentBrief.length.toLocaleString('en-IN')} characters (read)</summary>
              <div className="mt-2 max-h-72 overflow-y-auto"><Markdown className="text-xs">{sentBrief}</Markdown></div>
            </details>
          ) : (
            <p className="text-xs text-white/45">
              {brief.trim()
                ? 'Not sent with these images: the project has guidelines, but Claude only reads them when it writes prompts.'
                : 'This project has no guidelines.'}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
