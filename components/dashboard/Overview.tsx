'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Clapperboard, Image as ImageIcon, Images, Play, Radio } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import type { DashboardOutcomes, DashboardOverview, DashboardProject, LiveJob, TeamMember } from '@/lib/dashboard/types';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import { cx, timeAgo } from '@/components/playground/ui';
import { ActivityChart } from './ActivityChart';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { Gallery } from './Gallery';
import { isGenerating, itemStartedAt, itemTitle } from './items';
import { RunBar } from './LiveList';
import { LiveDot } from './Sidebar';
import { TeamList } from './TeamTable';
import { GeneratedCard, SpendCard } from './UsageCards';
import {
  ArrowLink, dashboardHref, displayName, elapsed, failureMessage, failureOf, formatCount, Loading, Message, PageHeader, Panel, PANEL,
  PILL_OUTLINE, PILL_PRIMARY, PILL_SMALL, useNow, type Failure,
} from './parts';

/** The dashboard's home: a bento of this week's numbers, live work, projects, the team, results and the newest work. */
export function DashboardOverviewPage() {
  return (
    <DashboardShell active="overview">
      <OverviewBody />
    </DashboardShell>
  );
}

/** ▲ / ▼ against the week before; the arrow and words carry the direction, not only the colour. */
function DeltaPill({ now, before, onAccent = false }: { now: number; before: number; onAccent?: boolean }) {
  const change = now - before;
  const text = change === 0 ? 'Same as last week' : `${change > 0 ? '▲' : '▼'} ${formatCount(Math.abs(change))} vs last week`;
  const tone = onAccent ? 'bg-black/10 text-[#1f1c00]' : change > 0 ? 'bg-emerald-400/10 text-emerald-300' : change < 0 ? 'bg-[#ec835a]/10 text-[#ec835a]' : 'bg-white/[0.05] text-zinc-400';
  return <span className={cx('inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium', tone)}>{text}</span>;
}

function FootPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex max-w-full truncate rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-400">{children}</span>;
}

function KpiCard({ label, value, foot, href, hero = false, live = false }: { label: string; value: string; foot: ReactNode; href?: string; hero?: boolean; live?: boolean }) {
  return (
    <div className={cx('flex min-w-0 flex-col justify-between rounded-[20px] p-4 sm:p-5', hero ? 'bg-[#fff05a] text-[#1f1c00]' : PANEL)}>
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <p className={cx('pt-1.5 text-sm font-medium sm:text-[15px]', hero ? 'text-[#1f1c00]' : 'text-zinc-200')}>{label}</p>
        {href && <ArrowLink href={href} label={`Open ${label.toLowerCase()}`} onAccent={hero} />}
      </div>
      <p className={cx('mt-4 text-[34px] font-semibold leading-none tracking-tight sm:mt-5 sm:text-[44px]', hero ? 'text-[#1f1c00]' : live ? 'text-[#fff05a]' : 'text-zinc-50')}>{value}</p>
      <div className="mt-3 sm:mt-4">{foot}</div>
    </div>
  );
}

/** The headline for what is running: "Priya is making 24 images", where, and since when. */
function spotlightOf(lead: LiveJob, memberById: Map<string, TeamMember>) {
  const name = displayName(memberById.get(lead.userId));
  if (lead.kind === 'run') {
    return {
      headline: lead.paused ? `${name}’s images are paused` : `${name} is making ${lead.total} image${lead.total === 1 ? '' : 's'}`,
      detail: `${lead.projectName ?? 'Playground'} · ${lead.done} of ${lead.total} done`,
      since: lead.startedAt ?? lead.createdAt,
    };
  }
  const headline = lead.video.review ? `${name}’s video is waiting for approval` : `${name} is rendering a video`;
  return { headline, detail: itemTitle(lead), since: itemStartedAt(lead) };
}

function LiveSpotlight({ lastActiveAt }: { lastActiveAt: string | null }) {
  const preview = useDashboardPreview();
  const { live, memberById } = useDashboard();
  const items = live ?? [];
  const now = useNow(items.length > 0);
  const liveHref = dashboardHref('/live', {}, preview);
  return (
    <Panel title="Live now" action={<ArrowLink href={liveHref} label="Open live" />} bodyClassName="flex flex-col p-5 pt-4">
      {live === null ? <Loading className="py-10" /> : items.length ? (() => {
        // What is being made leads; a video waiting for approval, then a paused run, only when nothing is.
        const rank = (job: LiveJob) => (job.kind === 'run' ? (job.paused ? 2 : 0) : job.video.review ? 1 : 0);
        const lead = [...items].sort((a, b) => rank(a) - rank(b))[0];
        const { headline, detail, since } = spotlightOf(lead, memberById);
        const paused = lead.kind === 'run' && lead.paused;
        return (
          <>
            <p className={cx('text-[22px] font-semibold leading-snug tracking-tight', paused ? 'text-zinc-50' : 'text-[#fff05a]')}>{headline}</p>
            <p className="mt-2 truncate text-sm text-zinc-400">{detail} · <span className="tabular-nums">{elapsed(since, now)}</span></p>
            {lead.kind === 'run' && <RunBar run={lead} className="mt-3" />}
            {items.length > 1 && <p className="mt-2 text-xs text-zinc-500">{items.length - 1} more in progress across the team</p>}
            <Link href={liveHref} className={cx(PILL_PRIMARY, 'mt-auto w-full')}><Play className="h-4 w-4 fill-current" /> Watch live</Link>
          </>
        );
      })() : (
        <>
          <p className="text-[22px] font-semibold leading-snug tracking-tight text-zinc-50">All quiet right now</p>
          <p className="mt-2 text-sm text-zinc-400">{lastActiveAt ? `Last activity ${timeAgo(lastActiveAt)}` : 'Nothing made yet'}</p>
          <Link href={dashboardHref('/gallery', {}, preview)} className={cx(PILL_OUTLINE, 'mt-auto w-full')}><Images className="h-4 w-4" /> Open gallery</Link>
        </>
      )}
    </Panel>
  );
}

