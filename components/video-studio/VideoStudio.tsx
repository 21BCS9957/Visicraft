'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronLeft, Clapperboard, Download, PanelLeftClose, PanelLeftOpen, Sparkles, User, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import { readNdjson } from '@/lib/ndjson';
import { parseVideoStyle } from '@/lib/videoStyles';
import { cssAspect, isWideAspect, upgradeModelFor, videoCredits, videoQualityLabel, type FinalQuality, type VideoAspect } from '@/lib/videoModels';
import { downloadUrl, PlaygroundApiError, playgroundApi } from '@/lib/playground/api';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundProject, VideoProjectProduct } from '@/lib/playground/types';
import { pollVideoOperation, videoApi, VideoApiError, type PollReport, type StartedRender } from '@/lib/video/client';
import { isVideoPreviewRequested, PREVIEW_CLIP, previewHistory, previewPlanEvents, previewReview, previewVideoProject } from '@/lib/video/preview';
import { readVideoReview, studioVideoStatus, videoModelName, type FrameSource, type StudioVideo, type VideoInfo, type VideoReviewState, type VideoTake } from '@/lib/video/shared';
import { initialStages, PipelineTimeline, VIDEO_STAGES, type StageId, type StageState, type StageStatus } from '@/components/ui/PipelineTimeline';
import { cx } from '@/components/playground/ui';
import { GuidelinesEditor } from '@/components/playground/GuidelinesEditor';
import { EMPTY_PRODUCT, NewVideoPanel, type PlanRequest, type VideoChoices } from './NewVideoPanel';
import { ReviewCard, type ReviewEdits } from './ReviewCard';
import { ImageViewer } from '@/components/shared/ImageViewer';
import { VideoHistory } from './VideoHistory';
import { VideoPlayerCard } from './VideoPlayerCard';
import { choicesFrom, pickerModel } from './VideoSettings';

const TOAST = { position: 'top-center' as const };

const noSubscribe = () => () => {};
function useVideoPreview(): boolean {
  return useSyncExternalStore(noSubscribe, isVideoPreviewRequested, () => false);
}

/** The run started on this page: the planning pipeline, then the video it prepared. */
interface LiveJob {
  status: 'planning' | 'review' | 'rendering' | 'done' | 'failed';
  stages: Record<string, StageState>;
  message: string;
  heroUrl: string | null;
  videoId: string | null;
  error: string | null;
  collapsed: boolean;
  title: string | null;
  /** The shape the video is planned in (the hero frame is made in it). */
  aspectRatio: VideoAspect;
}

function withStage(job: LiveJob, id: StageId, status: StageStatus, detail?: string, data?: Record<string, unknown>): LiveJob {
  const previous = job.stages[id] ?? { id, status: 'pending' as StageStatus };
  const now = Date.now();
  return {
    ...job,
    stages: {
      ...job.stages,
      [id]: {
        ...previous,
        status,
        detail: detail ?? previous.detail,
        data: data ? { ...(previous.data ?? {}), ...data } : previous.data,
        startedAt: previous.startedAt ?? (status !== 'pending' ? now : undefined),
        finishedAt: status === 'done' || status === 'failed' || status === 'skipped' ? now : undefined,
      },
    },
  };
}

/** Marks whatever stage was running as failed. */
function failJob(job: LiveJob, message: string): LiveJob {
  const active = Object.values(job.stages).find((stage) => stage.status === 'active');
  const next = active ? withStage(job, active.id, 'failed', message) : job;
  return { ...next, status: 'failed', error: message };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    }, { once: true });
  });
}

/** Dev preview: a render that "finishes" in a few seconds. */
async function simulateRender(signal: AbortSignal, report: (update: PollReport) => void): Promise<{ url: string; video: VideoInfo | null }> {
  for (let progress = 12; progress < 100; progress += 17) {
    await sleep(1300, signal);
    report({ progress, message: `Rendering… ${progress}%` });
  }
  return { url: PREVIEW_CLIP, video: null };
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const obj = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined);

/** Project names given by the Videos hub, replaced by the product's name once it is read. */
export function isPlaceholderName(name: string): boolean {
  return /^(Video · .+|Untitled project|New video project)$/.test(name.trim());
}

function ProjectName({ project, onRename }: { project: PlaygroundProject; onRename: (name: string) => void }) {
  return <ProjectNameInput key={`${project.id}:${project.name}`} initial={project.name} onRename={onRename} />;
}

