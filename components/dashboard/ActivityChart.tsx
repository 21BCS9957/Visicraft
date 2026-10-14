'use client';

import { useState } from 'react';
import type { ActivityDay } from '@/lib/dashboard/types';
import { cx } from '@/components/playground/ui';
import { formatCount, Panel, Segmented } from './parts';

/*
 * The last 7 days as rounded pill columns on dark tracks: past days in gray, today in the brand
 * yellow (emphasis on one point). One series at a time (images and videos differ
 * ~10×, so they never share an axis). The value shows in a bubble on the peak, or on the
 * column pointed at or focused; a table carries every value for screen readers.
 */

type Series = 'images' | 'videos';

const LONG = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
const LETTER = new Intl.DateTimeFormat('en-IN', { weekday: 'narrow' });
const asDate = (date: string) => new Date(`${date}T00:00:00`);

export function ActivityChart({ days, className }: { days: ActivityDay[]; className?: string }) {
  const [series, setSeries] = useState<Series>('images');
  const [active, setActive] = useState<number | null>(null);
  const week = days.slice(-7);
  const values = week.map((day) => day[series]);
  const max = Math.max(0, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const shown = active ?? peak;
  const noun = series === 'images' ? 'image' : 'video';
  const plural = (count: number) => `${noun}${count === 1 ? '' : 's'}`;

  return (
    <Panel
      title="Activity"
      description={`${formatCount(total)} ${plural(total)} made in the last 7 days`}
      action={<Segmented size="sm" label="Series" value={series} onChange={setSeries} options={[{ id: 'images', label: 'Images' }, { id: 'videos', label: 'Videos' }]} />}
      className={className}
    >
      <div className="relative">
        <div className="flex h-[220px] items-end gap-2 pt-10 sm:gap-3" onMouseLeave={() => setActive(null)}>
          {week.map((day, index) => {
            const value = values[index];
            const today = index === week.length - 1;
            const share = max ? value / max : 0;
            return (
              <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2.5">
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${today ? 'Today' : LONG.format(asDate(day.date))}: ${formatCount(value)} ${plural(value)}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="relative flex w-full max-w-[44px] flex-1 items-end rounded-full bg-[#1b1b1f] outline-none focus-visible:ring-2 focus-visible:ring-[#fff05a]/60"
                >
                  {value > 0 && (
                    <div
                      className={cx('w-full rounded-full transition-colors', today ? 'bg-[#fff05a]' : active === index ? 'bg-zinc-400' : 'bg-zinc-600')}
                      style={{ height: `max(${Math.round(share * 100)}%, 10px)` }}
                    />
                  )}
                  {shown === index && (
                    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-900">
                      {formatCount(value)}
                    </span>
                  )}
                </div>
                <span className={cx('text-xs', today ? 'font-medium text-zinc-100' : 'text-zinc-500')}>{today ? 'Today' : LETTER.format(asDate(day.date))}</span>
              </div>
            );
          })}
        </div>
        {total === 0 && <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-zinc-500">No {noun}s made in the last 7 days</p>}
      </div>
      <table className="sr-only">
        <caption>Images and videos made per day, last 7 days</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Images</th><th scope="col">Videos</th></tr></thead>
        <tbody>
          {week.map((day) => <tr key={day.date}><th scope="row">{LONG.format(asDate(day.date))}</th><td>{day.images}</td><td>{day.videos}</td></tr>)}
        </tbody>
      </table>
    </Panel>
  );
}
