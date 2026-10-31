'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronLeft, GitMerge, Pencil } from 'lucide-react';
import toast from '@/lib/toast';
import type { ClientRef } from '@/lib/clients';
import { dashboardApi } from '@/lib/dashboard/client';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import type { ClientProject, DashboardClientDetail, UsageRange } from '@/lib/dashboard/types';
import { ClientPicker } from '@/components/playground/ClientPicker';
import { cx, timeAgo } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { Gallery } from './Gallery';
import { ProjectGrid, SmallStat } from './ProjectCards';
import {
  dashboardHref, displayName, failureMessage, failureOf, formatCount, Loading, MemberAvatar, Message, PageHeader, PILL_OUTLINE, PILL_SMALL,
  projectViewerHref, Segmented, type Failure,
} from './parts';
import { GeneratedCard, PERIODS, PeriodSelect, plural, rupees, SpendCard } from './UsageCards';

const TOAST = { position: 'top-center' as const };
type Tab = 'work' | 'projects';

/**
 * One client: everyone's work for it, or one person's (the chips), for a period: what was made
 * and spent, by whom and with which models, its projects and the work itself. The owner can
 * rename it or merge it into another client; nothing else here changes anything.
 */
export function ClientWorkspace({ clientId }: { clientId: string }) {
  return (
    <DashboardShell active="clients">
      <ClientBody clientId={clientId} />
    </DashboardShell>
  );
}

