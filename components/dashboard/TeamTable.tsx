'use client';

import Link from 'next/link';
import type { DashboardOverview } from '@/lib/dashboard/types';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { timeAgo } from '@/components/playground/ui';
import { dashboardHref, displayName, formatCount, MemberAvatar, StateChip } from './parts';

type Member = DashboardOverview['members'][number];

const DAY = 86_400_000;

/** Generating now, active today, active some time ago, or never. */
function status(member: Member, live: number): { tone: 'live' | 'active' | 'neutral'; label: string } {
  if (live > 0) return { tone: 'live', label: 'Generating' };
  const last = member.summary.lastActiveAt;
  if (!last) return { tone: 'neutral', label: 'Idle' };
  if (Date.now() - Date.parse(last) < DAY) return { tone: 'active', label: 'Active today' };
  return { tone: 'neutral', label: `Active ${timeAgo(last)}` };
}

/** Each account in a row: who, what they're working on, their state, what they made. Each row opens the account. */
export function TeamList({ members, liveByMember }: { members: Member[]; liveByMember: Map<string, number> }) {
  const preview = useDashboardPreview();
  if (!members.length) return <p className="py-8 text-center text-sm text-zinc-500">No one has signed in with a team account yet.</p>;
  return (
    <ul className="-mx-2 space-y-1">
      {members.map((member) => {
        const state = status(member, liveByMember.get(member.id) ?? 0);
        const project = member.latestProject;
        return (
          <li key={member.id}>
            <Link href={dashboardHref(`/accounts/${member.id}`, {}, preview)} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]">
              <MemberAvatar name={member.name} email={member.email} url={member.avatarUrl} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-zinc-50">{displayName(member)}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {project ? <>Working on <span className="text-zinc-300">{project.name}</span></> : 'No projects yet'}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StateChip tone={state.tone} spinning={state.tone === 'live'}>{state.label}</StateChip>
                <span className="text-[11px] tabular-nums text-zinc-500">{formatCount(member.summary.imagesMade)} images · {formatCount(member.summary.videosMade)} videos</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
