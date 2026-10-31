'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Eye, Grid2x2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import { useDashboardPreview } from '@/lib/dashboard/preview';
import type { TeamMember } from '@/lib/dashboard/types';
import { usePlaygroundStore } from '@/lib/playground/store';
import { Gallery } from '@/components/playground/Gallery';
import { useStoredNumber } from '@/components/playground/hooks';
import { Lightbox } from '@/components/playground/Lightbox';
import { ReferencePanel } from '@/components/playground/ReferencePanel';
import { cx } from '@/components/playground/ui';
import { DashboardGate } from './DashboardShell';
import { dashboardHref, displayName, failureMessage, failureOf, type Failure } from './parts';

const DENSITY_KEY = 'visicraft:playgroundDensity';

/**
 * A team member's image project as they see it in the Playground (references with their on/off
 * switches, guidelines, every run and image), view only for the owner: no Composer, no actions
 * but download, and the Playground's API client refuses every write while it is open.
 */
export function ProjectViewer({ userId, projectId }: { userId: string; projectId: string }) {
  return (
    <DashboardGate>
      <Viewer userId={userId} projectId={projectId} />
    </DashboardGate>
  );
}

function Viewer({ userId, projectId }: { userId: string; projectId: string }) {
  const router = useRouter();
  const preview = useDashboardPreview();
  const reset = usePlaygroundStore((state) => state.reset);
  const loadBundle = usePlaygroundStore((state) => state.loadBundle);
  const project = usePlaygroundStore((state) => state.project);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [density, setDensity] = useStoredNumber(DENSITY_KEY, 240, 150, 420);
  const [panelOpen, setPanelOpen] = useState(true);
  const back = dashboardHref(`/accounts/${userId}`, { tab: 'projects' }, preview);

  useEffect(() => {
    let active = true;
    // View only from the first render to the last: writes are refused and nothing is sent.
    reset(projectId, false, { viewOnly: true, olderRuns: (before) => dashboardApi.project(userId, projectId, before) });
    dashboardApi.project(userId, projectId)
      .then((bundle) => {
        if (!active) return;
        // A video project keeps the dashboard's video view.
        if (bundle.project.kind === 'video') {
          router.replace(dashboardHref(`/accounts/${userId}`, { tab: 'projects', project: projectId, kind: 'video' }, preview));
          return;
        }
        setMember(bundle.member);
        loadBundle(bundle);
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
      reset(null);
    };
  }, [userId, projectId, preview, reset, loadBundle, router]);

  const ready = project !== null && member !== null;
  const who = member ? displayName(member) : 'Team member';

  return (
    <div className="flex h-dvh flex-col bg-[#08080a] text-white">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0a0a0d]/90 px-3 backdrop-blur-xl sm:px-4">
        <Link href={back} className="flex min-w-0 shrink items-center gap-1 rounded-full px-2 py-1 text-sm text-white/55 hover:bg-white/7 hover:text-white">
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{member ? `${who}’s projects` : 'Projects'}</span>
        </Link>
        {project && (
          <>
            <span className="hidden text-white/20 sm:inline">/</span>
            <span className="hidden min-w-0 truncate text-sm text-white sm:block">{project.name}</span>
          </>
        )}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#fff05a]/30 bg-[#fff05a]/10 px-2 py-0.5 text-[11px] font-medium text-[#fff05a]">
          <Eye className="h-3 w-3" /> View only
        </span>
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          title={panelOpen ? 'Hide project context' : 'Show project context'}
          aria-label={panelOpen ? 'Hide project context' : 'Show project context'}
          className="ml-1 hidden shrink-0 rounded-full p-2 text-white/55 hover:bg-white/7 hover:text-white lg:inline-flex"
        >
          {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <label className="ml-auto hidden items-center gap-2 text-white/45 md:flex" title="Image size in the grid">
          <Grid2x2 className="h-4 w-4" />
          <input type="range" min={150} max={420} step={10} value={density} onChange={(event) => setDensity(Number(event.target.value))} className="h-1 w-24 cursor-pointer accent-[#fff05a]" aria-label="Grid size" />
        </label>
      </header>

      {failure ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="text-xl font-light text-white">{failureMessage(failure).title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{failureMessage(failure).body}</p>
            <Link href={back} className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm text-white hover:bg-white/8">Back to projects</Link>
          </div>
        </div>
      ) : !ready ? (
        <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Opening the project">
          <div className="hidden w-[320px] shrink-0 space-y-4 border-r border-white/8 bg-[#0c0c0f]/80 p-4 lg:block">
            <div className="h-4 w-32 rounded bg-white/8" />
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="playground-shimmer aspect-square rounded-xl bg-white/[0.04]" />)}</div>
            <div className="h-32 rounded-xl bg-white/[0.03]" />
          </div>
          <div className="min-w-0 flex-1 space-y-4 px-6 pt-5">
            <div className="h-4 w-72 rounded bg-white/8" />
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${density}px, 1fr))` }}>
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="playground-shimmer aspect-[4/5] rounded-2xl border border-white/6 bg-white/[0.03]" />)}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={cx('hidden min-h-0 shrink-0 lg:block', panelOpen ? 'w-[320px]' : 'w-0 overflow-hidden')}>
            <ReferencePanel />
          </div>
          <main className="relative min-w-0 flex-1">
            <div className="h-full overflow-y-auto">
              <div className="border-b border-white/6 lg:hidden">
                <details>
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm text-white/70">Project context · references and guidelines</summary>
                  <div className="max-h-[60vh] overflow-y-auto"><ReferencePanel /></div>
                </details>
              </div>
              <Gallery density={density} bottomPadding={48} />
            </div>
          </main>
        </div>
      )}
      <Lightbox />
    </div>
  );
}
