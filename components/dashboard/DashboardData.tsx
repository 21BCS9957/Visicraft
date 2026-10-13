'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dashboardApi } from '@/lib/dashboard/client';
import type { LiveJob, TeamMember } from '@/lib/dashboard/types';
import { jobKey, jobSettled } from './items';
import { failureOf, type Failure } from './parts';

/** How often the dashboard asks what is generating. */
const LIVE_EVERY_MS = 5000;
/** Lists reload at most this often while a run keeps finishing images. */
const SETTLE_EVERY_MS = 15_000;

interface DashboardData {
  members: TeamMember[] | null;
  memberById: Map<string, TeamMember>;
  /** What is generating right now, across the team: runs and videos (null until the first answer). */
  live: LiveJob[] | null;
  liveCheckedAt: string | null;
  liveFailure: Failure | null;
  teamFailure: Failure | null;
  /** Goes up when something live finishes (an image of a run, a video), so lists reload their first page. */
  settledKey: number;
}

const DashboardContext = createContext<DashboardData | null>(null);

/**
 * What every dashboard page shares: the team (asked once) and what is generating now (asked
 * every 5 seconds while the tab is visible, one request at a time, for the sidebar, Overview
 * and Live alike).
 */
export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [teamFailure, setTeamFailure] = useState<Failure | null>(null);
  const [live, setLive] = useState<LiveJob[] | null>(null);
  const [liveCheckedAt, setLiveCheckedAt] = useState<string | null>(null);
  const [liveFailure, setLiveFailure] = useState<Failure | null>(null);
  const [settledKey, setSettledKey] = useState(0);
  const known = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    let active = true;
    dashboardApi.team()
      .then((result) => active && setMembers(result.members))
      .catch((error) => active && setTeamFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let unsettled = false;
    let settledAt = 0;
    const check = async () => {
      // One check at a time: a slow one (it can take several seconds) is not overtaken by the
      // next tick, whose older-looking answer would make a live item seem finished.
      if (running) return;
      running = true;
      try {
        const snapshot = await dashboardApi.live();
        if (stopped) return;
        const progress = new Map(snapshot.jobs.map((job) => [jobKey(job), jobSettled(job)]));
        // Something finished: a job is gone, or a run finished more images. A busy run would
        // reload the lists after every image, so they reload at most every 15 seconds.
        const before = known.current;
        if (before && [...before].some(([key, settled]) => (progress.get(key) ?? Infinity) > settled)) unsettled = true;
        if (unsettled && Date.now() - settledAt >= SETTLE_EVERY_MS) {
          unsettled = false;
          settledAt = Date.now();
          setSettledKey((key) => key + 1);
        }
        known.current = progress;
        setLive(snapshot.jobs);
        setLiveCheckedAt(snapshot.checkedAt);
        setLiveFailure(null);
      } catch (error) {
        if (!stopped) setLiveFailure(failureOf(error));
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, LIVE_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const value = useMemo<DashboardData>(() => ({
    members,
    memberById: new Map((members ?? []).map((member) => [member.id, member])),
    live,
    liveCheckedAt,
    liveFailure,
    teamFailure,
    settledKey,
  }), [members, live, liveCheckedAt, liveFailure, teamFailure, settledKey]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardData {
  const value = useContext(DashboardContext);
  if (!value) throw new Error('useDashboard must be used inside DashboardDataProvider');
  return value;
}