function ClientBody({ clientId }: { clientId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const preview = useDashboardPreview();
  const { memberById, settledKey } = useDashboard();
  const person = search.get('person');
  const askedPeriod = search.get('period');
  const period: UsageRange = PERIODS.some((option) => option.id === askedPeriod) ? (askedPeriod as UsageRange) : '30d';
  const tab: Tab = search.get('tab') === 'projects' ? 'projects' : 'work';
  const [detail, setDetail] = useState<DashboardClientDetail | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [version, setVersion] = useState(0);

  // The URL keeps the person, period and tab, so a link opens the same view.
  const go = (changes: { person?: string | null; period?: UsageRange; tab?: Tab }) => {
    const next = { person, period, tab, ...changes };
    router.replace(dashboardHref(`/clients/${clientId}`, {
      person: next.person ?? '',
      period: next.period === '30d' ? '' : next.period,
      tab: next.tab === 'work' ? '' : next.tab,
    }, preview), { scroll: false });
  };

  useEffect(() => {
    let active = true;
    dashboardApi.client(clientId, person)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setFailure(null);
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [clientId, person, settledKey, version]);

  const gallery = useMemo(() => (detail ? { id: detail.client.id, projectIds: detail.projects.map((project) => project.id) } : null), [detail]);

  if (failure && !detail) {
    const message = failure.status === 404 ? { title: 'Client not found', body: 'It may have been merged into another client.' } : failureMessage(failure);
    return (
      <Message {...message}>
        <Link href={dashboardHref('/clients', {}, preview)} className={PILL_OUTLINE}>All clients</Link>
      </Message>
    );
  }
  if (!detail) return <Loading />;

  const { client, people, usage } = detail;
  const shown = usage.periods[period];
  const names = people.map((entry) => displayName(memberById.get(entry.userId)));
  // Still the previous person's numbers while the new ones load.
  const switching = (detail.person ?? null) !== (person && people.some((entry) => entry.userId === person) ? person : null);

  const rename = async () => {
    const name = window.prompt('Client name', client.name)?.trim();
    if (!name || name === client.name) return;
    try {
      await dashboardApi.renameClient(client.id, name);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename the client', TOAST);
    }
  };

  return (
    <>
      <Link href={dashboardHref('/clients', {}, preview)} className={cx(PILL_SMALL, 'mb-4')}>
        <ChevronLeft className="h-3.5 w-3.5" /> Clients
      </Link>
      <PageHeader
        lead={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500 ring-1 ring-white/[0.08]"><Building2 className="h-5 w-5" /></span>}
        title={client.name}
        description={[
          plural(detail.projectCount, 'project'),
          names.length ? names.join(', ') : 'nobody yet',
          detail.lastActiveAt ? `active ${timeAgo(detail.lastActiveAt)}` : null,
        ].filter(Boolean).join(' · ')}
        actions={(
          <>
            <button type="button" onClick={() => void rename()} className={PILL_SMALL}><Pencil className="h-3.5 w-3.5" /> Rename</button>
            <MergeButton client={client} onMerged={(into) => router.push(dashboardHref(`/clients/${into}`, {}, preview))} />
          </>
        )}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Segmented
            label="Whose work"
            value={person && people.some((entry) => entry.userId === person) ? person : 'all'}
            options={[
              { id: 'all', label: 'Everyone' },
              ...people.map((entry) => ({ id: entry.userId, label: displayName(memberById.get(entry.userId)).split(' ')[0] })),
            ]}
            onChange={(id) => go({ person: id === 'all' ? null : id })}
          />
        </div>
        <PeriodSelect value={period} onChange={(next) => go({ period: next })} />
      </div>

      <div className={cx('mt-4 transition-opacity', switching && 'opacity-60')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SmallStat label="Images" value={formatCount(shown.images)} />
          <SmallStat label="Videos" value={formatCount(shown.videos)} />
          <SmallStat label="≈ Cost" value={rupees(shown.costInr)} />
          <SmallStat label="Credits" value={formatCount(shown.credits)} />
        </div>
        <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
          <GeneratedCard usage={usage} range={period} onRange={(next) => go({ period: next })} onPerson={detail.person ? undefined : (userId) => go({ person: userId })} />
          <SpendCard usage={usage} range={period} onRange={(next) => go({ period: next })} totalLabel={detail.person ? `${names[people.findIndex((entry) => entry.userId === detail.person)] ?? 'Their'} total for ${client.name}` : `Total spent on ${client.name}`} />
        </div>
      </div>

      <div className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-[#0b0b0d] p-1 [scrollbar-width:none]" role="tablist">
        {([['work', 'Work', null], ['projects', 'Projects', detail.projects.length]] as const).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => go({ tab: id })}
            className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors', tab === id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100')}
          >
            {label}
            {count !== null && <span className={cx('text-xs tabular-nums', tab === id ? 'text-zinc-500' : 'text-zinc-600')}>{count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {tab === 'work' && <Gallery client={gallery} account={detail.person} />}
        {tab === 'projects' && (
          <ProjectGrid<ClientProject>
            projects={detail.projects}
            detail={(project) => [
              project.kind === 'video' ? plural(project.videos, 'video') : plural(project.images, 'image'),
              project.costInr ? `≈ ${rupees(project.costInr)}` : null,
              `updated ${timeAgo(project.updatedAt)}`,
            ].filter(Boolean).join(' · ')}
            who={(project) => {
              const member = memberById.get(project.userId);
              return <><MemberAvatar name={member?.name ?? null} email={member?.email ?? '?'} url={member?.avatarUrl ?? null} size="xs" /><span className="truncate">{displayName(member)}</span></>;
            }}
            onOpen={(project) => router.push(project.kind === 'image'
              ? projectViewerHref(project.userId, project.id, preview)
              : dashboardHref(`/accounts/${project.userId}`, { tab: 'projects', project: project.id, kind: 'video' }, preview))}
            empty={detail.person ? 'No projects for this client from this person.' : 'Projects the team makes for this client show up here.'}
          />
        )}
      </div>
    </>
  );
}

/** "Merge into…": this client was really another one; its projects move there and it goes. */
function MergeButton({ client, onMerged }: { client: ClientRef; onMerged: (into: string) => void }) {
  const [open, setOpen] = useState(false);
  const [others, setOthers] = useState<ClientRef[] | null>(null);
  useEffect(() => {
    if (!open || others) return;
    dashboardApi.clients().then((page) => setOthers(page.clients.filter((known) => known.id !== client.id))).catch(() => setOthers([]));
  }, [open, others, client.id]);
  return (
    <ClientPicker
      open={open}
      onOpenChange={setOpen}
      value={null}
      clients={others ?? []}
      onAdd={null}
      noneLabel={null}
      align="end"
      title={others === null ? 'Loading clients…' : `Merge “${client.name}” into…`}
      onPick={async (into) => {
        if (!into) return;
        if (!window.confirm(`Move every project of “${client.name}” to “${into.name}” and remove “${client.name}”?`)) return;
        await dashboardApi.mergeClient(client.id, into.id);
        toast.success(`Merged into ${into.name}`, TOAST);
        onMerged(into.id);
      }}
    >
      <button type="button" className={PILL_SMALL}><GitMerge className="h-3.5 w-3.5" /> Merge into…</button>
    </ClientPicker>
  );
}