function ProjectNameInput({ initial, onRename }: { initial: string; onRename: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <input
      value={name}
      maxLength={120}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => {
        const next = name.trim();
        if (!next) return setName(initial);
        if (next !== initial) onRename(next);
      }}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      aria-label="Project name"
      className="w-full min-w-0 max-w-[420px] truncate rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-white outline-none transition-colors hover:border-white/10 focus:border-white/15 focus:bg-white/[0.04]"
    />
  );
}

function Topbar({ preview, project, onRename, panelOpen, onTogglePanel }: {
  preview: boolean;
  project: PlaygroundProject | null;
  onRename: (name: string) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { user } = useAuth();
  const { credits } = useCredits();
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0a0a0d]/90 px-3 backdrop-blur-xl sm:px-4">
      <Link href="/" title="GoGrowth home" className="flex shrink-0 items-center rounded-full p-1 hover:bg-white/7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gogrowth-mark.png" alt="GoGrowth" className="h-7 w-7 object-contain" />
      </Link>
      <Link href={`/playground/video${preview ? '?previewVideoStudio=1' : ''}`} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm text-white/55 hover:bg-white/7 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> <Clapperboard className="h-4 w-4 text-[#fff05a] sm:hidden" /><span className="hidden sm:inline">Videos</span>
      </Link>
      <span className="hidden text-white/20 sm:inline">/</span>
      {project ? <ProjectName project={project} onRename={onRename} /> : <span className="px-2 text-sm text-white/60">Video project</span>}
      <button
        type="button"
        onClick={onTogglePanel}
        title={panelOpen ? 'Hide New video' : 'Show New video'}
        aria-label={panelOpen ? 'Hide New video' : 'Show New video'}
        className="ml-1 hidden shrink-0 rounded-full p-2 text-white/55 hover:bg-white/7 hover:text-white lg:inline-flex"
      >
        {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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

function Welcome() {
  const steps = [
    ['Add your product', 'A store link, or your own photos'],
    ['We plan it', 'Claude writes the prompt'],
    ['You approve', 'The frames and the exact prompt, editable'],
    ['It renders', 'Try a cheap draft, then upgrade the one you like'],
  ];
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#111114] p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,240,90,0.10),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(188,168,255,0.10),transparent_45%)]" />
      <div className="relative">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">Video Studio</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-light leading-tight text-white sm:text-4xl">Video ads from your product, approved by you before they render.</h1>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map(([title, text], index) => (
            <li key={title} className="rounded-2xl border border-white/8 bg-black/25 p-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fff05a] text-xs font-medium text-black">{index + 1}</span>
              <p className="mt-3 text-sm text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function JobCard({ job, preview }: { job: LiveJob; preview: boolean }) {
  const failed = job.status === 'failed';
  return (
    <div className="flex flex-col gap-5 rounded-[24px] border border-white/10 bg-[#111114] p-5 sm:flex-row">
      <div className={cx('relative mx-auto shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40 sm:mx-0', isWideAspect(job.aspectRatio) ? 'w-64' : 'w-40')} style={{ aspectRatio: cssAspect(job.aspectRatio) }}>
        {job.heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.heroUrl} alt="Hero frame" className="h-full w-full object-cover" style={{ animation: 'slotReveal 900ms cubic-bezier(0.2,0.8,0.2,1) both' }} />
        ) : (
          <div className={cx('h-full w-full bg-white/[0.03]', !failed && 'playground-shimmer')} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-light text-white">{failed ? 'Planning stopped' : 'Planning your video'}</p>
        {job.title && <p className="mt-0.5 truncate text-sm text-white/55">{job.title}</p>}
        <p className={cx('mt-3 text-sm leading-relaxed', failed ? 'text-red-300/90' : 'text-white/65')}>{failed ? job.error : job.message}</p>
        {!failed && (
          <p className="mt-3 text-xs leading-relaxed text-white/40">
            Nothing renders yet. When the plan is ready you’ll see the frames and the exact prompt, and the video is charged only when you approve it.
          </p>
        )}
        {failed && job.heroUrl && (
          <a
            href={preview ? job.heroUrl : downloadUrl(job.heroUrl, 'visicraft-hero-frame.jpg')}
            download="visicraft-hero-frame.jpg"
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-4 text-xs text-white/80 hover:bg-white/8"
          >
            <Download className="h-3.5 w-3.5" /> Download the hero frame
          </a>
        )}
      </div>
    </div>
  );
}

export function VideoStudio({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { credits, loading: creditsLoading, refreshCredits } = useCredits();
  const preview = useVideoPreview();
  const initialUrl = useSearchParams().get('url');
  // The project lives in the Playground store, so the Guidelines editor works on it as in image projects.
  const project = usePlaygroundStore((state) => (state.projectId === projectId ? state.project : null));
  const resetStore = usePlaygroundStore((state) => state.reset);
  const loadBundle = usePlaygroundStore((state) => state.loadBundle);
  const setStoreProject = usePlaygroundStore((state) => state.setProject);
  const [failure, setFailure] = useState<string | null>(null);
  const pendingSave = useRef<{ product?: VideoProjectProduct; video?: VideoChoices; name?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videos, setVideos] = useState<StudioVideo[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [job, setJob] = useState<LiveJob | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ url: string; box?: FrameSource['box'] } | null>(null);
  // A finished take open for small changes, to make a new draft of the same video.
  const [redrafting, setRedrafting] = useState<{ videoId: string; take: VideoTake } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<boolean | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const polling = useRef(new Map<string, AbortController>());

  const signedOut = !preview && !authLoading && !user;
  const balance = preview || creditsLoading ? null : credits;
  const planning = job?.status === 'planning';
  const selected = videos?.find((video) => video.id === selectedId) ?? null;
  const showJob = Boolean(job && (!selected || selected.id === job.videoId));
  const mobileOpen = mobilePanel ?? (!job && !selected);

  // The project and its videos: loaded once per visit; everything after that happens on this page.
  useEffect(() => {
    if (signedOut || (!preview && authLoading)) return;
    let cancelled = false;
    (async () => {
      try {
        const bundle = preview
          ? await Promise.resolve({ project: previewVideoProject(projectId), references: [], runs: [], items: [], nextBefore: null, refunded: 0 })
          : await playgroundApi.getProject(projectId);
        if (cancelled) return;
        if (bundle.project.kind !== 'video') {
          router.replace(`/playground/${projectId}`);
          return;
        }
        resetStore(projectId, preview);
        loadBundle(bundle);
        const page = preview ? await Promise.resolve({ videos: previewHistory(), nextBefore: null }) : await videoApi.history({ projectId });
        if (cancelled) return;
        setVideos(page.videos);
        setNextBefore(page.nextBefore);
      } catch (error) {
        if (cancelled) return;
        setFailure(error instanceof PlaygroundApiError || error instanceof Error ? error.message : 'Could not open the project.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, preview, signedOut, authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saves waiting to go out are sent before the page closes or another project opens.
  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = pendingSave.current;
    pendingSave.current = null;
    if (!pending || preview) return;
    const settings = {
      ...(pending.product ? { product: pending.product } : {}),
      ...(pending.video ? { video: pending.video } : {}),
    };
    void playgroundApi.updateProject(projectId, {
      ...(pending.name ? { name: pending.name } : {}),
      ...(pending.product || pending.video ? { settings } : {}),
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not save the project', TOAST));
  }, [projectId, preview]);

  useEffect(() => {
    window.addEventListener('beforeunload', flushSave);
    return () => {
      window.removeEventListener('beforeunload', flushSave);
      flushSave();
    };
  }, [flushSave]);

  const saveProject = (patch: { product?: VideoProjectProduct; video?: VideoChoices; name?: string }) => {
    const current = usePlaygroundStore.getState().project;
    if (!current) return;
    setStoreProject({
      ...current,
      ...(patch.name ? { name: patch.name } : {}),
      settings: {
        ...current.settings,
        ...(patch.product ? { product: patch.product } : {}),
        ...(patch.video ? { video: patch.video } : {}),
      },
    });
    pendingSave.current = { ...pendingSave.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 700);
  };

  const product = project?.settings.product ?? EMPTY_PRODUCT;
  const choices = choicesFrom(project?.settings.video);
  const onProduct = (next: VideoProjectProduct) => {
    // A new project is named after its product once the product is read.
    const current = usePlaygroundStore.getState().project;
    const title = next.title?.trim() || next.name.trim();
    const rename = current && title && isPlaceholderName(current.name) ? title.slice(0, 120) : undefined;
    saveProject({ product: next, ...(rename ? { name: rename } : {}) });
  };
  const onChoices = (patch: Partial<VideoChoices>) => {
    const next = { ...choicesFrom(usePlaygroundStore.getState().project?.settings.video), ...patch };
    // Length and quality follow what a newly picked engine renders.
    saveProject({ video: choicesFrom(next) });
  };

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await videoApi.history({ before: nextBefore, projectId });
      setVideos((current) => [...(current ?? []), ...page.videos.filter((video) => !current?.some((known) => known.id === video.id))]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load older videos', TOAST);
    } finally {
      setLoadingMore(false);
    }
  };

  const patchTake = useCallback((operationId: string, patch: Partial<VideoTake>) => {
    setVideos((current) => current?.map((video) => (video.takes.some((take) => take.operationId === operationId)
      ? { ...video, takes: video.takes.map((take) => (take.operationId === operationId ? { ...take, ...patch } : take)) }
      : video)) ?? current);
  }, []);

  const stage = useCallback((id: StageId, status: StageStatus, detail?: string, data?: Record<string, unknown>) => {
    setJob((current) => (current ? withStage(current, id, status, detail, data) : current));
  }, []);

  // Follows one render until it has a file (or fails and is refunded), including a retry take.
  const track = useCallback(async (operationId: string, videoId: string, controller: AbortController) => {
    let current = operationId;
    const report = (update: PollReport) => {
      if (update.retry) {
        const next = update.retry.operationId;
        polling.current.set(next, controller);
        patchTake(current, { operationId: next, progress: 5, message: update.retry.message, ...(update.retry.video ?? {}) });
        current = next;
        setJob((job) => (job?.videoId === videoId ? withStage(job, 'render', 'active', update.retry!.message) : job));
        return;
      }
      patchTake(current, { progress: update.progress, message: update.message });
    };
    try {
      const done = preview
        ? await simulateRender(controller.signal, report)
        : await pollVideoOperation(operationId, report, controller.signal);
      patchTake(current, { status: 'ready', url: done.url, progress: 100, message: 'Ready', ...(done.video ?? {}) });
      setJob((job) => (job?.videoId === videoId
        ? { ...withStage(withStage(job, 'render', 'done', 'Video ready'), 'done', 'done', 'Video ready'), status: 'done', collapsed: true }
        : job));
      toast.success('Your video is ready', TOAST);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'The video did not render.';
      patchTake(current, { status: 'failed', error: message });
      setJob((job) => (job?.videoId === videoId ? failJob(withStage(job, 'render', 'failed', message), message) : job));
      toast.error(message, { ...TOAST, duration: 8000 });
      if (!preview) void refreshCredits();
    } finally {
      for (const [id, owner] of polling.current) if (owner === controller) polling.current.delete(id);
    }
  }, [preview, patchTake, refreshCredits]);

  // Every render still in progress is followed, including ones started before this visit.
  useEffect(() => {
    for (const video of videos ?? []) {
      for (const take of video.takes) {
        if (take.status !== 'rendering' || polling.current.has(take.operationId)) continue;
        const controller = new AbortController();
        polling.current.set(take.operationId, controller);
        void track(take.operationId, video.id, controller);
      }
    }
  }, [videos, track]);

  useEffect(() => {
    const active = polling.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, []);

  const showStage = () => window.setTimeout(() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

  const plan = async (request: PlanRequest) => {
    if (planning) return;
    if (!preview && !user) {
      toast.error('Sign in to make videos', TOAST);
      return;
    }
    const now = Date.now();
    const capture: StageState = {
      id: 'capture',
      status: 'done',
      detail: request.title ?? `${request.referenceImages.length} photo${request.referenceImages.length === 1 ? '' : 's'}`,
      startedAt: now,
      finishedAt: now,
      data: { title: request.title ?? undefined, brand: request.productContext?.vendor, images: request.referenceImages },
    };
    const understand: StageState = { id: 'understand', status: 'active', detail: 'Reading the product', startedAt: now };
    setJob({ status: 'planning', stages: { ...initialStages(VIDEO_STAGES), capture, understand }, message: 'Reading the product…', heroUrl: null, videoId: null, error: null, collapsed: false, title: request.title, aspectRatio: request.choices.aspectRatio });
    setSelectedId(null);
    setMobilePanel(false);
    showStage();

    let finished = false;
    let hero: string | null = null;
    const onEvent = (event: Record<string, unknown>) => {
      switch (event.type) {
        case 'stage':
          if (typeof event.id === 'string') stage(event.id as StageId, event.status as StageStatus, str(event.detail), obj(event.data));
          break;
        case 'status':
          if (typeof event.message === 'string') setJob((job) => job && { ...job, message: event.message as string });
          break;
        case 'notice':
          if (typeof event.message === 'string') toast.info(event.message, { ...TOAST, duration: 8000 });
          break;
        case 'creative':
          if (typeof event.url === 'string') {
            hero = event.url;
            setJob((job) => job && { ...job, heroUrl: hero });
          }
          break;
        case 'video_review': {
          const review = readVideoReview(event.reviewId, event.review);
          if (!review) break;
          const video: StudioVideo = {
            id: review.id,
            createdAt: new Date().toISOString(),
            title: request.title,
            style: request.choices.style,
            poster: hero ?? review.frames[0]?.url ?? null,
            review,
            cancelled: false,
            prompt: review.prompt,
            settings: { model: request.choices.model, quality: request.choices.quality, durationSeconds: request.choices.duration, aspectRatio: review.aspectRatio, style: request.choices.style },
            takes: [],
          };
          setVideos((current) => [video, ...(current ?? []).filter((known) => known.id !== video.id)]);
          setSelectedId(video.id);
          // The approval card is the focus now; the steps stay one tap away.
          setJob((job) => job && { ...job, videoId: video.id, status: 'review', collapsed: true });
          break;
        }
        case 'done': {
          finished = true;
          const warning = str(event.warning);
          if (event.reviewId) {
            if (warning) toast.info(warning, { ...TOAST, duration: 8000 });
            break;
          }
          if (!(Number(event.acceptedCount) > 0)) throw new Error(warning ?? 'The hero frame could not be made. Your credits were refunded.');
          // A hero frame but no video to review (the engine isn't set up, or the model refused).
          const message = warning ?? 'The video could not be prepared for review.';
          setJob((job) => job && failJob(withStage(job, 'done', 'failed', message), message));
          toast.error(message, { ...TOAST, duration: 8000 });
          break;
        }
        case 'error':
          throw new Error(str(event.message) ?? 'Planning failed');
      }
    };

    try {
      if (preview) {
        for (const step of previewPlanEvents(`preview-${now}`, request.choices.aspectRatio)) {
          await sleep(step.after);
          onEvent(step.event);
        }
      } else {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 295_000);
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: await getAuthenticatedHeaders({ 'Content-Type': 'application/json' }),
            signal: controller.signal,
            body: JSON.stringify({
              mode: 'generate',
              referenceImages: request.referenceImages,
              prompt: request.notes,
              creativeSet: true,
              aspectRatio: request.choices.aspectRatio,
              resolution: '2K',
              model: 'nano-banana-pro',
              productContext: request.productContext ?? undefined,
              referenceVideoIds: request.referenceVideoIds.length ? request.referenceVideoIds : undefined,
              videoAd: true,
              videoStyle: request.choices.style,
              videoModel: request.choices.model,
              videoDuration: request.choices.duration,
              videoQuality: request.choices.quality,
              videoAspectRatio: request.choices.aspectRatio,
              projectId,
            }),
          });
          if (!response.ok || !response.body) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Planning could not start');
          }
          await readNdjson(response.body, onEvent);
        } finally {
          window.clearTimeout(timer);
        }
      }
      if (!finished) throw new Error('Planning stopped before it finished. Check Your videos before trying again.');
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Planning is taking longer than expected. Check Your videos before trying again, so you don’t pay twice.'
        : error instanceof Error ? error.message : 'Planning failed';
      setJob((job) => job && failJob(job, message));
      toast.error(message, { ...TOAST, duration: 8000 });
    } finally {
      if (!preview) void refreshCredits();
    }
  };

  const approve = async (video: StudioVideo, edits: ReviewEdits) => {
    const review = video.review;
    if (!review || busyId) return;
    setBusyId(video.id);
    try {
      const started: StartedRender = preview
        ? { operationId: `preview-op-${Date.now()}`, video: null }
        : await videoApi.approve(video.id, edits);
      if (started.notice) toast.info(started.notice, { ...TOAST, duration: 8000 });
      const model = started.video?.model ?? review.model;
      const seconds = edits.durationSeconds ?? review.durationSeconds;
      const take: VideoTake = {
        key: video.id,
        operationId: started.operationId,
        status: 'rendering',
        url: null,
        model,
        quality: started.video?.quality ?? review.quality,
        durationSeconds: started.video?.durationSeconds ?? seconds,
        aspectRatio: review.aspectRatio,
        nativeDraft: started.video?.nativeDraft ?? false,
        credits: seconds === review.durationSeconds ? review.credits : videoCredits(review.model, review.quality, seconds, review.aspectRatio),
        error: null,
        createdAt: new Date().toISOString(),
        progress: 5,
        message: `Rendering with ${videoModelName(model)}…`,
      };
      setVideos((current) => current?.map((known) => (known.id === video.id ? { ...known, review: null, prompt: edits.prompt, takes: [take] } : known)) ?? current);
      setJob((job) => (job?.videoId === video.id
        ? { ...withStage(withStage(job, 'review', 'done', edits.prompt.trim() !== review.prompt.trim() ? 'Approved with your edits' : 'Approved'), 'render', 'active', `Rendering with ${videoModelName(model)}`), status: 'rendering' }
        : job));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The video could not be started', { ...TOAST, duration: 7000 });
      // Approved or cancelled somewhere else: show what the server has now.
      if (error instanceof VideoApiError && error.status === 409) {
        const page = await videoApi.history({ projectId }).catch(() => null);
        if (page) setVideos((current) => {
          const fresh = page.videos.find((known) => known.id === video.id);
          return fresh ? current?.map((known) => (known.id === video.id ? fresh : known)) ?? current : current;
        });
      }
    } finally {
      setBusyId(null);
      if (!preview) void refreshCredits();
    }
  };

  const cancel = async (video: StudioVideo) => {
    if (!video.review || busyId) return;
    setBusyId(video.id);
    try {
      if (!preview) await videoApi.cancel(video.id);
      setVideos((current) => current?.map((known) => (known.id === video.id ? { ...known, review: null, cancelled: true } : known)) ?? current);
      setJob((job) => (job?.videoId === video.id
        ? { ...withStage(withStage(withStage(job, 'review', 'skipped', 'Cancelled'), 'render', 'skipped', 'Cancelled'), 'done', 'done', 'Hero frame kept'), status: 'done', collapsed: true }
        : job));
      toast.info('Video cancelled. Nothing was charged for it.', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel the video. Try again.', TOAST);
    } finally {
      setBusyId(null);
    }
  };

  const upgrade = async (video: StudioVideo, take: VideoTake, quality: FinalQuality) => {
    if (busyId) return;
    const cost = videoCredits(upgradeModelFor(take.model), quality, take.durationSeconds, take.aspectRatio);
    if (balance !== null && balance < cost) {
      toast.error(`This upgrade needs ${cost} credits; you have ${balance}.`, TOAST);
      return;
    }
    setBusyId(video.id);
    try {
      const started: StartedRender = preview
        ? { operationId: `preview-up-${Date.now()}`, video: null }
        : await videoApi.upgrade(take.operationId, quality);
      if (started.notice) toast.info(started.notice, { ...TOAST, duration: 8000 });
      const label = videoQualityLabel(quality);
      const next: VideoTake = {
        key: `op:${started.operationId}`,
        operationId: started.operationId,
        status: 'rendering',
        url: null,
        model: started.video?.model ?? upgradeModelFor(take.model),
        quality: started.video?.quality ?? quality,
        durationSeconds: started.video?.durationSeconds ?? take.durationSeconds,
        aspectRatio: take.aspectRatio,
        nativeDraft: false,
        credits: cost,
        error: null,
        createdAt: new Date().toISOString(),
        progress: 5,
        message: `Rendering the ${label} version…`,
        prompt: take.prompt,
        frames: take.frames,
        from: take.operationId,
      };
      setVideos((current) => current?.map((known) => (known.id === video.id ? { ...known, takes: [...known.takes, next] } : known)) ?? current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upgrade could not start', { ...TOAST, duration: 7000 });
    } finally {
      setBusyId(null);
      if (!preview) void refreshCredits();
    }
  };

  /** The editor for a new draft: the take's own images and prompt, priced as a draft. */
  const redraftReview = (video: StudioVideo, take: VideoTake): VideoReviewState => {
    const known = new Map((video.plan?.frames ?? []).map((frame) => [frame.url, frame]));
    const urls = take.frames?.length ? take.frames : (video.plan?.frames ?? []).map((frame) => frame.url);
    return {
      id: `redraft:${take.key}`,
      model: take.model,
      quality: 'draft',
      durationSeconds: take.durationSeconds,
      aspectRatio: take.aspectRatio,
      mode: video.plan?.mode ?? (urls.length > 1 ? 'reference' : 'first_frame'),
      frames: urls.map((url) => known.get(url) ?? { url, label: 'Your upload', kind: 'photo' as const }),
      prompt: take.prompt ?? video.prompt ?? '',
      credits: videoCredits(take.model, 'draft', take.durationSeconds, take.aspectRatio),
      garment: video.plan?.garment,
      notes: ['This makes a new draft of the same video with your changes. The take you were watching stays, and you can upgrade whichever draft you like.'],
      referenceVideos: [],
      outline: null,
    };
  };

  /** Renders the edited take as a new draft of the same video. */
  const startRedraft = async (video: StudioVideo, take: VideoTake, edits: ReviewEdits) => {
    if (busyId) return;
    const seconds = edits.durationSeconds ?? take.durationSeconds;
    const cost = videoCredits(take.model, 'draft', seconds, take.aspectRatio);
    if (balance !== null && balance < cost) {
      toast.error(`A new draft needs ${cost} credits; you have ${balance}.`, TOAST);
      return;
    }
    setBusyId(video.id);
    try {
      const started: StartedRender = preview
        ? { operationId: `preview-redraft-${Date.now()}`, video: null }
        : await videoApi.redraft(take.operationId, edits);
      if (started.notice) toast.info(started.notice, { ...TOAST, duration: 8000 });
      const next: VideoTake = {
        key: `op:${started.operationId}`,
        operationId: started.operationId,
        status: 'rendering',
        url: null,
        model: started.video?.model ?? take.model,
        quality: started.video?.quality ?? 'draft',
        durationSeconds: started.video?.durationSeconds ?? seconds,
        aspectRatio: take.aspectRatio,
        nativeDraft: started.video?.nativeDraft ?? take.nativeDraft,
        credits: cost,
        error: null,
        createdAt: new Date().toISOString(),
        progress: 5,
        message: 'Rendering your new draft…',
        prompt: edits.prompt,
        frames: edits.frames,
        edited: true,
        from: take.operationId,
      };
      setVideos((current) => current?.map((known) => (known.id === video.id ? { ...known, prompt: edits.prompt, takes: [...known.takes, next] } : known)) ?? current);
      setRedrafting(null);
      toast.success('Making your new draft', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The new draft could not start', { ...TOAST, duration: 7000 });
    } finally {
      setBusyId(null);
      if (!preview) void refreshCredits();
    }
  };

  /** A video that didn't render: its approved plan comes back for approval as a new video. */
  const tryAgain = async (video: StudioVideo) => {
    if (busyId) return;
    setBusyId(video.id);
    try {
      const { reviewId, review: raw } = preview
        ? { reviewId: `preview-again-${Date.now()}`, review: { ...previewReview('preview-again'), notes: ['The last take was stopped by Seedance’s music check (its music sounded like an existing song), so this one has no music. You can describe music again in the prompt.'] } }
        : await videoApi.again(video.id);
      const review = readVideoReview(reviewId, raw);
      if (!review) throw new Error('The video could not be prepared again.');
      const next: StudioVideo = {
        ...video,
        id: review.id,
        createdAt: new Date().toISOString(),
        review,
        cancelled: false,
        prompt: review.prompt,
        takes: [],
        retryable: false,
      };
      setVideos((current) => [next, ...(current ?? [])]);
      setSelectedId(next.id);
      showStage();
      toast.success('Ready for your approval', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The video could not be prepared again', { ...TOAST, duration: 7000 });
    } finally {
      setBusyId(null);
    }
  };

  const reuse = (video: StudioVideo) => {
    onChoices({
      model: pickerModel(video.settings.model),
      duration: video.settings.durationSeconds,
      quality: video.settings.quality,
      aspectRatio: video.settings.aspectRatio,
      style: parseVideoStyle(video.settings.style) ?? 'any',
    });
    setPanelOpen(true);
    setMobilePanel(true);
    toast.success('Settings loaded into New video', TOAST);
  };

  const open = (video: StudioVideo) => {
    setSelectedId(video.id);
    setRedrafting(null);
    setMobilePanel(false);
    showStage();
  };

  if (signedOut || failure) {
    return (
      <div className="flex h-dvh flex-col bg-[#08080a] text-white">
        <Topbar preview={preview} project={null} onRename={() => undefined} panelOpen={false} onTogglePanel={() => undefined} />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="text-xl font-light text-white">{failure ? "The project couldn't be opened" : 'Sign in to use the Video Studio'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{failure ?? 'Your video projects, drafts and upgrades are saved to your account.'}</p>
            {failure ? (
              <Link href="/playground/video" className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm text-white hover:bg-white/8">Back to video projects</Link>
            ) : (
              <Link href={`/login?redirectTo=/playground/video/${projectId}`} className="mt-6 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">Sign in</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-dvh flex-col bg-[#08080a] text-white">
        <Topbar preview={preview} project={null} onRename={() => undefined} panelOpen={false} onTogglePanel={() => undefined} />
        <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Opening the project">
          <div className="hidden w-[360px] shrink-0 space-y-4 border-r border-white/8 bg-[#0c0c0f]/80 p-4 lg:block">
            <div className="h-4 w-32 rounded bg-white/8" />
            <div className="h-11 rounded-2xl border border-white/10" />
            <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="playground-shimmer aspect-square rounded-lg bg-white/[0.04]" />)}</div>
            <div className="h-40 rounded-xl bg-white/[0.03]" />
          </div>
          <div className="min-w-0 flex-1 space-y-4 px-6 pt-6">
            <div className="h-4 w-48 rounded bg-white/8" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="playground-shimmer aspect-[9/16] rounded-[18px] border border-white/6 bg-white/[0.03]" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedStatus = selected ? studioVideoStatus(selected) : null;

  return (
    <div className="flex h-dvh flex-col bg-[#08080a] text-white">
      <Topbar preview={preview} project={project} onRename={(name) => saveProject({ name })} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((value) => !value)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <button
          type="button"
          onClick={() => setMobilePanel(!mobileOpen)}
          aria-expanded={mobileOpen}
          className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3 text-sm text-white/80 lg:hidden"
        >
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#fff05a]" /> New video</span>
          <ChevronDown className={cx('h-4 w-4 text-white/45 transition-transform', mobileOpen && 'rotate-180')} />
        </button>
        <aside className={cx('shrink-0 border-white/8 bg-[#0c0c0f]/80 lg:w-[360px] lg:overflow-y-auto lg:border-r', !mobileOpen && 'max-lg:hidden', !panelOpen && 'lg:hidden')}>
          <NewVideoPanel
            busy={planning}
            preview={preview}
            signedIn={Boolean(user)}
            credits={credits}
            initialUrl={initialUrl}
            product={product}
            onProduct={onProduct}
            choices={choices}
            onChoices={onChoices}
            guidelines={<GuidelinesEditor compact emptyHint="Brand rules, product facts, tone, dos and don’ts, or how to write shots" />}
            cardOpen={Boolean(selected?.review) || (redrafting !== null && redrafting.videoId === selected?.id)}
            onPlan={(request) => void plan(request)}
          />
        </aside>

        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-5 sm:px-6 lg:py-6">
            <div ref={stageRef} className="scroll-mt-4" />
            {!job && !selected && videos !== null && videos.length === 0 && <Welcome />}

            {(selected || job) && (
              <section className={cx('grid items-start gap-5', showJob && job && 'xl:grid-cols-[minmax(0,1fr)_380px]')}>
                <div className="min-w-0 space-y-3">
                  {selected ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
                          {selectedStatus === 'review' ? '' : selectedStatus === 'rendering' ? 'Rendering' : 'Video'}
                        </p>
                        <div className="flex items-center gap-2">
                          {job?.status === 'planning' && job.videoId !== selected.id && (
                            <button type="button" onClick={() => setSelectedId(null)} className="rounded-full border border-[#fff05a]/30 px-3 py-1 text-[11px] text-[#fff05a] hover:bg-[#fff05a]/10">
                              Back to the video being planned
                            </button>
                          )}
                          <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" title="Close" className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {selected.review ? (
                        <ReviewCard
                          key={selected.review.id}
                          review={selected.review}
                          busy={busyId === selected.id}
                          credits={balance}
                          projectId={projectId}
                          preview={preview}
                          onApprove={(edits) => void approve(selected, edits)}
                          onCancel={() => void cancel(selected)}
                          onView={(url, box) => setViewing({ url, box })}
                        />
                      ) : redrafting?.videoId === selected.id ? (
                        <ReviewCard
                          key={`redraft-${redrafting.take.key}`}
                          review={redraftReview(selected, redrafting.take)}
                          redraft
                          busy={busyId === selected.id}
                          credits={balance}
                          projectId={projectId}
                          preview={preview}
                          onApprove={(edits) => void startRedraft(selected, redrafting.take, edits)}
                          onCancel={() => setRedrafting(null)}
                          onView={(url, box) => setViewing({ url, box })}
                        />
                      ) : (
                        <VideoPlayerCard
                          key={selected.id}
                          video={selected}
                          preview={preview}
                          busy={busyId === selected.id}
                          credits={balance}
                          onUpgrade={(take, quality) => void upgrade(selected, take, quality)}
                          onReuse={() => reuse(selected)}
                          onTryAgain={() => void tryAgain(selected)}
                          onRedraft={(take) => setRedrafting({ videoId: selected.id, take })}
                        />
                      )}
                    </>
                  ) : job ? (
                    <JobCard job={job} preview={preview} />
                  ) : null}
                </div>
                {showJob && job && (
                  <PipelineTimeline
                    order={VIDEO_STAGES}
                    stages={job.stages}
                    collapsed={job.collapsed}
                    onToggleCollapsed={() => setJob((current) => current && { ...current, collapsed: !current.collapsed })}
                  />
                )}
              </section>
            )}

            <VideoHistory
              videos={videos}
              selectedId={selectedId}
              preview={preview}
              loadingMore={loadingMore}
              hasMore={Boolean(nextBefore)}
              onOpen={open}
              onReuse={reuse}
              onLoadMore={() => void loadMore()}
            />
          </div>
        </main>
      </div>
      {viewing && <ImageViewer url={viewing.url} box={viewing.box} onClose={() => setViewing(null)} />}
    </div>
  );
}
