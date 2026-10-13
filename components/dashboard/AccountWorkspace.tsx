'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, Clapperboard, Download, FileText, Image as ImageIcon, Loader2, Search } from 'lucide-react';
import { dashboardApi } from '@/lib/dashboard/client';
import { isDashboardPreview } from '@/lib/dashboard/preview';
import type { FeedImage, MemberWithSummary } from '@/lib/dashboard/types';
import { downloadUrl } from '@/lib/playground/api';
import { playgroundModel } from '@/lib/playground/models';
import type { LibraryItem, LibraryKind, PlaygroundBundle, PlaygroundItem, PlaygroundProjectSummary, PlaygroundRun } from '@/lib/playground/types';
import { cx, timeAgo } from '@/components/playground/ui';
import { ShotSequence, VideoThumb } from '@/components/playground/library/libraryParts';
import { useDashboard } from './DashboardData';
import { DashboardShell } from './DashboardShell';
import { Gallery, MediaTile, TILE_GRID, TileSkeleton } from './Gallery';
import { isGenerating, itemKey } from './items';
import { Lightbox } from './Lightbox';
import { LiveDot } from './Sidebar';
import {
  dashboardHref, displayName, EmptyState, failureMessage, failureOf, formatCount, Loading, MemberAvatar, Message, Overlay,
  PageHeader, PANEL, Segmented, type Failure,
} from './parts';

type Tab = 'gallery' | 'projects' | 'library';
type ProjectCardData = PlaygroundProjectSummary & { kind: 'image' | 'video' };

/**
 * One GoGrowth account, read-only: everything it made (Gallery), its image and video projects,
 * and its Library. Nothing here edits, re-runs, charges, polls a render or saves anything.
 */
export function AccountWorkspace({ userId }: { userId: string }) {
  return (
    <DashboardShell active={`account:${userId}`}>
      <AccountBody userId={userId} />
    </DashboardShell>
  );
}

function SmallStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={cx(PANEL, 'min-w-0 p-5')}>
      <p className="text-[13px] text-zinc-400">{label}</p>
      {value === null ? <span className="mt-3 block h-8 w-20 animate-pulse rounded-full bg-white/[0.06]" /> : <p className="mt-2 text-[32px] font-semibold leading-none tracking-tight text-zinc-50">{value}</p>}
    </div>
  );
}

