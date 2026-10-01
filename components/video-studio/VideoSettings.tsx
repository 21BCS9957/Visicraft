'use client';

import { Check, ChevronDown } from 'lucide-react';
import { parseVideoStyle } from '@/lib/videoStyles';
import {
  DEFAULT_VIDEO_QUALITY,
  normalizeVideoQuality,
  snapVideoDuration,
  videoCredits,
  videoEngineOf,
  videoModelOptions,
  videoQualityLabel,
  type VideoQuality,
} from '@/lib/videoModels';
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS, videoModelName } from '@/lib/video/shared';
import type { VideoProjectSettings } from '@/lib/playground/types';
import { cx, Popover, PopoverClose } from '@/components/playground/ui';
import type { VideoChoices } from './NewVideoPanel';

/** A model id from a saved video, as the picker lists it (a resolved Veo id becomes "Google Veo"). */
export function pickerModel(model: string): string {
  if (VIDEO_MODELS.some((option) => option.id === model)) return model;
  return videoEngineOf(model) === 'seedance' ? model : VIDEO_MODELS.find((option) => videoEngineOf(option.id) === 'veo')?.id ?? DEFAULT_VIDEO_MODEL;
}

/** A project's saved New video choices, snapped to what the engine renders (Seedance 2.5 by default). */
export function choicesFrom(saved?: Partial<VideoProjectSettings> | null): VideoChoices {
  const model = saved?.model && VIDEO_MODELS.some((option) => option.id === saved.model) ? saved.model : DEFAULT_VIDEO_MODEL;
  return {
    model,
    duration: snapVideoDuration(model, Number(saved?.duration) || 8),
    quality: normalizeVideoQuality(model, saved?.quality ?? DEFAULT_VIDEO_QUALITY),
    style: parseVideoStyle(saved?.style) ?? 'any',
    research: typeof saved?.research === 'boolean' ? saved.research : null,
    notes: typeof saved?.notes === 'string' ? saved.notes : '',
  };
}

/** Engine menu: every model with what it can and can't do. */
export function EnginePicker({ model, onModel, disabled }: { model: string; onModel: (model: string) => void; disabled?: boolean }) {
  const current = VIDEO_MODELS.find((option) => option.id === model) ?? VIDEO_MODELS[0];
  return (
    <Popover
      side="bottom"
      align="start"
      className="w-[min(340px,calc(100vw-32px))]"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-3.5 py-2.5 text-left transition-colors hover:border-white/20 disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block text-sm text-white">{current.name}</span>
            <span className="block truncate text-[11px] text-white/45">{current.blurb}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-white/45" />
        </button>
      }
    >
      <div className="space-y-0.5">
        {VIDEO_MODELS.map((option) => (
          <PopoverClose asChild key={option.id}>
            <button
              type="button"
              onClick={() => onModel(option.id)}
              className={cx('flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors', option.id === model ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {option.id === model && <Check className="h-3.5 w-3.5 text-[#fff05a]" />}
              </span>
              <span className="min-w-0">
                <span className={cx('block text-sm', option.id === model ? 'text-[#fff05a]' : 'text-white')}>{option.name}</span>
                <span className="block text-[11px] leading-relaxed text-white/45">{option.blurb}</span>
              </span>
            </button>
          </PopoverClose>
        ))}
      </div>
    </Popover>
  );
}

/**
 * Length and quality, limited to what the engine renders, each quality with its price. A draft
 * is a cheap test render that can be upgraded to full quality later.
 */
export function LengthQualityPicker({ model, duration, quality, onDuration, onQuality, disabled }: {
  model: string;
  duration: number;
  quality: VideoQuality;
  onDuration: (seconds: number) => void;
  onQuality: (quality: VideoQuality) => void;
  disabled?: boolean;
}) {
  const options = videoModelOptions(model);
  const qualities: VideoQuality[] = ['draft', ...options.qualities];
  const chip = (selected: boolean) => cx(
    'rounded-xl border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50',
    selected ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/25 hover:text-white'
  );
  const hint = quality === 'draft'
    ? options.draft.native
      ? `A quick ${options.draft.resolution} test. If you like it, upgrade it: ${videoModelName(model)} keeps this exact take in 1080p.`
      : `A quick ${options.draft.resolution} test${options.engine === 'veo' ? ' on Veo Fast' : ''}. If you like it, upgrade it: the frame and prompt are reused, so you only pay for the final render.`
    : options.engine === 'veo' && duration !== 8
      ? 'Veo holds a garment perfectly still only at 8 s.'
      : quality === '4k'
        ? '4K takes longer to render.'
        : null;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Length</p>
        <div className="flex flex-wrap gap-1.5">
          {options.durations.map((seconds) => (
            <button key={seconds} type="button" disabled={disabled} onClick={() => onDuration(seconds)} className={chip(seconds === duration)}>
              {seconds}s
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Quality</p>
        <div className="grid grid-cols-2 gap-1.5">
          {qualities.map((option) => (
            <button key={option} type="button" disabled={disabled} onClick={() => onQuality(option)} className={cx(chip(option === quality), 'text-left')}>
              <span className="block">{option === 'draft' ? `Draft · ${options.draft.resolution}` : videoQualityLabel(option)}</span>
              <span className="block text-[10px] text-white/45">{videoCredits(model, option, duration)} credits</span>
            </button>
          ))}
        </div>
        {hint && <p className="mt-2 text-[11px] leading-relaxed text-white/45">{hint}</p>}
      </div>
    </div>
  );
}
