'use client';

import { useEffect, useRef } from 'react';
import { Box, Check, Footprints, Hand, MoveDown, Orbit, PackageOpen, Shirt, Smartphone, Sparkles, ZoomIn, type LucideIcon } from 'lucide-react';
import { MOTION_PRESETS, type MotionPreset } from '@/lib/video/presets';
import { cx } from '@/components/playground/ui';

const ICONS: Record<string, LucideIcon> = {
  general: Sparkles,
  'push-in': ZoomIn,
  orbit: Orbit,
  'hand-reveal': Hand,
  'model-walk': Footprints,
  'fabric-flow': Shirt,
  unboxing: PackageOpen,
  'ugc-selfie': Smartphone,
  floating: Box,
  'dolly-zoom': MoveDown,
};

/**
 * A preset's 5-second sample, silent and looping while it is on screen (paused off screen, so
 * a page of tiles doesn't play ten videos at once). General has none: an icon tile instead.
 */
function Sample({ preset, className, big = false }: { preset: MotionPreset; className?: string; big?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void node.play().catch(() => undefined);
      else node.pause();
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const Icon = ICONS[preset.id] ?? Sparkles;
  return (
    <div className={cx('relative overflow-hidden', className)} style={{ background: `radial-gradient(120% 90% at 85% 10%, ${preset.tint[0]}, ${preset.tint[1]} 70%)` }}>
      {preset.clip ? (
        <video ref={video} src={`${preset.clip}.mp4`} poster={`${preset.clip}.jpg`} muted loop playsInline preload="none" className="h-full w-full object-cover" aria-hidden />
      ) : (
        <Icon className={cx('absolute text-white/20', big ? 'right-4 top-4 h-14 w-14' : 'left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2')} strokeWidth={1.3} />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      <span className={cx('absolute bottom-3 left-3 right-3 font-black uppercase leading-[0.95] tracking-tight drop-shadow', big ? 'text-[22px] text-[#fff05a]' : 'text-[15px] text-white')}>{preset.name}</span>
    </div>
  );
}

/** The chosen preset at the top of the panel, like Higgsfield's: its sample with "Change". */
export function PresetCard({ preset, model, onChange }: { preset: MotionPreset; model: string; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className="group relative block w-full overflow-hidden rounded-2xl border border-white/[0.06] !p-0 text-left" aria-label={`Motion preset: ${preset.name}. Change`}>
      <Sample preset={preset} big className="h-28" />
      <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-md">{model}</span>
      <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md group-hover:bg-black/75">Change</span>
    </button>
  );
}

/** Every preset with its sample, what it is in plain words and what it suits; picking one goes back to the panel. */
export function PresetGallery({ value, onPick }: { value: string; onPick: (preset: MotionPreset) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {MOTION_PRESETS.map((preset) => {
        const selected = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset)}
            aria-pressed={selected}
            className={cx(
              'group flex flex-col overflow-hidden rounded-2xl border !p-0 text-left transition-colors',
              selected ? 'border-[#fff05a]/70 ring-1 ring-[#fff05a]/40' : 'border-white/[0.06] hover:border-white/20'
            )}
          >
            <div className="relative">
              <Sample preset={preset} className="aspect-[4/5] transition-transform duration-500 group-hover:scale-[1.02]" />
              {selected && (
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#fff05a] px-2 py-0.5 text-[10px] font-bold text-[#1f1c00]">
                  <Check className="h-3 w-3" /> Picked
                </span>
              )}
            </div>
            <span className="flex flex-1 flex-col gap-1.5 bg-[#111114] px-3 py-2.5">
              <span className="text-[12px] leading-snug text-white/75">{preset.explain}</span>
              <span className="text-[11px] leading-snug text-white/40"><span className="text-white/55">Best for:</span> {preset.bestFor}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
