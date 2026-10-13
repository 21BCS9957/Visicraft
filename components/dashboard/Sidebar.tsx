'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { Images, LayoutDashboard, LogOut, Radio } from 'lucide-react';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { cx } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { isGenerating } from './items';
import { dashboardHref, displayName, MemberAvatar } from './parts';

/** Which page is open: a section, or one account. */
export type DashboardSection = 'overview' | 'gallery' | 'live' | `account:${string}`;

/** A pulsing yellow dot: this account is generating right now. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative flex h-2 w-2 shrink-0', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fff05a] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#fff05a]" />
    </span>
  );
}

function NavLink({ href, active, icon, children, trailing, onNavigate }: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-10 items-center gap-2.5 rounded-full px-3 text-sm transition-colors',
        active ? 'bg-white/[0.09] font-medium text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
      )}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  );
}

/** The sidebar's contents: sections, the team, and who is signed in. Shared by the desktop column and the phone drawer. */
export function SidebarContent({ active, email, onSignOut, onNavigate, inDrawer = false }: {
  active: DashboardSection;
  email: string | null;
  onSignOut?: () => void;
  onNavigate?: () => void;
  /** In the phone drawer, whose close button takes the label's place. */
  inDrawer?: boolean;
}) {
  const preview = useDashboardPreview();
  const { members, live, teamFailure } = useDashboard();
  const generating = useMemo(() => (live ?? []).filter(isGenerating), [live]);
  const liveByMember = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of generating) counts.set(job.userId, (counts.get(job.userId) ?? 0) + 1);
    return counts;
  }, [generating]);
  const liveCount = generating.length;
  const href = (path: string) => dashboardHref(path, {}, preview);

  return (
    <div className="flex h-full flex-col">
      <Link href={href('/')} onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-2.5 px-5" title="Dashboard home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gogrowth-mark.png" alt="" className="h-7 w-7" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gogrowth-wordmark.png" alt="GoGrowth" className="h-[14px] w-auto" />
        {!inDrawer && <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Dashboard</span>}
      </Link>

      <nav className="space-y-0.5 px-3" aria-label="Sections">
        <NavLink href={href('/')} active={active === 'overview'} icon={<LayoutDashboard className="h-4 w-4" />} onNavigate={onNavigate}>Overview</NavLink>
        <NavLink href={href('/gallery')} active={active === 'gallery'} icon={<Images className="h-4 w-4" />} onNavigate={onNavigate}>Gallery</NavLink>
        <NavLink
          href={href('/live')}
          active={active === 'live'}
          icon={<Radio className="h-4 w-4" />}
          onNavigate={onNavigate}
          trailing={liveCount > 0 ? <span className="rounded-full bg-[#fff05a] px-2 text-[11px] font-semibold tabular-nums text-[#1f1c00]">{liveCount}</span> : null}
        >
          Live
        </NavLink>
      </nav>

      <p className="mt-7 px-5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Team</p>
      <nav className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Team">
        {teamFailure && <p className="px-2.5 text-xs text-red-300">{teamFailure.message}</p>}
        {members === null && !teamFailure && Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex h-9 items-center gap-2.5 px-2.5">
            <span className="h-6 w-6 animate-pulse rounded-full bg-white/[0.06]" />
            <span className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
        {members?.length === 0 && <p className="px-2.5 text-xs text-zinc-500">No team accounts yet.</p>}
        {members?.map((member) => (
          <NavLink
            key={member.id}
            href={href(`/accounts/${member.id}`)}
            active={active === `account:${member.id}`}
            icon={<MemberAvatar name={member.name} email={member.email} url={member.avatarUrl} size="sm" />}
            onNavigate={onNavigate}
            trailing={liveByMember.get(member.id) ? <LiveDot /> : null}
          >
            {displayName(member)}
          </NavLink>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-zinc-500">Signed in as</p>
          <p className="truncate text-xs text-zinc-300">{email ?? '—'}</p>
        </div>
        {onSignOut && (
          <button type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out" className="rounded-full p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
