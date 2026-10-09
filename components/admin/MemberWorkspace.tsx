'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, Clapperboard, Download, Eye, FileText, Film, Image as ImageIcon, Library, Loader2, Search, X } from 'lucide-react';
import { AdminApiError, adminApi, type MemberWithSummary } from '@/lib/admin/client';
import { isAdminPreview } from '@/lib/admin/preview';
import { downloadUrl } from '@/lib/playground/api';
import { playgroundModel } from '@/lib/playground/models';
import type { LibraryItem, LibraryKind, PlaygroundBundle, PlaygroundItem, PlaygroundProjectSummary, PlaygroundRun } from '@/lib/playground/types';
import type { StudioVideo } from '@/lib/video/shared';
import { Chip, cx, timeAgo } from '@/components/playground/ui';
import { ShotSequence, VideoThumb } from '@/components/playground/library/libraryParts';
import { ImageViewer } from '@/components/shared/ImageViewer';
import { VideoHistory } from '@/components/video-studio/VideoHistory';
import { VideoPlayerCard } from '@/components/video-studio/VideoPlayerCard';
import { AdminLoading, AdminMessage, AdminShell, adminRefusal, useAdminSession } from './AdminShell';
import { MemberAvatar } from './TeamPage';

type Tab = 'images' | 'videos' | 'library';
type Failure = { status: number; message: string };

const failureOf = (error: unknown): Failure => ({
  status: error instanceof AdminApiError ? error.status : 500,
  message: error instanceof Error ? error.message : 'Something went wrong.',
});

/**
 * The admin's read-only view of one team member's workspace: their image projects (runs and
 * images), video projects (videos and takes) and Library. Nothing here edits, re-runs,
 * charges, polls a render or saves anything; every request is checked on the server.
 */