function ProjectCover({ project }: { project: DashboardProject }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06]">
      {project.coverUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.coverUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : project.kind === 'video' ? <Clapperboard className="h-5 w-5 text-zinc-600" /> : <ImageIcon className="h-5 w-5 text-zinc-600" />}
    </span>
  );
}

function ProjectsCard({ projects, className }: { projects: DashboardProject[]; className?: string }) {
  const preview = useDashboardPreview();
  const { memberById } = useDashboard();
  return (
    <Panel title="Projects" description="Updated most recently" className={className} bodyClassName="px-3 pb-3 pt-3">
      {projects.length === 0 ? <p className="px-2 py-8 text-center text-sm text-zinc-500">No projects yet.</p> : (
        <ul className="space-y-1">
          {projects.map((project) => (
            <li key={`${project.kind}-${project.id}`}>
              <Link
                href={dashboardHref(`/accounts/${project.userId}`, { tab: 'projects', project: project.id, kind: project.kind }, preview)}
                className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/[0.04]"
              >
                <ProjectCover project={project} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-100">{project.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{displayName(memberById.get(project.userId))} · {timeAgo(project.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const ARC = 'M20 100 A80 80 0 0 1 180 100';
const ARC_LENGTH = Math.PI * 80;
const OUTCOMES = [
  { key: 'finished', label: 'Finished', color: '#fff05a' },
  { key: 'failed', label: 'Failed', color: '#e5484d' },
  { key: 'cancelled', label: 'Cancelled', color: '#52525b' },
] as const;

/** How the last 30 days ended, as a half-circle gauge: finished, failed, cancelled. */
function ResultsGauge({ outcomes }: { outcomes: DashboardOutcomes }) {
  const total = outcomes.finished + outcomes.failed + outcomes.cancelled;
  const share = (value: number) => (total ? value / total : 0);
  const lengths = OUTCOMES.map((outcome) => share(outcomes[outcome.key]) * ARC_LENGTH);
  const segments = OUTCOMES.map((outcome, index) => ({
    ...outcome,
    length: lengths[index],
    // Each segment starts where the ones before it end.
    start: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  })).filter((segment) => segment.length > 0);
  const gap = segments.length > 1 ? 3 : 0;
  return (
    <Panel title="Results" description="Last 30 days, images and videos">
      {total === 0 ? <p className="py-8 text-center text-sm text-zinc-500">Nothing generated in the last 30 days.</p> : (
        <>
          <div className="relative mx-auto max-w-[260px]">
            <svg viewBox="0 0 200 108" className="w-full" role="img" aria-label={`${Math.round(share(outcomes.finished) * 100)}% finished`}>
              <path d={ARC} fill="none" stroke="#1b1b1f" strokeWidth={22} />
              {segments.map((segment) => (
                <path
                  key={segment.key}
                  d={ARC}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={22}
                  strokeDasharray={`${Math.max(0, segment.length - gap)} ${ARC_LENGTH * 2}`}
                  strokeDashoffset={-segment.start}
                />
              ))}
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
              <p className="text-[34px] font-semibold leading-none tracking-tight text-zinc-50">{Math.round(share(outcomes.finished) * 100)}%</p>
              <p className="mt-1 text-xs text-zinc-400">finished</p>
            </div>
          </div>
          <ul className="mt-5 space-y-1.5 text-sm">
            {OUTCOMES.map((outcome) => (
              <li key={outcome.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: outcome.color }} />
                <span className="text-zinc-300">{outcome.label}</span>
                <span className="ml-auto tabular-nums text-zinc-400">{formatCount(outcomes[outcome.key])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** The team's credits: the total left, what 30 days used, and each balance (lowest first: who needs a top-up). */
/** Credits left per account; "used" is the same 30-day total as the headline card (everyone's work). */
function CreditsCard({ members, used }: { members: DashboardOverview['members']; used: number }) {
  const left = members.reduce((sum, member) => sum + (member.summary.balance ?? 0), 0);
  const balances = members.filter((member) => member.summary.balance !== null).sort((a, b) => (a.summary.balance ?? 0) - (b.summary.balance ?? 0)).slice(0, 4);
  const most = Math.max(1, ...balances.map((member) => member.summary.balance ?? 0));
  return (
    <div className={cx(PANEL, 'flex min-w-0 flex-col p-5')}>
      <p className="text-[17px] font-semibold tracking-tight text-zinc-50">Credits left</p>
      <p className="mt-0.5 text-xs text-zinc-500">{formatCount(used)} used in the last 30 days</p>
      <p className="mt-5 text-[44px] font-semibold leading-none tracking-tight text-zinc-50">{formatCount(left)}</p>
      {balances.length > 0 && (
        <ul className="mt-auto space-y-2.5 pt-5" aria-label="Credits left per account, lowest first">
          {balances.map((member) => {
            const balance = member.summary.balance ?? 0;
            return (
              <li key={member.id}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-zinc-300">{displayName(member)}</span>
                  <span className="tabular-nums text-zinc-400">{formatCount(balance)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-zinc-400" style={{ width: `${Math.max(2, (balance / most) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OverviewBody() {
  const preview = useDashboardPreview();
  const { live, settledKey } = useDashboard();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  // Loads again whenever something that was live finishes, so the numbers stay current.
  useEffect(() => {
    let active = true;
    dashboardApi.overview()
      .then((next) => {
        if (!active) return;
        setOverview(next);
        setFailure(null);
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [settledKey]);

  const generating = useMemo(() => (live ?? []).filter(isGenerating), [live]);
  const liveByMember = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of generating) counts.set(job.userId, (counts.get(job.userId) ?? 0) + 1);
    return counts;
  }, [generating]);

  if (failure && !overview) return <Message {...failureMessage(failure)} />;
  if (!overview) return <Loading />;

  const { kpis } = overview;
  const liveCount = live === null ? kpis.liveCount : generating.length;
  const liveAccounts = live === null ? 0 : liveByMember.size;
  const lastActiveAt = overview.members.map((member) => member.summary.lastActiveAt).filter((at): at is string => Boolean(at)).sort().at(-1) ?? null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything the GoGrowth team is making, as it happens."
        actions={(
          <>
            <Link href={dashboardHref('/gallery', {}, preview)} className={PILL_PRIMARY}><Images className="h-4 w-4" /> Open gallery</Link>
            <Link href={dashboardHref('/live', {}, preview)} className={PILL_OUTLINE}>
              {liveCount > 0 ? <LiveDot /> : <Radio className="h-4 w-4 text-zinc-500" />} Live · {liveCount}
            </Link>
          </>
        )}
      />

      {/* Two stat cards a row on a phone; the bento below lines up with these columns. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard hero label="Images this week" value={formatCount(kpis.images7d)} foot={<DeltaPill onAccent now={kpis.images7d} before={kpis.imagesPrev7d} />} href={dashboardHref('/gallery', {}, preview)} />
        <KpiCard label="Videos this week" value={formatCount(kpis.videos7d)} foot={<DeltaPill now={kpis.videos7d} before={kpis.videosPrev7d} />} href={dashboardHref('/gallery', {}, preview)} />
        <KpiCard label="Credits used" value={formatCount(kpis.credits30d)} foot={<FootPill>Last 30 days</FootPill>} />
        <KpiCard
          label="Generating now"
          value={formatCount(liveCount)}
          live={liveCount > 0}
          foot={<FootPill>{liveCount ? `Across ${liveAccounts} account${liveAccounts === 1 ? '' : 's'}` : 'Nothing running'}</FootPill>}
          href={dashboardHref('/live', {}, preview)}
        />
      </div>

      {/* What was made and what it cost, right under the headline numbers; each card keeps its own height when expanded. */}
      <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <GeneratedCard usage={overview.usage} />
        <SpendCard usage={overview.usage} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <ActivityChart days={overview.activity} className="sm:col-span-2" />
        <LiveSpotlight lastActiveAt={lastActiveAt} />
        <ProjectsCard projects={overview.recentProjects} className="xl:row-span-2" />

        <Panel title="Team" description={`${overview.members.length} account${overview.members.length === 1 ? '' : 's'}`} className="sm:col-span-2" bodyClassName="px-3 pb-3 pt-2">
          <TeamList members={overview.members} liveByMember={liveByMember} />
        </Panel>
        <ResultsGauge outcomes={overview.outcomes30d} />

        <CreditsCard members={overview.members} used={overview.kpis.credits30d} />
        <Panel
          title="Recent"
          description="The newest finished work"
          action={<Link href={dashboardHref('/gallery', {}, preview)} className={PILL_SMALL}>Open gallery</Link>}
          className="sm:col-span-2 xl:col-span-3"
        >
          <Gallery compact={18} compactRows={1} />
        </Panel>
      </div>
    </>
  );
}
