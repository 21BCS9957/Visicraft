'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DashboardUsage, ModelSpend, UsageCounts, UsageRange } from '@/lib/dashboard/types';
import { cx } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { displayName, formatCount, MemberAvatar, PANEL } from './parts';

/**
 * Gemini images, GPT Image images and videos keep these colours wherever they appear; the three
 * pass the colour-blind and lightness checks against each other on the dark cards. Helpers
 * (prompt writing, checks) and the cheapest rows stay grey.
 */
const GROUP_COLORS = { gemini: '#3987e5', gpt: '#c98500', video: '#199e70', other: '#52525b' } as const;
/** The cheapest rows of a long list are greyed out so the big spends stand out. */
const GREY_TAIL = 3;

const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const plural = (count: number, word: string) => `${formatCount(count)} ${word}${count === 1 ? '' : 's'}`;

const PERIODS: ReadonlyArray<{ id: UsageRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

/** Rows a card shows until it is expanded. */
const COMPACT_ROWS = 3;

/** A compact card: its title and period picker, then the numbers. */
function UsageCard({ title, period, onPeriod, children, className }: {
  title: string;
  period: UsageRange;
  onPeriod: (period: UsageRange) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(PANEL, 'flex min-w-0 flex-col p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-50">{title}</h2>
        <select
          value={period}
          onChange={(event) => onPeriod(event.target.value as UsageRange)}
          aria-label={`${title}: period`}
          className="h-8 shrink-0 rounded-full border border-white/[0.08] bg-[#0b0b0d] px-3 text-xs text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-[#fff05a]/60"
        >
          {PERIODS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </div>
      {children}
    </section>
  );
}

function ShowAll({ open, total, noun, onToggle }: { open: boolean; total: number; noun: string; onToggle: () => void }) {
  if (total <= COMPACT_ROWS) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mt-2 inline-flex items-center gap-1 self-start rounded-full px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
    >
      {open ? <>Show less <ChevronUp className="h-3.5 w-3.5" /></> : <>Show all {total} {noun} <ChevronDown className="h-3.5 w-3.5" /></>}
    </button>
  );
}

/** Gemini and GPT Image images as one bar, a 2px gap between the parts. */
function SplitBar({ gemini, gpt, className }: { gemini: number; gpt: number; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${gemini} from Gemini, ${gpt} from GPT Image`}
      className={cx('flex h-1.5 gap-[2px] overflow-hidden rounded-full', !(gemini + gpt) && 'bg-white/[0.06]', className)}
    >
      {gemini > 0 && <span title={`Gemini (Nano Banana): ${gemini}`} className="h-full" style={{ flexGrow: gemini, flexBasis: 0, background: GROUP_COLORS.gemini }} />}
      {gpt > 0 && <span title={`GPT Image (OpenAI): ${gpt}`} className="h-full" style={{ flexGrow: gpt, flexBasis: 0, background: GROUP_COLORS.gpt }} />}
    </div>
  );
}

function SplitLegend({ gemini, gpt }: { gemini: number; gpt: number }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS.gemini }} />
        Gemini <span className="tabular-nums text-zinc-200">{formatCount(gemini)}</span>
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS.gpt }} />
        GPT <span className="tabular-nums text-zinc-200">{formatCount(gpt)}</span>
      </li>
    </ul>
  );
}

function PersonRow({ userId, counts }: { userId: string; counts: UsageCounts }) {
  const { memberById } = useDashboard();
  const known = memberById.get(userId);
  const made = [`${formatCount(counts.gemini)} Gemini`, `${formatCount(counts.gpt)} GPT`, counts.videos ? plural(counts.videos, 'video') : null].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-2.5 py-2">
      <MemberAvatar name={known?.name ?? null} email={known?.email ?? '?'} url={known?.avatarUrl ?? null} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-zinc-100">{displayName(known)}</p>
        <p className="truncate text-[11px] text-zinc-500">{made}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] tabular-nums text-zinc-100">{plural(counts.images, 'image')}</p>
        <p className="text-[11px] tabular-nums text-zinc-500">≈ {rupees(counts.costInr)}</p>
      </div>
    </li>
  );
}

/** What was made in a period: images by Gemini and GPT Image, videos, credits and cost, and who made them. */
export function GeneratedCard({ usage, className }: { usage: DashboardUsage; className?: string }) {
  const [range, setRange] = useState<UsageRange>('today');
  const [open, setOpen] = useState(false);
  const period = usage.periods[range];
  const people = open ? period.members : period.members.slice(0, COMPACT_ROWS);
  return (
    <UsageCard title="Generated" period={range} onPeriod={setRange} className={className}>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">
          {formatCount(period.images)}
          <span className="ml-1.5 text-sm font-normal tracking-normal text-zinc-500">
            {period.images === 1 ? 'image' : 'images'}{period.videos ? ` · ${plural(period.videos, 'video')}` : ''}
          </span>
        </p>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold leading-none tabular-nums text-zinc-50">≈ {rupees(period.costInr)}</p>
          <p className="mt-1 text-[11px] tabular-nums text-zinc-500">{formatCount(period.credits)} credits</p>
        </div>
      </div>
      <SplitBar gemini={period.gemini} gpt={period.gpt} className="mt-3" />
      <SplitLegend gemini={period.gemini} gpt={period.gpt} />
      {people.length > 0 ? (
        <ul className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.06]" aria-label="Made per account">
          {people.map(({ userId, ...counts }) => <PersonRow key={userId} userId={userId} counts={counts} />)}
        </ul>
      ) : !period.images && !period.videos ? (
        <p className="mt-3 text-xs text-zinc-500">{range === 'today' ? 'Nothing made yet today.' : 'Nothing made in this period.'}</p>
      ) : null}
      <ShowAll open={open} total={period.members.length} noun="people" onToggle={() => setOpen((value) => !value)} />
    </UsageCard>
  );
}

/** "253 images", "4 videos · 8 renders" (every take is charged), or nothing for helpers. */
function madeBy(model: ModelSpend): string | null {
  if (model.images) return plural(model.images, 'image');
  if (!model.renders) return null;
  return model.renders > model.videos ? `${plural(model.videos, 'video')} · ${plural(model.renders, 'render')}` : plural(model.videos, 'video');
}

function ModelRow({ model, most, muted }: { model: ModelSpend; most: number; muted: boolean }) {
  const made = madeBy(model);
  return (
    <li title={`${model.name} (${model.maker})${made ? ` · ${made}` : ''}`}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-zinc-200">
          {model.name}{made && <span className="text-zinc-500"> · {made}</span>}
        </span>
        <span className="shrink-0 tabular-nums text-zinc-100">
          {formatCount(model.credits)}<span className="text-zinc-500"> cr</span>
          <span className="ml-2 text-zinc-400">≈ {rupees(model.costInr)}</span>
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (model.costInr / most) * 100)}%`, background: GROUP_COLORS[muted ? 'other' : model.group] }} />
      </div>
    </li>
  );
}

