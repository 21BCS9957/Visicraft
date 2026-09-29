'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderPlus, ImageIcon, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { playgroundApi } from '@/lib/playground/api';
import { cachedProjectList, forgetProject, prefetchProject, rememberBundle, rememberProjectList } from '@/lib/playground/cache';
import { previewProjects, PREVIEW_PROJECT_ID } from '@/lib/playground/preview';
import type { PlaygroundProjectSummary } from '@/lib/playground/types';
import { usePreviewFlag } from './hooks';
import { Popover, PopoverClose, timeAgo } from './ui';

const TOAST = { position: 'top-center' as const };

function ProjectCard({ project, href, onRename, onDelete, onWarm }: {
  project: PlaygroundProjectSummary;
  href: string;
  onRename: () => void;
  onDelete: () => void;
  onWarm?: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-white/15">
      <Link href={href} className="block" onPointerEnter={onWarm} onFocus={onWarm}>
        <div className="aspect-[4/3] overflow-hidden bg-[#111115]">
          {project.coverUrl && !coverFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-white/15" /></div>
          )}
        </div>
        <div className="px-3.5 py-3 pr-11">
          <h3 className="truncate text-sm font-medium text-white">{project.name}</h3>
          <p className="mt-0.5 truncate text-[11px] text-white/45">
            {project.imageCount} image{project.imageCount === 1 ? '' : 's'} · {project.referenceCount} reference{project.referenceCount === 1 ? '' : 's'} · {timeAgo(project.updatedAt)}
          </p>
        </div>
      </Link>
      <div className="absolute bottom-2.5 right-2">
        <Popover
          side="bottom"
          align="end"
          className="w-44"
          trigger={
            <button type="button" aria-label="Project actions" className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
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

export function PlaygroundHome() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const preview = usePreviewFlag();
  const [loaded, setLoaded] = useState<PlaygroundProjectSummary[] | null>(() => cachedProjectList());
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  // The dev preview starts from sample projects; renames and deletes then edit this copy.
  const projects = loaded ?? (preview ? previewProjects() : null);
  const setProjects = (update: (list: PlaygroundProjectSummary[] | null) => PlaygroundProjectSummary[] | null) => setLoaded(update(projects));

  useEffect(() => {
    if (preview || authLoading || !user) return;
    playgroundApi.listProjects()
      .then(({ projects: list }) => {
        rememberProjectList(list);
        setLoaded(list);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load your projects.'));
  }, [preview, authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hrefFor = (id: string) => (preview ? `/playground/${PREVIEW_PROJECT_ID}?previewPlayground=1` : `/playground/${id}`);

  const create = async () => {
    if (preview) return router.push(hrefFor(PREVIEW_PROJECT_ID));
    setCreating(true);
    try {
      const { project } = await playgroundApi.createProject(`Project ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
      // A new project is empty: it can open without waiting for the server.
      rememberBundle(project.id, { project, references: [], runs: [], items: [], nextBefore: null, refunded: 0 });
      router.push(`/playground/${project.id}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not create the project', TOAST);
      setCreating(false);
    }
  };
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
    if (!window.confirm(`Delete "${project.name}" with its ${project.imageCount} images and references? This cannot be undone.`)) return;
    try {
      if (!preview) await playgroundApi.deleteProject(project.id);
      forgetProject(project.id);
      setProjects((list) => list?.filter((known) => known.id !== project.id) ?? list);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not delete the project', TOAST);
    }
  };

  const signedOut = !preview && !authLoading && !user;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(255,240,90,0.07),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl">Playground</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
              Each project keeps your product references and brief. Paste 40 prompts and get 40 on-brand images, one per prompt.
            </p>
          </div>
          {!signedOut && (
            <button type="button" onClick={create} disabled={creating} className="inline-flex items-center gap-2 rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white disabled:opacity-60">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} New project
            </button>
          )}
        </div>

        {signedOut && (
          <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            <h2 className="text-lg font-light">Sign in to start a project</h2>
            <p className="mt-2 text-sm text-white/55">Your projects, references and images are saved to your account.</p>
            <Link href="/login?redirectTo=/playground" className="mt-6 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">
              Sign in
            </Link>
          </div>
        )}
        {error && <p className="mt-10 rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">{error}</p>}
        {!signedOut && !error && projects === null && (
          <div className="mt-16 flex items-center gap-2 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading your projects…</div>
        )}
        {projects && (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            <button type="button" onClick={create} disabled={creating} className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/15 text-white/60 transition-colors hover:border-[#fff05a]/50 hover:bg-[#fff05a]/[0.04] hover:text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><FolderPlus className="h-4 w-4" /></span>
              <span className="text-sm">New project</span>
            </button>
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} href={hrefFor(project.id)} onRename={() => rename(project)} onDelete={() => remove(project)} onWarm={preview ? undefined : () => prefetchProject(project.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