export function MemberWorkspace({ userId }: { userId: string }) {
  const session = useAdminSession();
  const router = useRouter();
  const search = useSearchParams();
  const tab: Tab = search.get('tab') === 'videos' ? 'videos' : search.get('tab') === 'library' ? 'library' : 'images';
  const projectId = search.get('project');
  const [member, setMember] = useState<MemberWithSummary | null>(null);
  const [imageProjects, setImageProjects] = useState<PlaygroundProjectSummary[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const go = useCallback((next: { tab: Tab; project?: string | null }) => {
    const params = new URLSearchParams();
    if (isAdminPreview()) params.set('previewAdmin', '1');
    if (next.tab !== 'images') params.set('tab', next.tab);
    if (next.project) params.set('project', next.project);
    const query = params.toString();
    router.push(`/admin/team/${userId}${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, userId]);

  useEffect(() => {
    if (!session.ready || !session.signedIn) return;
    adminApi.projects(userId, 'image')
      .then((result) => {
        setMember(result.member);
        setImageProjects(result.projects);
      })
      .catch((error) => setFailure(failureOf(error)));
  }, [session.ready, session.signedIn, session.userId, userId]);

  if (session.ready && !session.signedIn) return <AdminShell><AdminMessage {...adminRefusal(401, '')} /></AdminShell>;
  if (failure) return <AdminShell><AdminMessage {...adminRefusal(failure.status, failure.message)} /></AdminShell>;
  if (!member) return <AdminShell><AdminLoading /></AdminShell>;

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: 'images', label: 'Images', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'videos', label: 'Videos', icon: <Clapperboard className="h-4 w-4" /> },
    { id: 'library', label: 'Library', icon: <Library className="h-4 w-4" /> },
  ];

  return (
    <AdminShell>
      <Link href={`/admin/team${isAdminPreview() ? '?previewAdmin=1' : ''}`} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/55 hover:bg-white/7 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Team
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <MemberAvatar name={member.name} email={member.email} url={member.avatarUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-light text-white sm:text-3xl">{member.name ?? member.email.split('@')[0]}</h1>
          <p className="truncate text-sm text-white/50">{member.email}</p>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-3.5 py-2.5 text-xs text-[#fbf2a0]/90">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        You’re viewing {member.email}’s workspace. Read-only: nothing you do here changes their work or uses their credits.
        <span className="text-white/45">
          {member.summary.imagesMade.toLocaleString('en-IN')} images · {member.summary.videosMade} videos · {member.summary.creditsUsed30d.toLocaleString('en-IN')} credits in 30 days
        </span>
      </p>

      <div className="mt-6 flex gap-1.5 border-b border-white/8" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => go({ tab: item.id })}
            className={cx(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
              tab === item.id ? 'border-[#fff05a] text-white' : 'border-transparent text-white/50 hover:text-white'
            )}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'images' && (projectId
          ? <ImageProjectView userId={userId} projectId={projectId} onBack={() => go({ tab: 'images' })} />
          : <ProjectGrid kind="image" projects={imageProjects} onOpen={(id) => go({ tab: 'images', project: id })} />)}
        {tab === 'videos' && (projectId
          ? <VideoProjectView userId={userId} projectId={projectId} onBack={() => go({ tab: 'videos' })} />
          : <VideoProjects userId={userId} onOpen={(id) => go({ tab: 'videos', project: id })} />)}
        {tab === 'library' && <LibraryView userId={userId} />}
      </div>
    </AdminShell>
  );
}

/* ----------------------------------------------------------------- projects */

function ProjectCard({ project, kind, onOpen }: { project: PlaygroundProjectSummary; kind: 'image' | 'video'; onOpen: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const what = kind === 'video'
    ? `${project.videoCount ?? 0} video${project.videoCount === 1 ? '' : 's'}`
    : `${project.imageCount} image${project.imageCount === 1 ? '' : 's'}`;
  return (
    <button type="button" onClick={onOpen} className="group overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] !p-0 text-left transition-colors hover:border-white/20">
      <div className="aspect-[4/3] overflow-hidden bg-[#111115]">
        {project.coverUrl && !coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center">{kind === 'video' ? <Clapperboard className="h-8 w-8 text-white/15" /> : <ImageIcon className="h-8 w-8 text-white/15" />}</div>
        )}
      </div>
      <div className="px-3.5 py-3">
        <h3 className="truncate text-sm font-medium text-white">{project.name}</h3>
        <p className="mt-0.5 truncate text-[11px] text-white/45">{what} · {timeAgo(project.updatedAt)}</p>
      </div>
    </button>
  );
}

function ProjectGrid({ kind, projects, onOpen, lead }: { kind: 'image' | 'video'; projects: PlaygroundProjectSummary[] | null; onOpen: (id: string) => void; lead?: ReactNode }) {
  if (!projects) return <AdminLoading />;
  if (!projects.length && !lead) {
    return <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">No {kind === 'video' ? 'video' : 'image'} projects yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
      {lead}
      {projects.map((project) => <ProjectCard key={project.id} project={project} kind={kind} onOpen={() => onOpen(project.id)} />)}
    </div>
  );
}

function BackBar({ title, detail, onBack }: { title: string; detail?: string; onBack: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8 hover:text-white">
        <ChevronLeft className="h-3.5 w-3.5" /> All projects
      </button>
      <h2 className="min-w-0 truncate text-lg font-light text-white">{title}</h2>
      {detail && <span className="text-xs text-white/40">{detail}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------- images */

function ItemTile({ item, onOpen }: { item: PlaygroundItem; onOpen: () => void }) {
  const ratio = item.aspectRatio.replace(':', ' / ');
  if (item.status === 'done' && (item.previewUrl || item.imageUrl)) {
    return (
      <button type="button" onClick={onOpen} className="group overflow-hidden rounded-xl border border-white/8 bg-black/30 !p-0" style={{ aspectRatio: ratio }} title="See full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl ?? item.imageUrl ?? ''} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      </button>
    );
  }
  const label = item.status === 'failed' ? 'Failed' : item.status === 'cancelled' ? 'Cancelled' : 'Not finished';
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-[11px] text-white/40" style={{ aspectRatio: ratio }} title={item.error ?? undefined}>
      {item.status === 'failed' && <AlertTriangle className="mr-1 h-3.5 w-3.5 text-red-300/70" />} {label}
    </div>
  );
}

function RunBlock({ run, items, onOpen }: { run: PlaygroundRun; items: PlaygroundItem[]; onOpen: (item: PlaygroundItem) => void }) {
  const model = playgroundModel(run.model);
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm text-white">{timeAgo(run.createdAt)}</h3>
        <p className="text-[11px] text-white/45">
          {model.name} · {run.size}{run.quality ? ` · ${run.quality}` : ''} · {run.imageCount} image{run.imageCount === 1 ? '' : 's'} · {run.creditsPerImage} credits each{run.cancelledAt ? ' · stopped early' : ''}
        </p>
      </div>
      {run.prompts.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-[11px] text-white/55 hover:text-white">{run.prompts.length === 1 ? 'Prompt' : `${run.prompts.length} prompts`}</summary>
          <ol className="mt-2 space-y-1.5">
            {run.prompts.map((prompt, index) => (
              <li key={index} className="whitespace-pre-wrap rounded-lg bg-black/25 px-3 py-2 text-[11.5px] leading-relaxed text-white/65">{prompt}</li>
            ))}
          </ol>
        </details>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
        {items.map((item) => <ItemTile key={item.id} item={item} onOpen={() => onOpen(item)} />)}
      </div>
    </section>
  );
}

function ImageProjectView({ userId, projectId, onBack }: { userId: string; projectId: string; onBack: () => void }) {
  const [bundle, setBundle] = useState<PlaygroundBundle | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [open, setOpen] = useState<PlaygroundItem | null>(null);

  useEffect(() => {
    adminApi.project(userId, projectId).then(setBundle).catch((error) => setFailure(failureOf(error)));
  }, [userId, projectId]);

  const older = async () => {
    if (!bundle?.nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await adminApi.project(userId, projectId, bundle.nextBefore);
      setBundle((current) => current && { ...current, runs: [...current.runs, ...page.runs], items: [...current.items, ...page.items.filter((item) => item.runId)], nextBefore: page.nextBefore });
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingOlder(false);
    }
  };

  const byRun = useMemo(() => {
    const map = new Map<string, PlaygroundItem[]>();
    for (const item of bundle?.items ?? []) {
      if (!item.runId) continue;
      map.set(item.runId, [...(map.get(item.runId) ?? []), item]);
    }
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [bundle]);
  const edits = (bundle?.items ?? []).filter((item) => item.kind === 'edit');
  const runOf = (item: PlaygroundItem) => bundle?.runs.find((run) => run.id === item.runId) ?? null;

  if (failure) return <AdminMessage {...adminRefusal(failure.status, failure.message)} />;
  if (!bundle) return <AdminLoading />;
  const openRun = open ? runOf(open) : null;
  const openPrompt = open && openRun && open.promptIndex !== null ? openRun.prompts[open.promptIndex] : null;

  return (
    <div>
      <BackBar title={bundle.project.name} detail={`updated ${timeAgo(bundle.project.updatedAt)}`} onBack={onBack} />
      {bundle.project.brief?.trim() && (
        <details className="mb-4 rounded-2xl border border-white/8 bg-black/20">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs text-white/60 hover:text-white">Project guidelines</summary>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3.5 pb-3.5 text-[11.5px] leading-relaxed text-white/55">{bundle.project.brief}</p>
        </details>
      )}
      {bundle.runs.length === 0 && edits.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">No images in this project yet.</p>
      ) : (
        <div className="space-y-4">
          {bundle.runs.map((run) => <RunBlock key={run.id} run={run} items={byRun.get(run.id) ?? []} onOpen={setOpen} />)}
          {edits.length > 0 && (
            <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <h3 className="text-sm text-white">Edited in Canvas</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
                {edits.map((item) => <ItemTile key={item.id} item={item} onOpen={() => setOpen(item)} />)}
              </div>
            </section>
          )}
          {bundle.nextBefore && (
            <div className="flex justify-center">
              <button type="button" onClick={() => void older()} disabled={loadingOlder} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/75 hover:bg-white/8 disabled:opacity-50">
                {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />} Older runs
              </button>
            </div>
          )}
        </div>
      )}
      {open?.imageUrl && (
        <ImageViewer url={open.imageUrl} onClose={() => setOpen(null)}>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{openRun ? playgroundModel(openRun.model).name : 'Edited in Canvas'}</p>
          <p className="mt-1 text-xs text-white/55">{open.aspectRatio}{open.width && open.height ? ` · ${open.width}×${open.height}` : ''} · {timeAgo(open.createdAt)}</p>
          {openPrompt && <p className="mt-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-white/75">{openPrompt}</p>}
          <a href={downloadUrl(open.imageUrl, `image-${open.id.slice(0, 8)}.png`)} download className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white">
            <Download className="h-4 w-4" /> Download
          </a>
        </ImageViewer>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- videos */

function VideoProjects({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<PlaygroundProjectSummary[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    adminApi.projects(userId, 'video').then((result) => setProjects(result.projects)).catch((error) => setFailure(failureOf(error)));
  }, [userId]);
  if (failure) return <AdminMessage {...adminRefusal(failure.status, failure.message)} />;
  return (
    <ProjectGrid
      kind="video"
      projects={projects}
      onOpen={onOpen}
      lead={projects ? (
        <button type="button" onClick={() => onOpen('all')} className="flex aspect-auto flex-col justify-end rounded-2xl border border-white/8 bg-gradient-to-br from-[#c8b8ff]/10 to-transparent p-4 text-left !p-4 hover:border-white/20">
          <Film className="mb-auto h-6 w-6 text-[#d9ccff]" />
          <p className="mt-10 text-sm font-medium text-white">All videos</p>
          <p className="text-[11px] text-white/45">Every video, in any project</p>
        </button>
      ) : undefined}
    />
  );
}

/** A video still waiting for the member's approval: what was planned, nothing to play yet. */
function PlannedVideo({ video }: { video: StudioVideo }) {
  const review = video.review;
  if (!review) return null;
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#111114] p-4 sm:p-5">
      <p className="text-sm text-white">Planned, waiting for approval</p>
      <p className="mt-0.5 text-xs text-white/45">{review.durationSeconds}s · {review.aspectRatio} · {timeAgo(video.createdAt)} · nothing rendered yet</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {review.frames.map((frame) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={frame.url} src={frame.url} alt={frame.label} className="h-28 w-auto shrink-0 rounded-lg border border-white/10 object-cover" />
        ))}
      </div>
      <details className="mt-3 rounded-2xl border border-white/8 bg-black/20">
        <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs text-white/60 hover:text-white">The planned prompt</summary>
        <p className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3.5 pb-3.5 font-mono text-[11px] leading-relaxed text-white/55">{review.prompt}</p>
      </details>
    </div>
  );
}

function VideoProjectView({ userId, projectId, onBack }: { userId: string; projectId: string; onBack: () => void }) {
  const all = projectId === 'all';
  const [videos, setVideos] = useState<StudioVideo[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [name, setName] = useState<string | null>(all ? 'All videos' : null);

  useEffect(() => {
    adminApi.videos(userId, { projectId: all ? null : projectId })
      .then((page) => {
        setVideos(page.videos);
        setNextBefore(page.nextBefore);
        setSelectedId(page.videos[0]?.id ?? null);
      })
      .catch((error) => setFailure(failureOf(error)));
    if (!all) {
      adminApi.projects(userId, 'video')
        .then((result) => setName(result.projects.find((project) => project.id === projectId)?.name ?? 'Video project'))
        .catch(() => setName('Video project'));
    }
  }, [userId, projectId, all]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminApi.videos(userId, { projectId: all ? null : projectId, before: nextBefore });
      setVideos((current) => [...(current ?? []), ...page.videos]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingMore(false);
    }
  };

  if (failure) return <AdminMessage {...adminRefusal(failure.status, failure.message)} />;
  const selected = videos?.find((video) => video.id === selectedId) ?? null;
  return (
    <div>
      <BackBar title={name ?? 'Video project'} onBack={onBack} />
      {selected && (
        <div className="mb-8">
          {selected.review ? <PlannedVideo video={selected} /> : <VideoPlayerCard video={selected} preview={false} busy={false} credits={null} readOnly />}
        </div>
      )}
      <VideoHistory
        videos={videos}
        selectedId={selectedId}
        preview={false}
        loadingMore={loadingMore}
        hasMore={Boolean(nextBefore)}
        onOpen={(video) => {
          setSelectedId(video.id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onLoadMore={() => void more()}
        title="Videos"
        owner={false}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- library */

function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xl" onClick={onClose} role="dialog">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141418] p-4" onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}

function LibraryView({ userId }: { userId: string }) {
  const [kind, setKind] = useState<LibraryKind>('image');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [open, setOpen] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    let live = true;
    setItems(null);
    adminApi.library(userId, { kind, q: query || null })
      .then((page) => {
        if (!live) return;
        setItems(page.items);
        setNextBefore(page.nextBefore);
      })
      .catch((error) => live && setFailure(failureOf(error)));
    return () => {
      live = false;
    };
  }, [userId, kind, query]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminApi.library(userId, { kind, q: query || null, before: nextBefore });
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingMore(false);
    }
  };

  if (failure) return <AdminMessage {...adminRefusal(failure.status, failure.message)} />;
  const kinds: Array<{ id: LibraryKind; label: string }> = [
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'document', label: 'Documents' },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {kinds.map((option) => <Chip key={option.id} active={kind === option.id} onClick={() => setKind(option.id)}>{option.label}</Chip>)}
        <label className="ml-auto flex h-9 min-w-[200px] items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 text-sm text-white/70">
          <Search className="h-4 w-4 text-white/35" />
          <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Search by name" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        </label>
      </div>
      {!items ? (
        <AdminLoading />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-white/45">Nothing here{query ? ' with that name' : ' yet'}.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-4">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => setOpen(item)} className="group overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] !p-0 text-left hover:border-white/20">
              {item.kind === 'video' ? (
                <VideoThumb item={item} className="aspect-[9/16] w-full" />
              ) : item.kind === 'image' && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full flex-col gap-2 p-3">
                  <FileText className="h-5 w-5 text-white/40" />
                  <p className="line-clamp-6 text-[11px] leading-relaxed text-white/50">{item.preview}</p>
                </div>
              )}
              <span className="block truncate px-2.5 py-2 text-xs text-white/80">{item.name || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
      {nextBefore && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => void more()} disabled={loadingMore} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/75 hover:bg-white/8 disabled:opacity-50">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} More
          </button>
        </div>
      )}

      {open?.kind === 'image' && open.url && (
        <ImageViewer url={open.url} onClose={() => setOpen(null)}>
          <p className="text-sm text-white">{open.name || 'Untitled'}</p>
          <p className="mt-1 text-xs text-white/50">{open.width && open.height ? `${open.width}×${open.height} · ` : ''}{timeAgo(open.createdAt)}</p>
          <a href={downloadUrl(open.url, open.name || 'image')} download className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white">
            <Download className="h-4 w-4" /> Download
          </a>
        </ImageViewer>
      )}
      {open?.kind === 'video' && open.url && (
        <Overlay onClose={() => setOpen(null)}>
          <p className="mb-3 text-sm text-white">{open.name || 'Untitled'}</p>
          <video src={open.url} poster={open.posterUrl ?? undefined} controls playsInline className="max-h-[60vh] w-full rounded-xl bg-black object-contain" />
          {open.analysis && <div className="mt-4"><ShotSequence analysis={open.analysis} /></div>}
          <a href={downloadUrl(open.url, `${open.name || 'video'}.mp4`)} download className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white">
            <Download className="h-4 w-4" /> Download
          </a>
        </Overlay>
      )}
      {open?.kind === 'document' && (
        <Overlay onClose={() => setOpen(null)}>
          <p className="text-sm text-white">{open.name || 'Untitled'}</p>
          <p className="mt-1 text-xs text-white/45">{open.length ? `${open.length.toLocaleString('en-IN')} characters · ` : ''}{timeAgo(open.createdAt)}</p>
          <p className="mt-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/75">{open.preview}{open.length && open.preview && open.length > open.preview.length ? '…' : ''}</p>
        </Overlay>
      )}
    </div>
  );
}
