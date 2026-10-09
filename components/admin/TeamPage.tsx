'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Clapperboard, Coins, Image as ImageIcon, Users } from 'lucide-react';
import { AdminApiError, adminApi } from '@/lib/admin/client';
import type { TeamOverview } from '@/lib/admin/types';
import { isAdminPreview } from '@/lib/admin/preview';
import { timeAgo } from '@/components/playground/ui';
import { AdminLoading, AdminMessage, AdminShell, adminRefusal, useAdminSession } from './AdminShell';

/** A member's picture, or their first letter. */
export function MemberAvatar({ name, email, url, size = 'md' }: { name: string | null; email: string; url: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 rounded-full border border-white/10 object-cover`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] font-medium uppercase text-white/75`}>
      {(name ?? email).charAt(0)}
    </span>
  );
}

/** The admin's list of team accounts, each with what they have made. Read-only. */
export function TeamPage() {
  const session = useAdminSession();
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    if (!session.ready || !session.signedIn) return;
    adminApi.team()
      .then(setTeam)
      .catch((error) => setFailure({ status: error instanceof AdminApiError ? error.status : 500, message: error instanceof Error ? error.message : 'Could not load the team.' }));
  }, [session.ready, session.signedIn, session.userId]);

  if (session.ready && !session.signedIn) return <AdminShell><AdminMessage {...adminRefusal(401, '')} /></AdminShell>;
  if (failure) return <AdminShell><AdminMessage {...adminRefusal(failure.status, failure.message)} /></AdminShell>;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#fff05a]/80"><Users className="h-3.5 w-3.5" /> Admin</p>
          <h1 className="mt-2 text-3xl font-light text-white sm:text-4xl">Team workspaces</h1>
          <p className="mt-2 max-w-xl text-sm text-white/50">
            {team ? `Everyone signed in with an @${team.domain} account.` : 'Everyone in the team.'} Open a workspace to see their images, videos and Library. You can look, not change anything.
          </p>
        </div>
      </div>

      {!team ? (
        <AdminLoading />
      ) : team.members.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">
          No one has signed in with an @{team.domain} account yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {team.members.map((member) => (
            <Link
              key={member.id}
              href={`/admin/team/${member.id}${isAdminPreview() ? '?previewAdmin=1' : ''}`}
              className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3">
                <MemberAvatar name={member.name} email={member.email} url={member.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{member.name ?? member.email.split('@')[0]}</p>
                  <p className="truncate text-xs text-white/45">{member.email}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat icon={<ImageIcon className="h-3.5 w-3.5" />} value={member.summary.imagesMade} label={`images · ${member.summary.imageProjects} project${member.summary.imageProjects === 1 ? '' : 's'}`} />
                <Stat icon={<Clapperboard className="h-3.5 w-3.5" />} value={member.summary.videosMade} label={`videos · ${member.summary.videoProjects} project${member.summary.videoProjects === 1 ? '' : 's'}`} />
                <Stat icon={<Coins className="h-3.5 w-3.5" />} value={member.summary.creditsUsed30d} label="credits, 30 days" />
              </div>
              <p className="mt-3 text-[11px] text-white/40">
                {member.summary.lastActiveAt ? `Last made something ${timeAgo(member.summary.lastActiveAt)}` : 'Hasn’t made anything yet'}
                {member.lastSignInAt ? ` · signed in ${timeAgo(member.lastSignInAt)}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-black/20 px-2 py-2">
      <p className="flex items-center justify-center gap-1 text-base font-light tabular-nums text-white">{icon}{value.toLocaleString('en-IN')}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-white/40">{label}</p>
    </div>
  );
}
