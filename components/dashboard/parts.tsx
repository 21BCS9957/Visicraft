'use client';

import { useEffect, type ReactNode } from 'react';
import { Loader2, Lock, X } from 'lucide-react';
import { DashboardApiError } from '@/lib/dashboard/client';

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

/** An account's picture, or its first letter. */
export function MemberAvatar({ name, email, url, size = 'md' }: { name: string | null; email: string; url: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-11 w-11 text-sm';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 rounded-full border border-white/10 object-cover`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] font-medium uppercase text-white/75`}>
      {(name ?? email).charAt(0)}
    </span>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-white/45">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/** A centred message: a refusal or a failure. */
export function Message({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-[24px] border border-white/10 bg-[#111114] p-6 text-center">
      <Lock className="mx-auto h-6 w-6 text-white/40" />
      <h1 className="mt-3 text-lg font-light text-white">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-white/55">{body}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

/** What a failed request means for the person looking. */
export function failureMessage(failure: Failure): { title: string; body: string } {
  if (failure.status === 403) return { title: 'Only for GoGrowth’s owner', body: 'This dashboard can only be opened with GoGrowth’s owner account.' };
  if (failure.status === 404) return { title: 'Not a GoGrowth account', body: 'Only @gogrowthlabs.com accounts can be viewed here.' };
  if (failure.status === 401) return { title: 'Please sign in again', body: 'Your sign-in ran out. Sign in with Google to continue.' };
  return { title: 'Something went wrong', body: failure.message };
}

/** A dark overlay with a panel, closed by Escape or a click outside. */
export function Overlay({ onClose, children, wide = false }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xl" onClick={onClose} role="dialog">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <div className={`max-h-full w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#141418] p-4 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`} onClick={(event) => event.stopPropagation()}>{children}</div>
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
