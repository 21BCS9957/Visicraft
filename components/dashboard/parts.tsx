'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2, Lock, X } from 'lucide-react';
import { DashboardApiError } from '@/lib/dashboard/client';
import type { TeamMember } from '@/lib/dashboard/types';
import { cx } from '@/components/playground/ui';

/*
 * The dashboard's building blocks. One visual system throughout: a black page, #121214 cards
 * with 20px corners and a hairline border, pill buttons and chips, three text tones
 * (zinc-100 / 400 / 500), and the brand yellow only for the hero card, the main action, today
 * and anything live.
 */

export const ACCENT = '#fff05a';
/** Text on the yellow. */
export const ON_ACCENT = '#1f1c00';

export const PANEL = 'rounded-[20px] border border-white/[0.08] bg-[#121214]';
export const PILL_PRIMARY = 'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-[#1f1c00] transition-colors hover:bg-[#fff59a]';
export const PILL_OUTLINE = 'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-sm text-zinc-100 transition-colors hover:bg-white/[0.06]';
export const PILL_SMALL = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/12 px-3 text-xs text-zinc-200 transition-colors hover:bg-white/[0.06]';

/** The round ↗ on a card that opens what it summarises. */
export function ArrowLink({ href, label, onAccent = false }: { href: string; label: string; onAccent?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        onAccent ? 'bg-[#1f1c00] text-[#fff05a] hover:bg-black' : 'border border-white/15 text-zinc-300 hover:bg-white/[0.08] hover:text-white'
      )}
    >
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

/** A dashboard path ("/" or "/accounts/…"); the dev sample-data flag travels along when `preview`. */
export function dashboardHref(path: string, params: Record<string, string | null | undefined> = {}, preview = false): string {
  const search = new URLSearchParams();
  if (preview) search.set('previewDashboard', '1');
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

export type Failure = { status: number; message: string };

export const failureOf = (error: unknown): Failure => ({
  status: error instanceof DashboardApiError ? error.status : 500,
  message: error instanceof Error ? error.message : 'Something went wrong.',
});

/** What a failed request means for the person looking. */
export function failureMessage(failure: Failure): { title: string; body: string } {
  if (failure.status === 403) return { title: 'Only for GoGrowth’s owner', body: 'This dashboard can only be opened with GoGrowth’s owner account.' };
  if (failure.status === 404) return { title: 'Not a GoGrowth account', body: 'Only @gogrowthlabs.com accounts can be viewed here.' };
  if (failure.status === 401) return { title: 'Please sign in again', body: 'Your sign-in ran out. Sign in with Google to continue.' };
  return { title: 'Something went wrong', body: failure.message };
}

/** A member's name, or the part of their email before the @. */
export function displayName(member?: Pick<TeamMember, 'name' | 'email'> | null, fallback = 'Team member'): string {
  return member?.name ?? (member?.email ? member.email.split('@')[0] : fallback);
}

const AVATAR_SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-12 w-12 text-base' } as const;

/** An account's picture, or its first letter. */
export function MemberAvatar({ name, email, url, size = 'md' }: { name: string | null; email: string; url: string | null; size?: keyof typeof AVATAR_SIZES }) {
  const box = AVATAR_SIZES[size];
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 rounded-full object-cover ring-1 ring-white/10`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-medium uppercase text-zinc-300 ring-1 ring-white/10`}>
      {(name ?? email).charAt(0)}
    </span>
  );
}

export function Loading({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-center py-24 text-zinc-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/** A centred message: a refusal or a failure. */
export function Message({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className={cx(PANEL, 'mx-auto mt-16 max-w-md p-6 text-center')}>
      <Lock className="mx-auto h-5 w-5 text-zinc-500" />
      <h1 className="mt-3 text-base font-semibold text-zinc-100">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

/** A page's title, one plain sentence, and its controls on the right. */
export function PageHeader({ title, description, actions, lead }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {lead}
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-400 sm:text-[15px]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A section card with an optional title row. */
export function Panel({ title, description, action, children, className, bodyClassName }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx(PANEL, 'flex min-w-0 flex-col', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-tight text-zinc-50">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cx('min-w-0 flex-1', bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

/** A row of mutually exclusive options (Images · Videos, Finished · Failed). */
export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string; count?: number | null }>;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-[#0b0b0d] p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors',
            size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-[13px]',
            value === option.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
          )}
        >
          {option.label}
          {typeof option.count === 'number' && <span className={cx('tabular-nums', value === option.id ? 'text-zinc-500' : 'text-zinc-600')}>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

const CHIP_TONES = {
  live: 'border-[#fff05a]/30 bg-[#fff05a]/10 text-[#fff05a]',
  active: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  waiting: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
  failed: 'border-red-400/25 bg-red-400/10 text-red-300',
  neutral: 'border-white/10 bg-white/[0.04] text-zinc-300',
} as const;

/** A short state label (Generating, Rendering, Failed…). */
export function StateChip({ tone, spinning = false, children }: { tone: keyof typeof CHIP_TONES; spinning?: boolean; children: ReactNode }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium', CHIP_TONES[tone])}>
      {spinning && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </span>
  );
}

/** Nothing to show: an icon, a heading and a plain sentence. */
export function EmptyState({ icon, title, body, className }: { icon?: ReactNode; title: string; body?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-zinc-500">{icon}</div>}
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
    </div>
  );
}

/** A dark overlay with a panel, closed by Escape or a click outside (documents and Library videos). */
export function Overlay({ onClose, children, wide = false }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={onClose} role="dialog">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
        <X className="h-5 w-5" />
      </button>
      <div className={cx(PANEL, 'max-h-full w-full overflow-y-auto p-5', wide ? 'max-w-5xl' : 'max-w-2xl')} onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}

/** How long ago something started, in minutes and seconds ("1m 20s"). */
export function elapsed(since: string | null | undefined, now: number): string {
  if (!since) return '';
  const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** A clock that ticks every second while `active` (for running timers). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_TITLE = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const DAY_TITLE_YEAR = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const WHEN = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The local calendar day of a time, as YYYY-MM-DD. */
export const dayKey = (iso: string) => DAY_KEY.format(new Date(iso));

/** "Today", "Yesterday", "Mon, 6 Oct" (with the year when it isn't this year). */
export function dayTitle(iso: string, now = Date.now()): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date(now).toISOString())) return 'Today';
  if (key === dayKey(new Date(now - 86_400_000).toISOString())) return 'Yesterday';
  const date = new Date(iso);
  return (date.getFullYear() === new Date(now).getFullYear() ? DAY_TITLE : DAY_TITLE_YEAR).format(date);
}

/** "12 Oct 2026, 4:05 pm". */
export const formatWhen = (iso: string) => WHEN.format(new Date(iso));

/** 1,234 (Indian grouping, as the team reads numbers). */
export const formatCount = (value: number) => value.toLocaleString('en-IN');
