'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Grid2x2, PanelLeftClose, PanelLeftOpen, Sparkles, User } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { PlaygroundApiError, playgroundApi } from '@/lib/playground/api';
import { cachedBundle, fetchBundle, rememberBundle } from '@/lib/playground/cache';
import { previewBundle, PREVIEW_PROJECT_ID } from '@/lib/playground/preview';
import { isRunnerBusy, setRunnerListener } from '@/lib/playground/runner';
import { usePlaygroundStore } from '@/lib/playground/store';
import { Composer } from './Composer';
import { usePreviewFlag, useStoredNumber } from './hooks';
import { Gallery } from './Gallery';
import { Lightbox } from './Lightbox';
import { ReferencePanel } from './ReferencePanel';
import { cx } from './ui';

const TOAST = { position: 'top-center' as const };
const DENSITY_KEY = 'visicraft:playgroundDensity';

function ProjectName() {
  const project = usePlaygroundStore((state) => state.project);
  if (!project) return null;
  return <ProjectNameInput key={`${project.id}:${project.name}`} initial={project.name} />;
}

function ProjectNameInput({ initial }: { initial: string }) {
  const setProject = usePlaygroundStore((state) => state.setProject);
  const preview = usePlaygroundStore((state) => state.preview);
  const [name, setName] = useState(initial);

  const save = async () => {
    const project = usePlaygroundStore.getState().project;
    const next = name.trim();
    if (!project) return;
    if (!next || next === project.name) return setName(project.name);
    setProject({ ...project, name: next });
    if (preview) return;
    try {
      setProject((await playgroundApi.updateProject(project.id, { name: next })).project);
    } catch (error) {
      setProject(project);
      toast.error(error instanceof Error ? error.message : 'Could not rename the project', TOAST);
    }
  };

  return (
    <input
      value={name}
      maxLength={120}
      onChange={(event) => setName(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      aria-label="Project name"
      className="w-full min-w-0 max-w-[420px] truncate rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-white outline-none transition-colors hover:border-white/10 focus:border-white/15 focus:bg-white/[0.04]"
    />
  );
}

function Topbar({ density, onDensity, panelOpen, onTogglePanel }: {
  density: number;
  onDensity: (value: number) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { user } = useAuth();
  const { credits } = useCredits();
  const preview = usePlaygroundStore((state) => state.preview);
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0a0a0d]/90 px-3 backdrop-blur-xl sm:px-4">
      <Link href="/" title="Visicraft home" className="flex shrink-0 items-center rounded-full p-1 hover:bg-white/7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/new-section/logo.png" alt="Visicraft" className="h-7 w-7 object-contain" />
      </Link>
      <Link href={`/playground${preview ? '?previewPlayground=1' : ''}`} className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm text-white/55 hover:bg-white/7 hover:text-white sm:flex">
        <ChevronLeft className="h-4 w-4" /> Playground
      </Link>
      <span className="hidden text-white/20 sm:inline">/</span>
      <ProjectName />
      <button
        type="button"
        onClick={onTogglePanel}
        title={panelOpen ? 'Hide project context' : 'Show project context'}
        aria-label={panelOpen ? 'Hide project context' : 'Show project context'}
        className="ml-1 hidden shrink-0 rounded-full p-2 text-white/55 hover:bg-white/7 hover:text-white lg:inline-flex"
      >
        {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <label className="hidden items-center gap-2 text-white/45 md:flex" title="Image size in the grid">
          <Grid2x2 className="h-4 w-4" />
          <input
            type="range"
            min={150}
            max={420}
            step={10}
            value={density}
            onChange={(event) => onDensity(Number(event.target.value))}
            className="h-1 w-24 cursor-pointer accent-[#fff05a]"
            aria-label="Grid size"
          />
        </label>
        <Link href="/pricing" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10" title="Credits">
          <Sparkles className="h-4 w-4 text-[#fff05a]" />
          {user || preview ? credits.toLocaleString('en-IN') : 0}
        </Link>
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/[0.07] text-white">
          {user?.user_metadata?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.user_metadata.avatar_url} alt="Account" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </div>
      </div>
    </header>
  );
}

function Message({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h2 className="text-xl font-light text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{text}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function PlaygroundWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { refreshCredits } = useCredits();
  const reset = usePlaygroundStore((state) => state.reset);
  const loadBundle = usePlaygroundStore((state) => state.loadBundle);
  const mergeBundle = usePlaygroundStore((state) => state.mergeBundle);
  const project = usePlaygroundStore((state) => state.project);
  const previewFlag = usePreviewFlag();
  const preview = previewFlag && projectId === PREVIEW_PROJECT_ID;
  const [failure, setFailure] = useState<{ projectId: string; message: string } | null>(null);
  const [density, setDensity] = useStoredNumber(DENSITY_KEY, 240, 150, 420);
  const [panelOpen, setPanelOpen] = useState(true);
  const [composerHeight, setComposerHeight] = useState(180);

  useEffect(() => {
    setRunnerListener({
      onCreditsChanged: () => void refreshCredits(),
      onPaused: (message) => toast.error(message, { ...TOAST, duration: 6000 }),
    });
    return () => setRunnerListener({});
  }, [refreshCredits]);

  useEffect(() => {
    if (preview) {
      reset(projectId, true);
      loadBundle(previewBundle());
      return;
    }
    if (authLoading || !user) return;
    let cancelled = false;
    reset(projectId, false);
    // Shown at once when this visit already loaded it; the fresh copy then merges in.
    const cached = cachedBundle(projectId);
    if (cached) loadBundle(cached);
    fetchBundle(projectId)
      .then((bundle) => {
        if (cancelled) return;
        // A video project opens in the Video Studio.
        if (bundle.project.kind === 'video') {
          router.replace(`/playground/video/${projectId}`);
          return;
        }
        if (cached) mergeBundle(bundle);
        else loadBundle(bundle);
        if (bundle.refunded > 0) {
          toast.success(`${bundle.refunded} credits were refunded for images that were stopped.`, TOAST);
          void refreshCredits();
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        const message = caught instanceof PlaygroundApiError || caught instanceof Error ? caught.message : 'Could not open the project.';
        if (cached) toast.error(message, TOAST);
        else setFailure({ projectId, message });
      });
    return () => {
      cancelled = true;
      // Remember what's on screen (new runs, deletions) for the next visit.
      const state = usePlaygroundStore.getState();
      if (state.projectId === projectId && state.project) {
        rememberBundle(projectId, {
          project: state.project,
          references: state.references,
          runs: state.runs,
          items: Object.values(state.items),
          nextBefore: state.nextBefore,
          refunded: 0,
        });
      }
    };
    // The user id, not the user object, decides whether to reload.
  }, [projectId, preview, user?.id, authLoading, reset, loadBundle, mergeBundle]); // eslint-disable-line react-hooks/exhaustive-deps

  const error = failure?.projectId === projectId ? failure.message : null;
  const status: 'loading' | 'ready' | 'signin' | 'error' = !preview && !authLoading && !user
    ? 'signin'
    : error
      ? 'error'
      : project?.id === projectId
        ? 'ready'
        : 'loading';

  // Leaving mid-run pauses it; say so before the tab closes.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isRunnerBusy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const onHeight = useCallback((height: number) => setComposerHeight(height), []);

  return (
    <div className="flex h-dvh flex-col bg-[#08080a] text-white">
      <Topbar density={density} onDensity={setDensity} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((open) => !open)} />
      {status === 'loading' && (
        <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Opening the project">
          <div className="hidden w-[320px] shrink-0 space-y-4 border-r border-white/8 bg-[#0c0c0f]/80 p-4 lg:block">
            <div className="h-4 w-32 rounded bg-white/8" />
            <div className="h-24 rounded-xl border border-dashed border-white/10" />
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
      )}
      {status === 'signin' && (
        <Message
          title="Sign in to use the Playground"
          text="Projects, references and images are saved to your account."
          action={<Link href={`/login?redirectTo=/playground/${projectId}`} className="rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">Sign in</Link>}
        />
      )}
      {status === 'error' && (
        <Message
          title="The project couldn't be opened"
          text={error ?? ""}
          action={<Link href="/playground" className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white hover:bg-white/8">Back to projects</Link>}
        />
      )}
      {status === 'ready' && project && (
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
              <Gallery density={density} bottomPadding={composerHeight + 24} />
            </div>
            <Composer onHeight={onHeight} />
          </main>
        </div>
      )}
      <Lightbox />
    </div>
  );
}
