'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Building2, Check, Clapperboard, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import toast from '@/lib/toast';
import type { ClientRef } from '@/lib/clients';
import { dashboardApi } from '@/lib/dashboard/client';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import type { DashboardClient, DashboardClients, UnsortedProject, UsageRange } from '@/lib/dashboard/types';
import { ClientPicker } from '@/components/playground/ClientPicker';
import { cx, timeAgo } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { People } from './InsightCards';
import { dashboardHref, displayName, EmptyState, failureMessage, failureOf, formatCount, Loading, Message, PageHeader, PANEL, PILL_PRIMARY, PILL_SMALL, type Failure } from './parts';
import { PeriodSelect, plural, rupees } from './UsageCards';

const TOAST = { position: 'top-center' as const };
/** Unsorted projects shown until "Show all". */
const SORT_ROWS = 8;

/**
 * Every client the agency works for, with what was made and spent for each in a period, and the
 * projects that have no client yet, to sort (most of them with a client their name suggests).
 */
export function ClientsPage() {
  return (
    <DashboardShell active="clients">
      <ClientsBody />
    </DashboardShell>
  );
}

function ClientsBody() {
  const { settledKey } = useDashboard();
  const [data, setData] = useState<DashboardClients | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [range, setRange] = useState<UsageRange>('30d');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    dashboardApi.clients()
      .then((next) => {
        if (!active) return;
        setData(next);
        setFailure(null);
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [settledKey, version]);

  // A link to #unsorted (the Overview's "Unsorted" row) scrolls once the list is there.
  const ready = data !== null;
  useEffect(() => {
    if (ready && window.location.hash === '#unsorted') document.getElementById('unsorted')?.scrollIntoView({ block: 'start' });
  }, [ready]);

  const clients = useMemo(() => [...(data?.clients ?? [])].sort((a, b) =>
    b.periods[range].costInr - a.periods[range].costInr
    || b.periods[range].credits - a.periods[range].credits
    || (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '')), [data, range]);

  if (failure && !data) return <Message {...failureMessage(failure)} />;
  if (!data) return <Loading />;
  const refresh = () => setVersion((value) => value + 1);

  return (
    <>
      <PageHeader
        title="Clients"
        description={data.setup ? 'Every project, grouped by the brand it’s for.' : `${plural(data.clients.length, 'client')} · every project grouped by the brand it’s for`}
        actions={!data.setup && <PeriodSelect value={range} onChange={setRange} />}
      />

      {data.setup ? (
        <div className={cx(PANEL, 'p-6')}>
          <p className="text-sm font-medium text-zinc-100">Clients aren’t set up yet</p>
          <p className="mt-1.5 text-sm text-zinc-400">{data.setup}</p>
        </div>
      ) : (
        <>
          {data.unsorted.length > 0 && <SortPanel unsorted={data.unsorted} clients={data.clients} onChanged={refresh} />}
          {clients.length ? (
            <div className={cx('grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4', data.unsorted.length > 0 && 'mt-6')}>
              {clients.map((client) => <ClientCard key={client.id} client={client} range={range} />)}
            </div>
          ) : (
            <div className={cx(PANEL, data.unsorted.length > 0 && 'mt-6')}>
              <EmptyState icon={<Building2 className="h-5 w-5" />} title="No clients yet" body="Sort the projects above, or pick a client when a project is made in the Playground." />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** A cover image, or `icon` (a client's building by default) when there is none. */
function Cover({ url, className, icon = <Building2 className="h-6 w-6" /> }: { url: string | null; className?: string; icon?: ReactNode }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cx('flex items-center justify-center overflow-hidden bg-zinc-900 text-zinc-700', className)}>
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : icon}
    </div>
  );
}

function ClientCard({ client, range }: { client: DashboardClient; range: UsageRange }) {
  const preview = useDashboardPreview();
  const period = client.periods[range];
  const made = [period.images ? plural(period.images, 'image') : null, period.videos ? plural(period.videos, 'video') : null].filter(Boolean).join(' · ');
  return (
    <Link href={dashboardHref(`/clients/${client.id}`, {}, preview)} className={cx(PANEL, 'group flex min-w-0 flex-col overflow-hidden transition-colors hover:border-white/15')}>
      <Cover url={client.coverUrl} className="aspect-[16/9] transition-transform duration-500 group-hover:scale-[1.02]" />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="truncate text-[17px] font-semibold tracking-tight text-zinc-50">{client.name}</h2>
          <People userIds={client.userIds} />
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {plural(client.projectCount, 'project')}{client.lastActiveAt ? ` · active ${timeAgo(client.lastActiveAt)}` : ''}
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">≈ {rupees(period.costInr)}</p>
          <p className="shrink-0 pb-0.5 text-right text-[11px] tabular-nums text-zinc-500">{made || 'Nothing made'}<br />{formatCount(period.credits)} credits</p>
        </div>
      </div>
    </Link>
  );
}

/** The projects without a client: accept the suggested clients at once, or pick one per project. */
function SortPanel({ unsorted, clients, onChanged }: { unsorted: UnsortedProject[]; clients: ClientRef[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const suggested = unsorted.filter((project) => project.suggestion);
  const shown = all ? unsorted : unsorted.slice(0, SORT_ROWS);
  const newClients = new Set(suggested.filter((project) => !project.suggestion!.clientId).map((project) => project.suggestion!.name)).size;

  const acceptAll = async () => {
    setBusy(true);
    try {
      await dashboardApi.sortProjects(suggested.map((project) => (project.suggestion!.clientId
        ? { projectId: project.id, clientId: project.suggestion!.clientId }
        : { projectId: project.id, newClient: project.suggestion!.name })));
      toast.success(`${plural(suggested.length, 'project')} sorted`, TOAST);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sort the projects', TOAST);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="unsorted" className={cx(PANEL, 'scroll-mt-20 p-4 sm:p-5')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-zinc-50">Sort into clients</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {plural(unsorted.length, 'project')} {unsorted.length === 1 ? 'has' : 'have'} no client yet; {unsorted.length === 1 ? 'its' : 'their'} spend shows as “Unsorted”.
            {suggested.length > 0 && ` ${suggested.length} can be told from the name.`}
          </p>
        </div>
        {suggested.length > 0 && (
          <button type="button" onClick={() => void acceptAll()} disabled={busy} className={cx(PILL_PRIMARY, 'disabled:opacity-60')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Accept {suggested.length} suggestion{suggested.length === 1 ? '' : 's'}{newClients ? ` · ${plural(newClients, 'new client')}` : ''}
          </button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {shown.map((project) => <UnsortedRow key={project.id} project={project} clients={clients} disabled={busy} onChanged={onChanged} />)}
      </ul>
      {unsorted.length > SORT_ROWS && (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-2 rounded-full px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100">
          {all ? 'Show less' : `Show all ${unsorted.length}`}
        </button>
      )}
    </section>
  );
}

function UnsortedRow({ project, clients, disabled, onChanged }: { project: UnsortedProject; clients: ClientRef[]; disabled: boolean; onChanged: () => void }) {
  const { memberById } = useDashboard();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const suggestion = project.suggestion;
  const who = project.ownerAccount ? 'Your account' : displayName(memberById.get(project.userId));
  const made = [project.images ? plural(project.images, 'image') : null, project.videos ? plural(project.videos, 'video') : null].filter(Boolean).join(' · ');

  const assign = async (clientId: string | null, newClient?: string) => {
    setSaving(true);
    try {
      if (clientId) await dashboardApi.setProjectClient(project.id, clientId);
      else await dashboardApi.sortProjects([{ projectId: project.id, newClient }]);
      onChanged();
    } catch (error) {
      setSaving(false);
      throw error;
    }
  };

  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
          <Cover url={project.coverUrl} className="h-full w-full" icon={project.kind === 'video' ? <Clapperboard className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />} />
          {project.coverUrl && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 p-0.5 text-white/80">
              {project.kind === 'video' ? <Clapperboard className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-zinc-100">{project.name}</span>
          <span className="block truncate text-[11px] text-zinc-500">
            {who}{made ? ` · ${made}` : ''}{project.costInr ? ` · ≈ ${rupees(project.costInr)}` : ''} · {timeAgo(project.updatedAt)}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-14 sm:pl-0">
        {saving && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
        {suggestion && (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void assign(suggestion.clientId, suggestion.name).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not sort the project', TOAST))}
            title={suggestion.clientId ? `Put it under ${suggestion.name}` : `Add ${suggestion.name} as a client and put it there`}
            className={cx(PILL_SMALL, 'max-w-[200px] border-[#fff05a]/30 text-[#fff05a] hover:bg-[#fff05a]/[0.08] disabled:opacity-60')}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{suggestion.name}</span>
            {!suggestion.clientId && <span className="shrink-0 text-[10px] text-[#fff05a]/60">new</span>}
          </button>
        )}
        <ClientPicker
          open={open}
          onOpenChange={setOpen}
          value={null}
          clients={clients}
          onAdd={async (name) => (await dashboardApi.createClient(name)).client}
          noneLabel={null}
          title={`Which client is “${project.name}” for?`}
          align="end"
          onPick={(client) => (client ? assign(client.id) : undefined)}
        >
          <button type="button" disabled={disabled || saving} className={cx(PILL_SMALL, 'disabled:opacity-60')}>{suggestion ? 'Other…' : 'Pick client'}</button>
        </ClientPicker>
      </div>
    </li>
  );
}
