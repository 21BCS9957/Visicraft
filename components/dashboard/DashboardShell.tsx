'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { signInWithGoogle } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';
import { dashboardApi } from '@/lib/dashboard/client';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import toast from '@/lib/toast';
import { DashboardDataProvider, useDashboard } from './DashboardData';
import { isGenerating } from './items';
import { SidebarContent, type DashboardSection } from './Sidebar';
import { dashboardHref, Loading, Message, PANEL } from './parts';

type Gate = 'loading' | 'signin' | 'denied' | 'ok';

/** Signed in, and the owner? Decided by the server (every data request checks again). */
function useGate(preview: boolean): { gate: Gate; email: string | null } {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<{ userId: string; allowed: boolean } | null>(null);
  useEffect(() => {
    if (preview || loading || !user) return;
    let live = true;
    dashboardApi.me()
      .then((result) => live && setAllowed({ userId: user.id, allowed: result.allowed }))
      .catch(() => live && setAllowed({ userId: user.id, allowed: false }));
    return () => {
      live = false;
    };
  }, [preview, loading, user]);
  if (preview) return { gate: 'ok', email: 'gogrowthsoftware@gmail.com' };
  if (loading) return { gate: 'loading', email: null };
  if (!user) return { gate: 'signin', email: null };
  if (!allowed || allowed.userId !== user.id) return { gate: 'loading', email: user.email ?? null };
  return { gate: allowed.allowed ? 'ok' : 'denied', email: user.email ?? null };
}

async function signOut() {
  await supabase.auth.signOut().catch(() => undefined);
  window.location.href = '/';
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`${PANEL} w-full max-w-sm p-7 text-center`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gogrowth-logo.png" alt="GoGrowth" className="mx-auto h-8 w-auto" />
      <h1 className="mt-6 text-lg font-semibold text-zinc-50">Team dashboard</h1>
      <p className="mt-1.5 text-sm text-zinc-400">Sign in with GoGrowth’s Google account to see what the team is making.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not start Google sign-in', { position: 'top-center' });
            setBusy(false);
          }
        }}
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" /></svg>
        )}
        Continue with Google
      </button>
    </div>
  );
}

/** The phone's top bar and its drawer (the sidebar's contents). */
function MobileBar({ active, email, preview }: { active: DashboardSection; email: string | null; preview: boolean }) {
  const [open, setOpen] = useState(false);
  const { live } = useDashboard();
  const liveCount = (live ?? []).filter(isGenerating).length;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-black/85 px-4 backdrop-blur-md lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="-ml-1.5 rounded-lg p-1.5 text-zinc-300 hover:bg-white/[0.06]">
          <Menu className="h-5 w-5" />
        </button>
        <Link href={dashboardHref('/', {}, preview)} className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gogrowth-mark.png" alt="" className="h-6 w-6" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gogrowth-wordmark.png" alt="GoGrowth" className="h-[13px] w-auto" />
        </Link>
        {liveCount > 0 && (
          <Link href={dashboardHref('/live', {}, preview)} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#fff05a]/30 bg-[#fff05a]/10 px-2.5 py-1 text-xs font-medium text-[#fff05a]">
            {liveCount} live
          </Link>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-white/[0.06] bg-black">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06]">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent active={active} email={email} onSignOut={preview ? undefined : () => void signOut()} onNavigate={() => setOpen(false)} inDrawer />
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * The dashboard's frame: Google sign-in and the owner check, then a sidebar (sections and the
 * team) beside the page. `children` render only for the owner.
 */
export function DashboardShell({ active, children }: { active: DashboardSection; children: ReactNode }) {
  const preview = useDashboardPreview();
  const { gate, email } = useGate(preview);

  if (gate !== 'ok') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-zinc-100">
        {gate === 'loading' && <Loading />}
        {gate === 'signin' && <SignIn />}
        {gate === 'denied' && (
          <Message title="Only for GoGrowth’s owner" body={`You’re signed in as ${email ?? 'another account'}. This dashboard opens only with GoGrowth’s owner account.`}>
            <button type="button" onClick={() => void signOut()} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-zinc-200">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </Message>
        )}
      </div>
    );
  }

  return (
    <DashboardDataProvider>
      <div className="min-h-screen bg-black text-zinc-100">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-white/[0.06] bg-black lg:block">
          <SidebarContent active={active} email={email} onSignOut={preview ? undefined : () => void signOut()} />
        </aside>
        <MobileBar active={active} email={email} preview={preview} />
        <main className="lg:pl-[248px]">
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">{children}</div>
        </main>
      </div>
    </DashboardDataProvider>
  );
}
