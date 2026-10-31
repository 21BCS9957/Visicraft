'use client';

import { Box, Footprints, Hand, MoveDown, Orbit, PackageOpen, Shirt, Smartphone, Sparkles, ZoomIn, type LucideIcon } from 'lucide-react';
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

function Tile({ preset, className, big = false }: { preset: MotionPreset; className?: string; big?: boolean }) {
  const Icon = ICONS[preset.id] ?? Sparkles;
  return (
    <div className={cx('relative overflow-hidden', className)} style={{ background: `radial-gradient(120% 90% at 85% 10%, ${preset.tint[0]}, ${preset.tint[1]} 70%)` }}>
      <Icon className={cx('absolute text-white/15', big ? 'right-4 top-4 h-16 w-16' : 'right-3 top-3 h-10 w-10')} strokeWidth={1.4} />
      <span className={cx('absolute bottom-3 left-3 right-3 font-black uppercase leading-[0.95] tracking-tight', big ? 'text-[22px] text-[#fff05a]' : 'text-[15px] text-white')}>{preset.name}</span>
    </div>
  );
}

/** The chosen preset at the top of the panel, like Higgsfield's: a tile with "Change". */
export function PresetCard({ preset, model, onChange }: { preset: MotionPreset; model: string; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className="group relative block w-full overflow-hidden rounded-2xl border border-white/[0.06] !p-0 text-left" aria-label={`Motion preset: ${preset.name}. Change`}>
      <Tile preset={preset} big className="h-28 transition-transform duration-500 group-hover:scale-[1.02]" />
      <span className="absolute left-3 top-3 text-[11px] text-white/60">{model}</span>
      <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md group-hover:bg-black/75">Change</span>
    </button>
  );
}

/** Every preset as a tile; picking one goes back to the panel. */
export function PresetGallery({ value, onPick }: { value: string; onPick: (preset: MotionPreset) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {MOTION_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset)}
          aria-pressed={preset.id === value}
          className={cx(
            'group overflow-hidden rounded-2xl border !p-0 text-left transition-colors',
            preset.id === value ? 'border-[#fff05a]/70' : 'border-white/[0.06] hover:border-white/20'
          )}
        >
          <Tile preset={preset} className="aspect-[4/5] transition-transform duration-500 group-hover:scale-[1.03]" />
          <span className="block bg-[#111114] px-3 py-2.5 text-[11px] leading-snug text-white/55">{preset.blurb}</span>
        </button>
      ))}
    </div>
  );
}
