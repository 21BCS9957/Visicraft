'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { signInWithGoogle } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';
import { dashboardApi } from '@/lib/dashboard/client';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import toast from '@/lib/toast';
import { dashboardHref, Loading, Message } from './parts';

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
    <div className="mx-auto mt-16 max-w-sm rounded-[28px] border border-white/10 bg-[#111114] p-7 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gogrowth-logo.png" alt="GoGrowth" className="mx-auto h-9 w-auto" />
      <h1 className="mt-6 text-xl font-light text-white">Dashboard</h1>
      <p className="mt-1.5 text-sm text-white/50">Sign in with GoGrowth’s Google account to see the team’s generations.</p>
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
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-black hover:bg-[#fff05a] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" /></svg>
        )}
        Continue with Google
      </button>
    </div>
  );
}

/**
 * The dashboard's frame: its own top bar (no site navbar), the Google sign-in, and the owner
 * check. `children` only render for the owner.
 */
export function DashboardShell({ children, crumb }: { children: ReactNode; crumb?: ReactNode }) {
  const preview = useDashboardPreview();
  const { gate, email } = useGate(preview);
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(255,240,90,0.06),transparent_60%)]" />
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0a0a0d]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-8">
          <Link href={dashboardHref('/', {}, preview)} className="flex shrink-0 items-center gap-2" title="Dashboard home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gogrowth-mark.png" alt="" className="h-7 w-7" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gogrowth-wordmark.png" alt="GoGrowth" className="hidden h-[15px] w-auto sm:block" />
          </Link>
          <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/55">Dashboard</span>
          {crumb && <div className="min-w-0 truncate text-sm text-white/60">{crumb}</div>}
          {gate === 'ok' && (
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden max-w-[220px] truncate text-xs text-white/45 sm:inline">{email}</span>
              {!preview && (
                <button type="button" onClick={() => void signOut()} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 px-3 text-xs text-white/70 hover:bg-white/8 hover:text-white">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-8 sm:px-8">
        {gate === 'loading' && <Loading />}
        {gate === 'signin' && <SignIn />}
        {gate === 'denied' && (
          <Message title="Only for GoGrowth’s owner" body={`You’re signed in as ${email ?? 'another account'}. This dashboard opens only with GoGrowth’s owner account.`}>
            <button type="button" onClick={() => void signOut()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </Message>
        )}
        {gate === 'ok' && children}
      </main>
    </div>
  );
}