/** Credits per model for a period, then everything spent so far, in rupees. */
export function SpendCard({ usage, className }: { usage: DashboardUsage; className?: string }) {
  const [range, setRange] = useState<UsageRange>('all');
  const [open, setOpen] = useState(false);
  const period = usage.periods[range];
  const models = usage.byModel[range];
  const shown = open ? models : models.slice(0, COMPACT_ROWS);
  // Rows come most spent first; bars are what each cost, and the last three of a long list are grey.
  const most = Math.max(1, ...models.map((model) => model.costInr));
  const greyFrom = models.length > GREY_TAIL ? models.length - GREY_TAIL : Infinity;
  return (
    <UsageCard title="Credits & cost" period={range} onPeriod={setRange} className={className}>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">
          {formatCount(period.credits)}<span className="ml-1.5 text-sm font-normal tracking-normal text-zinc-500">credits</span>
        </p>
        <p className="shrink-0 text-lg font-semibold leading-none tabular-nums text-zinc-50">≈ {rupees(period.costInr)}</p>
      </div>
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-zinc-500" aria-label="Bar colours">
          <li className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS.gemini }} /> Gemini images</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS.gpt }} /> GPT images</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS.video }} /> Videos</li>
        </ul>
      )}
      {shown.length > 0 ? (
        <ul className="mt-3 space-y-2.5" aria-label="Credits and cost per model, most spent first">
          {shown.map((model, index) => <ModelRow key={model.key} model={model} most={most} muted={index >= greyFrom} />)}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Nothing spent in this period.</p>
      )}
      <ShowAll open={open} total={models.length} noun="models" onToggle={() => setOpen((value) => !value)} />
      <div className="mt-auto pt-3">
        <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-3">
          <span className="text-xs text-zinc-400">Total spent till now</span>
          <span className="text-lg font-semibold leading-none tabular-nums text-[#fff05a]">≈ {rupees(usage.periods.all.costInr)}</span>
        </div>
      </div>
    </UsageCard>
  );
}
