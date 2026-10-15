'use client';

import { useState, type ReactNode } from 'react';
import type { ClientSpend, DashboardInsights, ModelScore, UsageRange } from '@/lib/dashboard/types';
import { cx } from '@/components/playground/ui';
import { useDashboard } from './DashboardData';
import { displayName, formatCount, MemberAvatar } from './parts';
import { GROUP_COLORS, plural, rupees, ShowAll, UsageCard } from './UsageCards';

/** Clients a card shows until it is expanded. */
const CLIENT_ROWS = 5;
/** A model needs this many Playground images before its rates can be called the best. */
const MIN_FOR_BEST = 20;
/** Rows that gather work outside a named project, shown quieter. */
const UNNAMED = new Set(['No project', 'Deleted project']);

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

function People({ userIds }: { userIds: string[] }) {
  const { memberById } = useDashboard();
  if (!userIds.length) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-label={userIds.map((id) => displayName(memberById.get(id))).join(', ')}>
      {userIds.slice(0, 3).map((id) => {
        const member = memberById.get(id);
        return <MemberAvatar key={id} name={member?.name ?? null} email={member?.email ?? '?'} url={member?.avatarUrl ?? null} size="xs" />;
      })}
    </span>
  );
}

function ClientRow({ client, most }: { client: ClientSpend; most: number }) {
  const unnamed = UNNAMED.has(client.name);
  const made = [client.images ? plural(client.images, 'image') : null, client.videos ? plural(client.videos, 'video') : null].filter(Boolean).join(' · ');
  const projects = client.projects.length > 1 ? `${client.projects.length} projects` : null;
  return (
    <li title={client.projects.length > 1 ? client.projects.join(', ') : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cx('truncate text-[13px]', unnamed ? 'text-zinc-400' : 'text-zinc-100')}>{client.name}</span>
          <People userIds={client.userIds} />
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-zinc-100">≈ {rupees(client.costInr)}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-zinc-400" style={{ width: `${Math.max(1.5, (client.costInr / most) * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[11px] tabular-nums text-zinc-500">
        <span className="truncate">{[projects, made].filter(Boolean).join(' · ') || '—'}</span>
        <span className="shrink-0">{formatCount(client.credits)} cr</span>
      </div>
    </li>
  );
}

/** Spend per client for a period: each client's projects together, most spent first. */
export function ClientSpendCard({ insights, className }: { insights: DashboardInsights; className?: string }) {
  const [range, setRange] = useState<UsageRange>('30d');
  const [open, setOpen] = useState(false);
  const clients = insights.clients[range];
  const shown = open ? clients : clients.slice(0, CLIENT_ROWS);
  const total = clients.reduce((sum, client) => sum + client.costInr, 0);
  const most = Math.max(1, ...clients.map((client) => client.costInr));
  const named = clients.filter((client) => !UNNAMED.has(client.name)).length;
  return (
    <UsageCard title="Cost per client" period={range} onPeriod={setRange} className={className}>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">≈ {rupees(total)}</p>
        <p className="shrink-0 text-[11px] text-zinc-500">{plural(named, 'client')}</p>
      </div>
      {shown.length ? (
        <ul className="mt-3.5 space-y-3" aria-label="Spend per client, most spent first">
          {shown.map((client) => <ClientRow key={client.key} client={client} most={most} />)}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Nothing spent in this period.</p>
      )}
      <ShowAll open={open} total={clients.length} noun="clients" rows={CLIENT_ROWS} onToggle={() => setOpen((value) => !value)} />
      <p className="mt-auto pt-3 text-[11px] leading-snug text-zinc-500">Projects that start with the same name count as one client. “No project” is work from the older tools.</p>
    </UsageCard>
  );
}

/** What was spent on Playground images that were deleted afterwards, and how many failed (refunded). */
export function WasteCard({ insights, className }: { insights: DashboardInsights; className?: string }) {
  const [range, setRange] = useState<UsageRange>('30d');
  const [open, setOpen] = useState(false);
  const { memberById } = useDashboard();
  const waste = insights.waste[range];
  const share = percent(waste.deletedCostInr, waste.imageCostInr);
  const shown = open ? waste.members : waste.members.slice(0, 3);
  return (
    <UsageCard title="Wasted spend" period={range} onPeriod={setRange} className={className}>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">≈ {rupees(waste.deletedCostInr)}</p>
        <p className="shrink-0 text-right text-[11px] leading-snug text-zinc-500">
          {plural(waste.deleted, 'image')} deleted<br />after they were made
        </p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/[0.06]" role="img" aria-label={`${share ?? 0}% of image spend was on images deleted later`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(share ? 1.5 : 0, share ?? 0))}%`, background: '#e66767' }} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        <span className="tabular-nums text-zinc-200">{share ?? 0}%</span> of what images cost ({rupees(waste.imageCostInr)})
        <span className="text-zinc-600"> · </span>
        <span className="tabular-nums text-zinc-200">{formatCount(waste.failed)}</span> failed, refunded and free
      </p>
      {shown.length ? (
        <ul className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.06]" aria-label="Deleted images per account">
          {shown.map((member) => {
            const known = memberById.get(member.userId);
            return (
              <li key={member.userId} className="flex items-center gap-2.5 py-2">
                <MemberAvatar name={known?.name ?? null} email={known?.email ?? '?'} url={known?.avatarUrl ?? null} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-zinc-100">{displayName(known)}</p>
                  <p className="truncate text-[11px] tabular-nums text-zinc-500">
                    {formatCount(member.deleted)} of {formatCount(member.made)} deleted ({percent(member.deleted, member.made)}%)
                  </p>
                </div>
                <p className="shrink-0 text-[13px] tabular-nums text-zinc-100">≈ {rupees(member.deletedCostInr)}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">{waste.made ? 'Nothing the team made in this period was deleted.' : 'No Playground images in this period.'}</p>
      )}
      <ShowAll open={open} total={waste.members.length} noun="people" onToggle={() => setOpen((value) => !value)} />
    </UsageCard>
  );
}

type Metric = 'cost' | 'kept' | 'failed' | 'time';

/** The model with the best value of a metric, among models with enough images to judge. */
function bestOf(scores: ModelScore[], metric: Metric): string | null {
  const judged = scores.filter((score) => score.tracked >= MIN_FOR_BEST);
  if (judged.length < 2) return null;
  const value = (score: ModelScore): number | null => {
    if (metric === 'cost') return score.costPerImageInr;
    if (metric === 'kept') return score.tracked ? -(score.tracked - score.deleted) / score.tracked : null;
    if (metric === 'failed') return score.tracked + score.failed ? score.failed / (score.tracked + score.failed) : null;
    return score.avgSeconds;
  };
  let best: ModelScore | null = null;
  for (const score of judged) {
    const v = value(score);
    if (v === null) continue;
    const current = best ? value(best) : null;
    if (current === null || v < current) best = score;
  }
  return best?.key ?? null;
}

function Cell({ best, children, className }: { best: boolean; children: ReactNode; className?: string }) {
  return (
    <td className={cx('whitespace-nowrap py-2.5 text-right tabular-nums', className ?? 'px-3', best ? 'font-semibold text-zinc-50' : 'text-zinc-400')}>
      {children}
      {best && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#fff05a] align-middle" aria-label="best" title="Best of the models with 20+ images" />}
    </td>
  );
}

/** Per image model: cost per image, how many are kept, favourited and failed, and how long one takes. */
export function ModelScorecard({ insights, className }: { insights: DashboardInsights; className?: string }) {
  const [range, setRange] = useState<UsageRange>('30d');
  const scores = insights.scorecard[range];
  const best: Record<Metric, string | null> = {
    cost: bestOf(scores, 'cost'),
    kept: bestOf(scores, 'kept'),
    failed: bestOf(scores, 'failed'),
    time: bestOf(scores, 'time'),
  };
  return (
    <UsageCard title="Model scorecard" period={range} onPeriod={setRange} className={className}>
      {scores.length ? (
        <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[620px] text-[13px]">
            <caption className="sr-only">Image models compared: images, rupees per image, kept, favourited, failed and time per image</caption>
            <thead>
              <tr className="whitespace-nowrap border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-zinc-500">
                <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">Model</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Images</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">₹ per image</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kept</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Favourited</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Failed</th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Time each</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {scores.map((score) => {
                const kept = percent(score.tracked - score.deleted, score.tracked);
                const failed = percent(score.failed, score.tracked + score.failed);
                return (
                  <tr key={score.key}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal sm:px-5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_COLORS[score.group] }} />
                        <span className="truncate text-zinc-100">{score.name}</span>
                        <span className="shrink-0 text-[11px] text-zinc-500">{score.maker}</span>
                      </span>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-300">{formatCount(score.images)}</td>
                    <Cell best={best.cost === score.key}>₹{score.costPerImageInr.toFixed(2)}</Cell>
                    <Cell best={best.kept === score.key}>{kept === null ? '—' : `${kept}%`}</Cell>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-400">{score.tracked ? formatCount(score.favorites) : '—'}</td>
                    <Cell best={best.failed === score.key}>{failed === null ? '—' : `${failed}%`}</Cell>
                    <Cell best={best.time === score.key} className="px-4 sm:px-5">{score.avgSeconds === null ? '—' : `${score.avgSeconds} s`}</Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">No images in this period.</p>
      )}
      <p className="mt-3 text-[11px] leading-snug text-zinc-500">
        Kept, favourited, failed and time come from Playground images. A yellow dot marks the best of the models with 20 or more.
      </p>
    </UsageCard>
  );
}

/** The insight cards as one block: clients and waste side by side, the scorecard under them. */
export function InsightCards({ insights }: { insights: DashboardInsights }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <ClientSpendCard insights={insights} />
        <WasteCard insights={insights} />
      </div>
      <ModelScorecard insights={insights} className="mt-3 sm:mt-4" />
    </>
  );
}
