'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Clapperboard, Coins, Image as ImageIcon, Wallet } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import type { DashboardOverview, TeamMember } from '@/lib/dashboard/types';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { cx, timeAgo } from '@/components/playground/ui';
import { DashboardShell } from './DashboardShell';
import { GenerationFeed, LiveNow } from './Feed';
import { dashboardHref, failureMessage, failureOf, Loading, MemberAvatar, Message, type Failure } from './parts';

/** The dashboard's home: what's generating now, every account, and everything made. */
export function DashboardOverviewPage() {
  return (
    <DashboardShell>
      <OverviewBody />
    </DashboardShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-black/20 px-2 py-2 text-center">
      <p className="flex items-center justify-center gap-1 text-sm font-light tabular-nums text-white">{icon}{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-white/40">{label}</p>
    </div>
  );
}

function OverviewBody() {
  const preview = useDashboardPreview();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    dashboardApi.overview().then((next) => {
      setOverview(next);
      setFailure(null);
    }).catch((error) => setFailure(failureOf(error)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Something finished: the feed and the counts pick it up.
  const settled = useCallback(() => {
    setRefreshKey((key) => key + 1);
    load();
  }, [load]);

  const members = useMemo(() => new Map<string, TeamMember>((overview?.members ?? []).map((member) => [member.id, member])), [overview]);

  if (failure && !overview) return <Message {...failureMessage(failure)} />;
  if (!overview) return <Loading />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-light text-white sm:text-4xl">Team</h1>
        <p className="mt-1.5 text-sm text-white/50">Every @{overview.domain} account: what it’s generating now and everything it has made. Read-only.</p>
      </div>

      <LiveNow members={members} onSettled={settled} />

      <section>
        <h2 className="mb-4 text-lg font-light text-white">Accounts <span className="text-sm text-white/40">{overview.members.length}</span></h2>
        {overview.members.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">No one has signed in with an @{overview.domain} account yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overview.members.map((member) => (
              <Link key={member.id} href={dashboardHref(`/accounts/${member.id}`, {}, preview)} className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <MemberAvatar name={member.name} email={member.email} url={member.avatarUrl} />
                    {member.liveCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#111114] bg-[#fff05a]" title={`${member.liveCount} generating now`} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{member.name ?? member.email.split('@')[0]}</p>
                    <p className="truncate text-xs text-white/45">{member.email}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Stat icon={<ImageIcon className="h-3.5 w-3.5" />} value={member.summary.imagesMade.toLocaleString('en-IN')} label={`images · ${member.summary.imageProjects} projects`} />
                  <Stat icon={<Clapperboard className="h-3.5 w-3.5" />} value={String(member.summary.videosMade)} label={`videos · ${member.summary.videoProjects} projects`} />
                  <Stat icon={<Coins className="h-3.5 w-3.5" />} value={member.summary.creditsUsed30d.toLocaleString('en-IN')} label="credits used, 30 days" />
                  <Stat icon={<Wallet className="h-3.5 w-3.5" />} value={member.summary.balance === null ? '—' : member.summary.balance.toLocaleString('en-IN')} label="credits left" />
                </div>
                <p className={cx('mt-3 text-[11px]', member.liveCount > 0 ? 'text-[#fff05a]/85' : 'text-white/40')}>
                  {member.liveCount > 0
                    ? `${member.liveCount} generating now`
                    : member.summary.lastActiveAt ? `Last made something ${timeAgo(member.summary.lastActiveAt)}` : 'Hasn’t made anything yet'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <GenerationFeed members={members} accountFilter refreshKey={refreshKey} />
    </div>
  );
}
