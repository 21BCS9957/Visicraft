'use client';

import { useState } from 'react';
import { Popover } from 'radix-ui';
import { AudioLines, Check, ChevronRight, Clapperboard, Search, Sparkles } from 'lucide-react';
import { DEFAULT_VIDEO_MODEL } from '@/lib/video/shared';
import { cx } from '@/components/playground/ui';

/** The engines the Create tab renders with: Seedance 2.5 and Google Veo (the server picks the newest Veo). */
export const CREATE_MODELS = [
  {
    id: DEFAULT_VIDEO_MODEL,
    engine: 'seedance' as const,
    name: 'Seedance 2.5',
    badge: 'Default',
    best: '1080p',
    length: '4–30s',
    detail: 'From words alone, a start image or up to 9 reference images. No real faces.',
  },
  {
    id: 'veo-3.1-generate-001',
    engine: 'veo' as const,
    name: 'Google Veo',
    badge: 'Real people',
    best: '4K',
    length: '4–8s',
    detail: 'Animates one start image. Real people welcome. 9:16 or 16:9.',
  },
];

export type CreateModel = (typeof CREATE_MODELS)[number];
export type EngineState = Record<'seedance' | 'veo', { ready: boolean; reason?: string }>;

export function createModel(id: string | null | undefined): CreateModel {
  return CREATE_MODELS.find((model) => model.id === id) ?? CREATE_MODELS[0];
}

/** "Model · Seedance 2.5 ›", opening a searchable list like Higgsfield's: best quality, lengths and what each needs. */
export function ModelPicker({ value, engines, onChange, disabled }: {
  value: string;
  engines: EngineState | null;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = createModel(value);
  const shown = CREATE_MODELS.filter((model) => `${model.name} ${model.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#141417] !px-3.5 !py-3 text-left transition-colors hover:border-white/15 disabled:opacity-60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[#fff05a]">
            {current.engine === 'veo' ? <Sparkles className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-white/45">Model</span>
            <span className="block truncate text-sm font-medium text-white">{current.name}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="z-[95] w-[min(340px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141418]/95 p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        >
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 focus-within:border-white/25">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white !outline-none placeholder:text-white/35"
            />
          </label>
          <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Video models</p>
          <ul className="space-y-0.5" role="listbox" aria-label="Video models">
            {shown.map((model) => {
              const state = engines?.[model.engine];
              const off = state ? !state.ready : false;
              const selected = model.id === current.id;
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={off}
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    title={off ? state?.reason : undefined}
                    className={cx('flex w-full items-start gap-3 rounded-xl !px-2.5 !py-2.5 text-left transition-colors', selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]', off && 'cursor-not-allowed opacity-45')}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                      {model.engine === 'veo' ? <Sparkles className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white">{model.name}</span>
                        <span className="rounded-md bg-[#fff05a] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#1f1c00]">{model.badge}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60">{model.best}</span>
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60">{model.length}</span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60"><Clapperboard className="h-2.5 w-2.5" /> sound</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-white/45">{off ? state?.reason : model.detail}</span>
                    </span>
                    {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-[#fff05a]" />}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-2.5 py-3 text-xs text-white/40">No model matches.</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