function AccountBody({ userId }: { userId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { memberById, live } = useDashboard();
  const asked = search.get('tab');
  // Old links (?tab=images / videos) land on Projects.
  const tab: Tab = asked === 'library' ? 'library' : asked === 'projects' || asked === 'images' || asked === 'videos' ? 'projects' : 'gallery';
  const projectId = search.get('project');
  const projectKind = search.get('kind') === 'video' || asked === 'videos' ? 'video' : 'image';
  const [member, setMember] = useState<MemberWithSummary | null>(null);
  const [projects, setProjects] = useState<ProjectCardData[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const go = useCallback((next: { tab: Tab; project?: string | null; kind?: 'image' | 'video' }) => {
    router.push(dashboardHref(`/accounts/${userId}`, {
      tab: next.tab === 'gallery' ? null : next.tab,
      project: next.project ?? null,
      kind: next.project ? next.kind ?? null : null,
    }, isDashboardPreview()), { scroll: false });
  }, [router, userId]);

  useEffect(() => {
    let active = true;
    Promise.all([dashboardApi.projects(userId, 'image'), dashboardApi.projects(userId, 'video')])
      .then(([images, videos]) => {
        if (!active) return;
        setMember(images.member);
        setProjects([
          ...images.projects.map((project) => ({ ...project, kind: 'image' as const })),
          ...videos.projects.map((project) => ({ ...project, kind: 'video' as const })),
        ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      })
      .catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [userId]);

  const known = member ?? memberById.get(userId) ?? null;
  const liveCount = (live ?? []).filter((job) => job.userId === userId && isGenerating(job)).length;
  if (failure) return <Message {...failureMessage(failure)} />;
  if (!known) return <Loading />;
  const summary = member?.summary ?? null;

  const tabs: Array<{ id: Tab; label: string; count?: number | null }> = [
    { id: 'gallery', label: 'Gallery' },
    { id: 'projects', label: 'Projects', count: projects?.length ?? null },
    { id: 'library', label: 'Library' },
  ];

  return (
    <>
      <PageHeader
        lead={<MemberAvatar name={known.name} email={known.email} url={known.avatarUrl} size="lg" />}
        title={displayName(known)}
        description={<>{known.email}{summary ? <> · {summary.lastActiveAt ? `last active ${timeAgo(summary.lastActiveAt)}` : 'hasn’t made anything yet'}</> : null}</>}
        actions={liveCount > 0 ? <span className="inline-flex items-center gap-2 rounded-lg border border-[#fff05a]/25 bg-[#fff05a]/10 px-2.5 py-1.5 text-xs font-medium text-[#fff05a]"><LiveDot /> {liveCount === 1 ? 'Generating now' : `${liveCount} running now`}</span> : null}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SmallStat label="Images" value={summary ? formatCount(summary.imagesMade) : null} />
        <SmallStat label="Videos" value={summary ? formatCount(summary.videosMade) : null} />
        <SmallStat label="Credits used · 30 days" value={summary ? formatCount(summary.creditsUsed30d) : null} />
        <SmallStat label="Credits left" value={summary ? (summary.balance === null ? '—' : formatCount(summary.balance)) : null} />
      </div>

      <div className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-[#0b0b0d] p-1 [scrollbar-width:none]" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => go({ tab: item.id })}
            className={cx(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
              tab === item.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
            )}
          >
            {item.label}
            {typeof item.count === 'number' && <span className={cx('text-xs tabular-nums', tab === item.id ? 'text-zinc-500' : 'text-zinc-600')}>{item.count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {tab === 'gallery' && <Gallery account={userId} />}
        {tab === 'projects' && (projectId
          ? projectKind === 'video'
            ? <VideoProject userId={userId} projectId={projectId} name={projects?.find((project) => project.id === projectId)?.name ?? null} onBack={() => go({ tab: 'projects' })} />
            : <ImageProject userId={userId} projectId={projectId} onBack={() => go({ tab: 'projects' })} />
          : <ProjectGrid projects={projects} onOpen={(project) => go({ tab: 'projects', project: project.id, kind: project.kind })} />)}
        {tab === 'library' && <LibraryView userId={userId} />}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- projects */

function ProjectCard({ project, onOpen }: { project: ProjectCardData; onOpen: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const what = project.kind === 'video'
    ? `${project.videoCount ?? 0} video${project.videoCount === 1 ? '' : 's'}`
    : `${formatCount(project.imageCount)} image${project.imageCount === 1 ? '' : 's'}`;
  return (
    <button type="button" onClick={onOpen} className={cx(PANEL, 'group overflow-hidden !p-0 text-left transition-colors hover:border-white/15')}>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {project.coverUrl && !coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-700">{project.kind === 'video' ? <Clapperboard className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}</div>
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {project.kind === 'video' ? <Clapperboard className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {project.kind === 'video' ? 'Video' : 'Images'}
        </span>
      </div>
      <div className="px-3.5 py-3">
        <h3 className="truncate text-sm font-medium text-zinc-100">{project.name}</h3>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{what} · updated {timeAgo(project.updatedAt)}</p>
      </div>
    </button>
  );
}

function ProjectGrid({ projects, onOpen }: { projects: ProjectCardData[] | null; onOpen: (project: ProjectCardData) => void }) {
  if (!projects) return <div className="pt-5"><Loading /></div>;
  if (!projects.length) return <div className={cx(PANEL, 'mt-5')}><EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No projects yet" body="Image and video projects this account creates show up here." /></div>;
  return (
    <div className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {projects.map((project) => <ProjectCard key={`${project.kind}-${project.id}`} project={project} onOpen={() => onOpen(project)} />)}
    </div>
  );
}

function BackBar({ title, detail, onBack, children }: { title: string; detail?: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-1 pt-5">
      <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1 rounded-full border border-white/15 px-3.5 text-xs text-zinc-200 hover:bg-white/[0.06]">
        <ChevronLeft className="h-3.5 w-3.5" /> Projects
      </button>
      <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      {detail && <span className="text-xs text-zinc-500">{detail}</span>}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- image project */

/** A Playground image as a feed image, so the gallery's tile and viewer can show it. */
function asFeedImage(item: PlaygroundItem, run: PlaygroundRun | null, userId: string, project: { id: string; name: string }): FeedImage {
  return {
    kind: 'image',
    id: item.id,
    userId,
    createdAt: item.createdAt,
    status: item.status,
    url: item.imageUrl,
    previewUrl: item.previewUrl,
    aspectRatio: item.aspectRatio,
    width: item.width,
    height: item.height,
    prompt: run && item.promptIndex !== null ? run.prompts[item.promptIndex] ?? null : item.kind === 'edit' ? 'Edited in Canvas' : null,
    model: run ? playgroundModel(run.model).name : null,
    size: run?.size ?? null,
    projectId: project.id,
    projectName: project.name,
    source: 'playground',
    error: item.error,
    startedAt: item.startedAt,
  };
}

/** An image project: its runs, newest first, each headed by its prompt, with the finished images in the gallery grid. */
function ImageProject({ userId, projectId, onBack }: { userId: string; projectId: string; onBack: () => void }) {
  const [bundle, setBundle] = useState<PlaygroundBundle | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    dashboardApi.project(userId, projectId).then((next) => active && setBundle(next)).catch((error) => active && setFailure(failureOf(error)));
    return () => {
      active = false;
    };
  }, [userId, projectId]);

  const older = async () => {
    if (!bundle?.nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await dashboardApi.project(userId, projectId, bundle.nextBefore);
      setBundle((current) => current && { ...current, runs: [...current.runs, ...page.runs], items: [...current.items, ...page.items.filter((item) => item.runId)], nextBefore: page.nextBefore });
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingOlder(false);
    }
  };

  // Each run with its finished images (as feed images), plus Canvas edits; one flat list for the viewer.
  const { sections, viewable } = useMemo(() => {
    if (!bundle) return { sections: [], viewable: [] as FeedImage[] };
    const project = { id: bundle.project.id, name: bundle.project.name };
    const runOf = new Map(bundle.runs.map((run) => [run.id, run]));
    const all: FeedImage[] = [];
    const list: Array<{ key: string; title: string; meta: string; images: Array<{ image: FeedImage; index: number }>; unfinished: number }> = [];
    const add = (key: string, title: string, meta: string, items: PlaygroundItem[]) => {
      const images: Array<{ image: FeedImage; index: number }> = [];
      let unfinished = 0;
      for (const item of [...items].sort((a, b) => a.position - b.position)) {
        const image = asFeedImage(item, item.runId ? runOf.get(item.runId) ?? null : null, userId, project);
        if (item.status !== 'done' || !(item.previewUrl || item.imageUrl) || broken.has(itemKey(image))) {
          if (item.status !== 'done') unfinished += 1;
          continue;
        }
        images.push({ image, index: all.length });
        all.push(image);
      }
      if (images.length || unfinished) list.push({ key, title, meta, images, unfinished });
    };
    for (const run of bundle.runs) {
      const items = bundle.items.filter((item) => item.runId === run.id);
      const model = playgroundModel(run.model);
      const title = run.prompts.length === 1 ? run.prompts[0] : run.prompts.length ? `${run.prompts.length} prompts · ${run.prompts[0]}` : 'Run';
      add(run.id, title, `${timeAgo(run.createdAt)} · ${model.name} · ${run.size}${run.quality ? ` · ${run.quality}` : ''}`, items);
    }
    const edits = bundle.items.filter((item) => item.kind === 'edit');
    if (edits.length) add('edits', 'Edited in Canvas', `${edits.length} image${edits.length === 1 ? '' : 's'}`, edits);
    return { sections: list, viewable: all };
  }, [bundle, userId, broken]);

  if (failure) return <Message {...failureMessage(failure)} />;
  if (!bundle) return <div className="pt-5"><TileSkeleton /></div>;

  return (
    <div>
      <BackBar title={bundle.project.name} detail={`updated ${timeAgo(bundle.project.updatedAt)}`} onBack={onBack} />
      {bundle.project.brief?.trim() && (
        <details className={cx(PANEL, 'mt-3')}>
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-100">Project guidelines</summary>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap px-4 pb-4 text-[13px] leading-relaxed text-zinc-400">{bundle.project.brief}</p>
        </details>
      )}
      {sections.length === 0 ? (
        <div className={cx(PANEL, 'mt-5')}><EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No images in this project yet" /></div>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="pt-6">
            <div className="mb-3">
              <h3 className="line-clamp-2 text-sm font-medium text-zinc-200" title={section.title}>{section.title}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {section.meta} · {section.images.length} image{section.images.length === 1 ? '' : 's'}
                {section.unfinished > 0 && <span className="text-zinc-600"> · {section.unfinished} didn’t finish</span>}
              </p>
            </div>
            {section.images.length > 0 && (
              <div className={TILE_GRID}>
                {section.images.map(({ image, index }) => (
                  <MediaTile key={image.id} item={image} showWho={false} onOpen={() => setOpen(index)} onBroken={() => setBroken((current) => new Set(current).add(itemKey(image)))} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
      {bundle.nextBefore && (
        <div className="flex justify-center pt-8">
          <button type="button" onClick={() => void older()} disabled={loadingOlder} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-5 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50">
            {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />} Older runs
          </button>
        </div>
      )}
      {open !== null && viewable[open] && <Lightbox items={viewable} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------- video project */

function VideoProject({ userId, projectId, name, onBack }: { userId: string; projectId: string; name: string | null; onBack: () => void }) {
  return (
    <div>
      <BackBar title={name ?? 'Video project'} onBack={onBack} />
      <Gallery account={userId} project={projectId} initialType="video" showTypes={false} />
    </div>
  );
}

/* ------------------------------------------------------------------- library */

function asLibraryImage(item: LibraryItem, userId: string): FeedImage {
  return {
    kind: 'image', id: item.id, userId, createdAt: item.createdAt, status: 'done', url: item.url, previewUrl: item.url,
    aspectRatio: null, width: item.width, height: item.height, prompt: null, model: null, size: null,
    projectId: null, projectName: item.name || 'Library image', source: 'playground', error: null, startedAt: null,
  };
}

function LibraryView({ userId }: { userId: string }) {
  const [kind, setKind] = useState<LibraryKind>('image');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [openImage, setOpenImage] = useState<number | null>(null);
  const [openOther, setOpenOther] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    let live = true;
    dashboardApi.library(userId, { kind, q: query || null })
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
      const page = await dashboardApi.library(userId, { kind, q: query || null, before: nextBefore });
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const images = useMemo(() => (kind === 'image' ? (items ?? []).filter((item) => item.url && !broken.has(item.id)).map((item) => asLibraryImage(item, userId)) : []), [items, kind, broken, userId]);
  const others = kind === 'image' ? [] : items ?? [];

  if (failure) return <Message {...failureMessage(failure)} />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <Segmented label="Library" value={kind} onChange={(next) => { setKind(next); setItems(null); }} options={[{ id: 'image', label: 'Images' }, { id: 'video', label: 'Videos' }, { id: 'document', label: 'Documents' }]} />
        <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-white/[0.08] bg-[#0b0b0d] px-4 text-sm text-zinc-300 sm:ml-auto sm:max-w-xs">
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Search by name" className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600" />
        </label>
      </div>
      {!items ? (
        <TileSkeleton count={6} />
      ) : (kind === 'image' ? images.length : others.length) === 0 ? (
        <div className={PANEL}><EmptyState icon={kind === 'document' ? <FileText className="h-5 w-5" /> : kind === 'video' ? <Clapperboard className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />} title={query ? 'Nothing with that name' : 'Nothing saved here yet'} /></div>
      ) : kind === 'image' ? (
        <div className={TILE_GRID}>
          {images.map((image, index) => (
            <MediaTile key={image.id} item={image} showWho={false} onOpen={() => setOpenImage(index)} onBroken={() => setBroken((current) => new Set(current).add(image.id))} />
          ))}
        </div>
      ) : (
        <div className={TILE_GRID}>
          {others.map((item) => (
            <button key={item.id} type="button" onClick={() => setOpenOther(item)} className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[14px] bg-zinc-900 !p-0 text-left ring-1 ring-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#fff05a]/70">
              {item.kind === 'video' ? (
                <VideoThumb item={item} className="h-full w-full" />
              ) : (
                <span className="flex h-full flex-col gap-2 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-zinc-500" />
                  <span className="line-clamp-[9] text-[11px] leading-relaxed text-zinc-400">{item.preview}</span>
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2 pt-8 text-xs text-zinc-100">{item.name || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
      {nextBefore && (
        <div className="flex justify-center pt-8">
          <button type="button" onClick={() => void more()} disabled={loadingMore} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-5 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} More
          </button>
        </div>
      )}

      {openImage !== null && images[openImage] && <Lightbox items={images} index={openImage} onIndex={setOpenImage} onClose={() => setOpenImage(null)} />}
      {openOther?.kind === 'video' && openOther.url && (
        <Overlay onClose={() => setOpenOther(null)}>
          <p className="mb-3 text-sm font-medium text-zinc-100">{openOther.name || 'Untitled'}</p>
          <video src={openOther.url} poster={openOther.posterUrl ?? undefined} controls playsInline className="max-h-[60vh] w-full rounded-lg bg-black object-contain" />
          {openOther.analysis && <div className="mt-4"><ShotSequence analysis={openOther.analysis} /></div>}
          <a href={downloadUrl(openOther.url, `${openOther.name || 'video'}.mp4`)} download className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-[#1f1c00] hover:bg-[#fff59a]">
            <Download className="h-4 w-4" /> Download
          </a>
        </Overlay>
      )}
      {openOther?.kind === 'document' && (
        <Overlay onClose={() => setOpenOther(null)}>
          <p className="text-sm font-medium text-zinc-100">{openOther.name || 'Untitled'}</p>
          <p className="mt-1 text-xs text-zinc-500">{openOther.length ? `${formatCount(openOther.length)} characters · ` : ''}{timeAgo(openOther.createdAt)}</p>
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{openOther.preview}{openOther.length && openOther.preview && openOther.length > openOther.preview.length ? '…' : ''}</p>
        </Overlay>
      )}
      {openOther && !openOther.url && openOther.kind === 'video' && (
        <Overlay onClose={() => setOpenOther(null)}>
          <p className="flex items-center gap-2 text-sm text-zinc-300"><AlertTriangle className="h-4 w-4 text-zinc-500" /> This video’s file is no longer available.</p>
        </Overlay>
      )}
    </div>
  );
}
