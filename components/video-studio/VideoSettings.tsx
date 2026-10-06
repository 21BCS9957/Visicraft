'use client';

import { Check, ChevronDown } from 'lucide-react';
import { parseVideoStyle } from '@/lib/videoStyles';
import {
  DEFAULT_VIDEO_QUALITY,
  normalizeVideoQuality,
  snapVideoAspect,
  snapVideoDuration,
  VIDEO_ASPECTS,
  videoCredits,
  videoEngineOf,
  videoModelOptions,
  videoQualityLabel,
  type VideoAspect,
  type VideoQuality,
} from '@/lib/videoModels';
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from '@/lib/video/shared';
import { MAX_REFERENCE_VIDEOS } from '@/lib/playground/libraryVideo';
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
    aspectRatio: snapVideoAspect(model, saved?.aspectRatio),
    style: parseVideoStyle(saved?.style) ?? 'any',
    referenceVideoIds: Array.isArray(saved?.referenceVideoIds) ? saved.referenceVideoIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_REFERENCE_VIDEOS) : [],
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

/** A small outline of a shape, as the shape chips show it. */
export function ShapeIcon({ ratio, className }: { ratio: VideoAspect; className?: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const scale = 14 / Math.max(w, h);
  return <span aria-hidden className={cx('inline-block shrink-0 rounded-[2px] border border-current', className)} style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} />;
}

/**
 * The video's shape, limited to what the engine renders (Veo: 9:16 and 16:9). The frames and
 * the prompt are made for it, so it is picked before planning.
 */
export function ShapePicker({ model, value, onChange, disabled }: {
  model: string;
  value: VideoAspect;
  onChange: (ratio: VideoAspect) => void;
  disabled?: boolean;
}) {
  const allowed = videoModelOptions(model).aspectRatios;
  const shapes = VIDEO_ASPECTS.filter((shape) => allowed.includes(shape.id));
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Shape</p>
      <div role="radiogroup" aria-label="Video shape" className="grid grid-cols-2 gap-1.5">
        {shapes.map((shape) => {
          const selected = shape.id === value;
          return (
            <button
              key={shape.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(shape.id)}
              className={cx(
                'flex items-center gap-2 rounded-xl border !px-2.5 !py-1.5 text-left !text-xs transition-colors disabled:opacity-50',
                selected ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/25 hover:text-white'
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center"><ShapeIcon ratio={shape.id} /></span>
              <span className="min-w-0">
                <span className="block">{shape.id} · {shape.label}</span>
                <span className="block truncate text-[10px] text-white/45">{shape.use}</span>
              </span>
            </button>
          );
        })}
      </div>
      {allowed.length < VIDEO_ASPECTS.length && (
        <p className="mt-1.5 text-[11px] leading-snug text-white/40">Square and 3:4 need Seedance.</p>
      )}
    </div>
  );
}

/**
 * Length and quality, limited to what the engine renders, each quality with its price. A draft
 * is a cheap test render that can be upgraded to full quality later.
 */
export function LengthQualityPicker({ model, duration, quality, aspectRatio, onDuration, onQuality, disabled }: {
  model: string;
  duration: number;
  quality: VideoQuality;
  aspectRatio?: VideoAspect;
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
      ? `A quick ${options.draft.resolution} test. Like it? Upgrade the same take to 1080p.`
      : `A quick ${options.draft.resolution} test. Like it? Upgrade it and pay only for the final render.`
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
              <span className="block text-[10px] text-white/45">{videoCredits(model, option, duration, aspectRatio)} credits</span>
            </button>
          ))}
        </div>
        {hint && <p className="mt-2 text-[11px] leading-relaxed text-white/45">{hint}</p>}
      </div>
    </div>
  );
}
