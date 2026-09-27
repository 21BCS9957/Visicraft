'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The visible pipeline: one glass row per stage, the active stage expanded with
 * its live artifact (product card, niche chips, research counters, winners,
 * ad briefs, generation counters, storyboard), finished stages collapsed.
 */

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface StageState {
  id: StageId;
  status: StageStatus;
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
  data?: Record<string, unknown>;
}

export type StageId = 'capture' | 'understand' | 'research' | 'analyze' | 'plan' | 'generate' | 'storyboard' | 'render' | 'done';

export const IMAGE_STAGES: StageId[] = ['capture', 'understand', 'research', 'analyze', 'plan', 'generate', 'done'];
export const VIDEO_STAGES: StageId[] = ['capture', 'understand', 'research', 'analyze', 'plan', 'generate', 'storyboard', 'render', 'done'];

export const STAGE_TITLES: Record<StageId, string> = {
  capture: 'Capture product',
  understand: 'Understand product & niche',
  research: 'Find winning ads',
  analyze: 'Study the winners',
  plan: 'Write the briefs',
  generate: 'Generate, product locked',
  storyboard: 'Storyboard',
  render: 'Render video',
  done: 'Ready',
};

export function initialStages(ids: StageId[]): Record<string, StageState> {
  return Object.fromEntries(ids.map((id) => [id, { id, status: 'pending' as StageStatus }]));
}

function elapsedLabel(stage: StageState): string | null {
  if (!stage.startedAt) return null;
  const ms = (stage.finishedAt ?? Date.now()) - stage.startedAt;
  if (ms < 1000) return null;
  return ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function Ring({ status }: { status: StageStatus }) {
  if (status === 'done') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fff05a] text-black shadow-[0_0_18px_rgba(255,240,90,0.35)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-red-300">
        <X className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'skipped') {
    return <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] text-white/35">–</span>;
  }
  if (status === 'active') {
    return (
      <span className="relative flex h-7 w-7 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0 62%, rgba(255,240,90,0.95) 100%)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
            animation: 'slotRing 1.4s linear infinite',
          }}
        />
        <span className="absolute inset-0 rounded-full border border-white/10" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#fff05a] shadow-[0_0_14px_rgba(255,240,90,0.7)]" />
      </span>
    );
  }
  return <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]"><span className="h-1.5 w-1.5 rounded-full bg-white/20" /></span>;
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'lavender' }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-medium',
        tone === 'accent' && 'border-[#fff05a]/25 bg-[#fff05a]/10 text-[#fbf2a0]',
        tone === 'lavender' && 'border-[#c8b8ff]/25 bg-[#c8b8ff]/10 text-[#d9ccff]',
        tone === 'neutral' && 'border-white/10 bg-white/[0.05] text-white/70'
      )}
    >
      {children}
    </span>
  );
}

function Counter({ label, value, active }: { label: string; value: number | string; active?: boolean }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2 text-left', active ? 'border-[#fff05a]/25 bg-[#fff05a]/[0.06]' : 'border-white/8 bg-black/25')}>
      <p className="text-lg font-light leading-none text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
    </div>
  );
}

interface CaptureData { title?: string; brand?: string; images?: string[]; canonicalImage?: string }
interface UnderstandData { canonicalImage?: string; title?: string; brand?: string; niche?: string; keywords?: string[]; competitors?: string[]; locked?: string[]; productPasted?: boolean }
interface ResearchData { scraped?: number; designed?: number; relevant?: number; winners?: number; ads?: Array<{ id: string; pageName: string; daysRunning: number; collationCount?: number; imageUrl?: string; libraryUrl: string; mediaKind?: string }> }
interface AnalyzeData { designs?: Array<{ pageName: string; format: string; hook: string; daysRunning: number; sequence?: Array<{ t: string; shot: string }> }> }
interface PlanData { angles?: Array<{ index: number; name: string; promise?: string; headline?: string; subline?: string; withText: boolean; modelledOn?: string; referenceImage?: string; brief?: string }> }
interface GenerateData { passed?: number; withheld?: number; retrying?: number }
interface StoryboardData { storyboard?: { hook: string; shots: Array<{ t: string; action: string; camera: string }>; modelledOn?: string } }

