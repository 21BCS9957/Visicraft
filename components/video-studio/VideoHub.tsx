'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clapperboard, FolderPlus, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { playgroundApi } from '@/lib/playground/api';
import type { PlaygroundProjectSummary } from '@/lib/playground/types';
import { isVideoPreviewRequested, PREVIEW_VIDEO_PROJECT_ID, previewVideoProjects } from '@/lib/video/preview';
import { PlaygroundTabs } from '@/components/playground/PlaygroundTabs';
import { Popover, PopoverClose, timeAgo } from '@/components/playground/ui';

const TOAST = { position: 'top-center' as const };

const noSubscribe = () => () => {};
function useVideoPreview(): boolean {
  return useSyncExternalStore(noSubscribe, isVideoPreviewRequested, () => false);
}

function defaultName(): string {
  return `Video · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

function ProjectCard({ project, href, onRename, onDelete }: {
  project: PlaygroundProjectSummary;
  href: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const count = project.videoCount ?? 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-white/15">
      <Link href={href} className="block">
        <div className="aspect-[4/3] overflow-hidden bg-[#111115]">
          {project.coverUrl && !coverFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center"><Clapperboard className="h-8 w-8 text-white/15" /></div>
          )}
        </div>
        <div className="px-3.5 py-3 pr-11">
          <h3 className="truncate text-sm font-medium text-white">{project.name}</h3>
          <p className="mt-0.5 truncate text-[11px] text-white/45">
            {count} video{count === 1 ? '' : 's'} · {timeAgo(project.updatedAt)}
          </p>
        </div>
      </Link>
      <div className="absolute bottom-2.5 right-2">
        <Popover
          side="bottom"
          align="end"
          className="w-44"
          trigger={
            <button type="button" aria-label="Project actions" className="rounded-full !p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          <PopoverClose asChild>
            <button type="button" onClick={onRename} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8">
              <Pencil className="h-4 w-4" /> Rename
            </button>
          </PopoverClose>
          <PopoverClose asChild>
            <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/10">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </PopoverClose>
        </Popover>
      </div>
    </div>
  );
}

/**
 * The Videos hub: the user's video projects. Each opens the Video Studio for that project,
 * which keeps its product, guidelines and videos. `?url=` (from Home's "Make a video
 * instead") starts a new project with that product link.
 */
export function VideoHub() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const preview = useVideoPreview();
  const handedUrl = useSearchParams().get('url');
  const [loaded, setLoaded] = useState<PlaygroundProjectSummary[] | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const handedOver = useRef(false);
  const projects = loaded ?? (preview ? previewVideoProjects() : null);
  const setProjects = (update: (list: PlaygroundProjectSummary[] | null) => PlaygroundProjectSummary[] | null) => setLoaded(update(projects));
  const signedOut = !preview && !authLoading && !user;

  const hrefFor = (id: string, url?: string | null) => {
    const params = new URLSearchParams();
    if (preview) params.set('previewVideoStudio', '1');
    if (url) params.set('url', url);
    const query = params.toString();
    return `/playground/video/${preview ? PREVIEW_VIDEO_PROJECT_ID : id}${query ? `?${query}` : ''}`;
  };

  const create = async (url?: string | null) => {
    if (preview) return router.push(hrefFor(PREVIEW_VIDEO_PROJECT_ID, url));
    setCreating(true);
    try {
      const { project } = await playgroundApi.createProject(defaultName(), 'video');
      router.push(hrefFor(project.id, url));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not create the project', TOAST);
      setCreating(false);
    }
  };

  useEffect(() => {
    if (preview || authLoading || !user) return;
    playgroundApi.listProjects('video')
      .then(({ projects: list, setup: needsSetup }) => {
        setLoaded(list);
        setSetup(needsSetup ?? null);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load your video projects.'));
  }, [preview, authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A product link from Home becomes a new project, opened with the link fetched.
  useEffect(() => {
    if (!handedUrl || handedOver.current || (!preview && (authLoading || !user))) return;
    handedOver.current = true;
    const timer = window.setTimeout(() => void create(handedUrl), 0);
    return () => window.clearTimeout(timer);
  }, [handedUrl, preview, authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async (project: PlaygroundProjectSummary) => {
    const name = window.prompt('Project name', project.name)?.trim();
    if (!name || name === project.name) return;
    setProjects((list) => list?.map((known) => (known.id === project.id ? { ...known, name } : known)) ?? list);
    if (preview) return;
    try {
      await playgroundApi.updateProject(project.id, { name });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not rename the project', TOAST);
    }
  };

  const remove = async (project: PlaygroundProjectSummary) => {
    const count = project.videoCount ?? 0;
    if (!window.confirm(`Delete "${project.name}"${count ? ` and its ${count} video${count === 1 ? '' : 's'}` : ''}? This cannot be undone.`)) return;
    try {
      if (!preview) await playgroundApi.deleteProject(project.id);
      setProjects((list) => list?.filter((known) => known.id !== project.id) ?? list);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not delete the project', TOAST);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(188,168,255,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl">Video Studio</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
              Each project keeps your product, guidelines and videos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlaygroundTabs active="videos" preview={preview} />
            {!signedOut && (
              <button type="button" onClick={() => void create()} disabled={creating || Boolean(setup)} className="inline-flex items-center gap-2 rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white disabled:opacity-60">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} New project
              </button>
            )}
          </div>
        </div>

        {signedOut && (
          <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            <h2 className="text-lg font-light">Sign in to start a video project</h2>
            <p className="mt-2 text-sm text-white/55">Your projects, drafts and videos are saved to your account.</p>
            <Link href={`/login?redirectTo=${encodeURIComponent(handedUrl ? `/playground/video?url=${encodeURIComponent(handedUrl)}` : '/playground/video')}`} className="mt-6 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">
              Sign in
            </Link>
          </div>
        )}
        {setup && <p className="mt-10 rounded-2xl border border-[#fff05a]/25 bg-[#fff05a]/[0.05] p-4 text-sm text-[#fbf2a0]">{setup}</p>}
        {error && <p className="mt-10 rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">{error}</p>}
        {handedUrl && creating && (
          <div className="mt-10 flex items-center gap-2 text-white/55"><Loader2 className="h-4 w-4 animate-spin" /> Starting a video project for that product…</div>
        )}
        {!signedOut && !error && !setup && projects === null && (
          <div className="mt-16 flex items-center gap-2 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading your video projects…</div>
        )}
        {projects && !setup && (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            <button type="button" onClick={() => void create()} disabled={creating} className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/15 text-white/60 transition-colors hover:border-[#fff05a]/50 hover:bg-[#fff05a]/[0.04] hover:text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><FolderPlus className="h-4 w-4" /></span>
              <span className="text-sm">New video project</span>
            </button>
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} href={hrefFor(project.id)} onRename={() => void rename(project)} onDelete={() => void remove(project)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
