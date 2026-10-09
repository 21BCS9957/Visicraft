'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { isAdminPreview } from '@/lib/admin/preview';

/** The admin pages' backdrop and width, as the Playground and Video hubs have them. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(255,240,90,0.06),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">{children}</div>
    </div>
  );
}

/** A centred message: not signed in, not the admin, or a failure. */
export function AdminMessage({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-[24px] border border-white/10 bg-[#111114] p-6 text-center">
      <Lock className="mx-auto h-6 w-6 text-white/40" />
      <h1 className="mt-3 text-lg font-light text-white">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-white/55">{body}</p>
      {action && (
        <Link href={action.href} className="mt-5 inline-flex h-10 items-center rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Signed-in check for the admin pages. Whether this account is the admin is decided by the
 * server on every request; a refusal shows `AdminMessage`.
 */
export function useAdminSession(): { ready: boolean; signedIn: boolean; userId: string | null } {
  const { user, loading } = useAuth();
  // Development sample data needs no sign-in.
  if (isAdminPreview()) return { ready: true, signedIn: true, userId: 'preview' };
  return { ready: !loading, signedIn: Boolean(user), userId: user?.id ?? null };
}

export function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-white/45">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/** What a refusal from the admin API means for the person looking. */
export function adminRefusal(status: number, message: string) {
  if (status === 401) return { title: 'Please sign in', body: 'Sign in with the GoGrowth admin account to see team workspaces.', action: { href: '/login', label: 'Sign in' } };
  if (status === 403) return { title: 'Only for the GoGrowth admin', body: 'Team workspaces can only be opened by the GoGrowth admin account.', action: { href: '/', label: 'Go home' } };
  if (status === 404) return { title: 'Not a team account', body: 'Only accounts in the GoGrowth team can be viewed here.', action: { href: '/admin/team', label: 'Back to the team' } };
  return { title: 'Something went wrong', body: message, action: { href: '/admin/team', label: 'Back to the team' } };
}