function StageBody({ stage }: { stage: StageState }) {
  const data = (stage.data ?? {}) as Record<string, unknown>;
  switch (stage.id) {
    case 'capture': {
      const d = data as CaptureData;
      const images = d.images ?? [];
      return (
        <div className="flex flex-wrap items-center gap-3">
          {images.slice(0, 6).map((url, i) => (
            <span key={`${url}-${i}`} className={cn('h-12 w-12 overflow-hidden rounded-lg border', url === d.canonicalImage ? 'border-[#fff05a] ring-2 ring-[#fff05a]/30' : 'border-white/10')}>
              <img src={url} alt="" className="h-full w-full object-cover" />
            </span>
          ))}
          <div className="min-w-0 text-left">
            <p className="truncate text-sm text-white/85">{d.title ?? 'Product'}</p>
            <p className="text-[11px] text-white/40">{d.brand ? `${d.brand} · ` : ''}{images.length} store photos</p>
          </div>
        </div>
      );
    }
    case 'understand': {
      const d = data as UnderstandData;
      return (
        <div className="space-y-2.5 text-left">
          <div className="flex flex-wrap gap-1.5">
            {d.niche && <Chip tone="accent">Niche · {d.niche}</Chip>}
            {(d.keywords ?? []).map((k) => <Chip key={k}>“{k}”</Chip>)}
            {(d.competitors ?? []).map((c) => <Chip key={c} tone="lavender">{c}</Chip>)}
          </div>
          {(d.locked ?? []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Locked on the product{d.productPasted ? ' · real pixels will be pasted in' : ''}</p>
              <ul className="mt-1 space-y-0.5">
                {(d.locked ?? []).map((l, i) => <li key={i} className="text-[11px] leading-relaxed text-white/60">• {l}</li>)}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case 'research': {
      const d = data as ResearchData;
      return (
        <div className="space-y-3 text-left">
          <div className="grid grid-cols-4 gap-2">
            <Counter label="scraped" value={d.scraped ?? 0} active={stage.status === 'active' && !d.relevant} />
            <Counter label="designed" value={d.designed ?? 0} />
            <Counter label="same category" value={d.relevant ?? 0} active={stage.status === 'active' && Boolean(d.scraped) && !d.winners} />
            <Counter label="winners" value={d.winners ?? 0} active={stage.status === 'done'} />
          </div>
          {(d.ads ?? []).length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {(d.ads ?? []).map((ad) => (
                <a key={ad.id} href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <div className="aspect-square bg-white/5">
                    {ad.imageUrl && <img src={ad.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[10px] text-white/80">{ad.pageName}</p>
                    <p className="text-[10px] text-[#fff05a]/80">{ad.daysRunning}d{ad.collationCount && ad.collationCount > 1 ? ` · ×${ad.collationCount}` : ''}{ad.mediaKind === 'video' ? ' · video' : ''}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'analyze': {
      const d = data as AnalyzeData;
      return (
        <ul className="space-y-1.5 text-left">
          {(d.designs ?? []).map((x, i) => (
            <li key={i} className="rounded-xl border border-white/8 bg-black/25 px-3 py-2">
              <p className="text-[11px] text-white/85">{x.pageName} <span className="text-white/35">· {x.daysRunning}d</span></p>
              <p className="text-[11px] text-white/55">{x.format}{x.hook ? ` — ${x.hook}` : ''}</p>
              {x.sequence && x.sequence.length > 0 && (
                <p className="mt-1 text-[10px] text-white/40">{x.sequence.slice(0, 4).map((b) => `[${b.t}] ${b.shot}`).join(' → ')}</p>
              )}
            </li>
          ))}
        </ul>
      );
    }
    case 'plan': {
      const d = data as PlanData;
      return (
        <div className="grid gap-2 text-left sm:grid-cols-2">
          {(d.angles ?? []).map((a) => (
            <div key={a.index} className="flex gap-3 rounded-xl border border-white/8 bg-black/25 p-2.5">
              {a.referenceImage && (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="h-20 w-14 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    <img src={a.referenceImage} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/35">winner</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-medium text-white/85">{a.name}</p>
                  <span className="shrink-0 text-[10px] text-white/40">{a.withText ? 'Ad copy' : 'Clean'}</span>
                </div>
                {a.headline && <p className="mt-1 text-sm leading-tight text-[#fbf2a0]">“{a.headline}”</p>}
                {a.subline && <p className="text-[11px] text-white/60">{a.subline}</p>}
                {a.brief ? (
                  <p className="mt-1 line-clamp-4 text-[11px] leading-relaxed text-white/55">{a.brief}</p>
                ) : a.promise && !a.headline ? (
                  <p className="mt-1 text-[11px] text-white/60">{a.promise}</p>
                ) : null}
                {a.modelledOn && <p className="mt-1 text-[10px] text-white/35">Modelled on {a.modelledOn}</p>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'generate': {
      const d = data as GenerateData;
      return (
        <div className="grid grid-cols-3 gap-2">
          <Counter label="passed" value={d.passed ?? 0} active={stage.status === 'done'} />
          <Counter label="reworking" value={d.retrying ?? 0} active={Boolean(d.retrying)} />
          <Counter label="withheld" value={d.withheld ?? 0} />
        </div>
      );
    }
    case 'storyboard': {
      const d = data as StoryboardData;
      const sb = d.storyboard;
      if (!sb) return null;
      return (
        <div className="text-left">
          <p className="text-[11px] text-white/80">{sb.hook}</p>
          <ol className="mt-2 space-y-1">
            {sb.shots.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-white/60">
                <span className="shrink-0 rounded-full bg-[#fff05a]/15 px-1.5 text-[10px] text-[#fbf2a0]">{s.t}</span>
                <span>{s.action}<span className="text-white/35"> · {s.camera}</span></span>
              </li>
            ))}
          </ol>
        </div>
      );
    }
    default:
      return null;
  }
}

export function PipelineTimeline({
  order,
  stages,
  collapsed = false,
  onToggleCollapsed,
}: {
  order: StageId[];
  stages: Record<string, StageState>;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const doneCount = order.filter((id) => stages[id]?.status === 'done').length;
  const activeId = order.find((id) => stages[id]?.status === 'active');
  const failed = order.some((id) => stages[id]?.status === 'failed');

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#151519]/88 text-left shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,240,90,0.08),transparent_40%),radial-gradient(circle_at_90%_100%,rgba(188,168,255,0.08),transparent_40%)]" />
      <div className="relative flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/40">Pipeline</p>
          <p className="mt-0.5 text-sm font-light text-white/80">
            {activeId ? STAGE_TITLES[activeId] : failed ? 'Stopped' : 'Complete'} · {doneCount}/{order.length}
          </p>
        </div>
        {onToggleCollapsed && (
          <button type="button" onClick={onToggleCollapsed} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            {collapsed ? 'Show steps' : 'Hide steps'}
          </button>
        )}
      </div>
      {!collapsed && (
        <ol className="relative px-5 pb-5">
          {order.map((id, index) => {
            const stage = stages[id] ?? { id, status: 'pending' as StageStatus };
            const isLast = index === order.length - 1;
            const expanded = stage.status === 'active' || open[id] === true || (stage.status === 'done' && id === 'capture' && !activeId && false);
            const hasBody = stage.data && Object.keys(stage.data).length > 0 && id !== 'done';
            const elapsed = elapsedLabel(stage);
            return (
              <li key={id} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <Ring status={stage.status} />
                  {!isLast && <span className={cn('mt-1 w-px flex-1', stage.status === 'done' ? 'bg-[#fff05a]/40' : 'bg-white/10')} style={{ minHeight: 18 }} />}
                </div>
                <div className={cn('min-w-0 flex-1 pb-4', isLast && 'pb-0')}>
                  <button
                    type="button"
                    onClick={() => hasBody && setOpen((o) => ({ ...o, [id]: !expanded }))}
                    className={cn('flex w-full items-start justify-between gap-3 text-left', hasBody ? 'cursor-pointer' : 'cursor-default')}
                  >
                    <div className="min-w-0">
                      <p className={cn('text-sm', stage.status === 'pending' || stage.status === 'skipped' ? 'text-white/35' : 'text-white')}>
                        {STAGE_TITLES[id]}
                      </p>
                      {stage.detail && (
                        <p className={cn('mt-0.5 truncate text-[11px]', stage.status === 'failed' ? 'text-red-300/80' : 'text-white/45')}>{stage.detail}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {elapsed && <span className="text-[10px] tabular-nums text-white/35">{elapsed}</span>}
                      {hasBody && stage.status !== 'active' && (
                        <ChevronDown className={cn('h-3.5 w-3.5 text-white/35 transition-transform', expanded && 'rotate-180')} />
                      )}
                    </div>
                  </button>
                  {hasBody && expanded && (
                    <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <StageBody stage={stage} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
