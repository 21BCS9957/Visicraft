'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Clapperboard, FlaskConical, History, ImagePlus, LayoutGrid, Loader2, Sparkles, User, WandSparkles } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import type { ClientRef } from '@/lib/clients';
import { useAgencyClients } from '@/lib/playground/agencyClients';
import { uploadImages } from '@/lib/playground/upload';
import { videoApi, VideoApiError } from '@/lib/video/client';
import { motionPreset, type MotionPreset } from '@/lib/video/presets';
import { START_EXTEND_CREDITS } from '@/lib/video/startExtend';
import { previewHistory } from '@/lib/video/preview';
import { readVideoReview, type StudioVideo, type VideoTake } from '@/lib/video/shared';
import {
  normalizeVideoQuality, snapVideoDuration, upgradeModelFor, videoCredits, videoModelOptions, videoQualityLabel,
  type FinalQuality, type VideoAspect, type VideoQuality,
} from '@/lib/videoModels';
import { usePreviewFlag } from '@/components/playground/hooks';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { PlaygroundTabs } from '@/components/playground/PlaygroundTabs';
import { cx } from '@/components/playground/ui';
import { SHOW_PRICING } from '@/lib/siteSections';
import { ControlPanel, MAX_CREATE_IMAGES, MAX_CREATE_PROMPT, type CreateAspect, type ImageRole, type PanelImage } from './ControlPanel';
import { CreateHistory } from './CreateHistory';
import { CREATE_MODELS, createModel, type EngineState } from './ModelPicker';
import { PresetGallery } from './PresetGallery';
import { useVideoTracking } from './useVideoTracking';

const TOAST = { position: 'top-center' as const };
const CHOICES_KEY = 'visicraft:createVideo';

/** `extendTo`: the shape a Seedance 2.5 start image is extended to (null keeps the image's own). */
type Choices = { model: string; seconds: number; quality: VideoQuality; aspect: CreateAspect; extendTo: VideoAspect | null; preset: string; role: ImageRole; clientId: string | null };
const DEFAULT_CHOICES: Choices = { model: createModel(null).id, seconds: 8, quality: 'draft', aspect: '9:16', extendTo: null, preset: 'general', role: 'first_frame', clientId: null };

function readChoices(): Choices {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CHOICES_KEY) ?? '{}') as Partial<Choices>;
    return { ...DEFAULT_CHOICES, ...saved, model: createModel(saved.model).id };
  } catch {
    return DEFAULT_CHOICES;
  }
}

const titleOf = (prompt: string) => {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ');
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : words.join(' ');
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * The Create tab (/playground/create), Higgsfield-style: write a prompt, add images if you want,
 * pick Seedance or Veo and a motion preset, and Generate. The panel shows everything that is sent
 * and the price, so the video renders at once (no approval card); the history on the right fills
 * in as renders finish.
 */
export function CreatePage() {
  const preview = usePreviewFlag();
  const { user, loading: authLoading } = useAuth();
  const { credits: balanceRaw, loading: creditsLoading, refreshCredits } = useCredits();
  const balance = preview ? 9999 : creditsLoading ? null : balanceRaw;
  const signedOut = !preview && !authLoading && !user;

  const [choices, setChoices] = useState<Choices>(DEFAULT_CHOICES);
  const [prompt, setPrompt] = useState('');
  const [undoPrompt, setUndoPrompt] = useState<string | null>(null);
  const [images, setImages] = useState<PanelImage[]>([]);
  const [uploading, setUploading] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [view, setView] = useState<'history' | 'presets'>('history');
  const [videos, setVideos] = useState<StudioVideo[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [engines, setEngines] = useState<EngineState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [faceBlock, setFaceBlock] = useState<string | null>(null);
  /** The video just started here, highlighted in the history until it is opened. */
  const [freshId, setFreshId] = useState<string | null>(null);
  const startedHere = useRef(new Set<string>());
  const videosRef = useRef<StudioVideo[] | null>(null);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const clientsEnabled = useAgencyClients((state) => state.enabled);
  const clientList = useAgencyClients((state) => state.clients);
  const loadClients = useAgencyClients((state) => state.load);

  // Remembered choices come after the first render (the server can't read them).
  useEffect(() => {
    const timer = window.setTimeout(() => setChoices(readChoices()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const choose = useCallback((patch: Partial<Choices>) => {
    setChoices((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(CHOICES_KEY, JSON.stringify(next));
      } catch {
        // Private mode: the choices last for this visit.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (preview || user) void loadClients();
  }, [preview, user, loadClients]);

  useEffect(() => {
    if (preview) {
      const timer = window.setTimeout(() => {
        setVideos(previewHistory().filter((video) => video.takes.length > 0 && !video.takes.some((take) => take.status === 'rendering')));
        setEngines({ seedance: { ready: true }, veo: { ready: true } });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (authLoading || !user) return;
    let active = true;
    videoApi.history({ surface: 'create' })
      .then((page) => {
        if (!active) return;
        setVideos(page.videos);
        setNextBefore(page.nextBefore);
      })
      .catch((error) => active && toast.error(error instanceof Error ? error.message : 'Could not load your videos', TOAST));
    videoApi.engines().then((state) => active && setEngines(state)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preview, authLoading, user]);

  useVideoTracking({
    videos,
    setVideos,
    preview,
    onReady: (videoId) => {
      const video = videosRef.current?.find((known) => known.id === videoId);
      const name = video?.title ? `“${video.title}”` : 'Your video';
      if (preview) toast.success(`${name} is ready (preview: a sample clip stands in for it)`, { ...TOAST, duration: 6000 });
      else if (startedHere.current.has(videoId)) toast.success(`${name} is ready`, TOAST);
      else toast.success(`${name}, started earlier, is ready`, TOAST);
    },
    onFailed: (message) => {
      toast.error(message, { ...TOAST, duration: 8000 });
      if (!preview) void refreshCredits();
    },
  });

  /* ------------------------------------------------------------------ derived */

  const model = createModel(choices.model);
  const veo = model.engine === 'veo';
  const options = videoModelOptions(model.id);
  const seconds = snapVideoDuration(model.id, choices.seconds);
  const quality = normalizeVideoQuality(model.id, choices.quality);
  const role: ImageRole = veo ? 'first_frame' : images.length > 1 ? 'reference' : choices.role;
  const canAuto = !veo && images.length === 1 && role === 'first_frame';
  // Seedance 2.5 keeps a start image's own shape, unless the image is extended to another one first;
  // otherwise the shape picked (Veo: 9:16 or 16:9).
  const extendTo = canAuto && choices.extendTo && options.aspectRatios.includes(choices.extendTo) ? choices.extendTo : null;
  const aspect: CreateAspect = canAuto
    ? extendTo ?? 'auto'
    : choices.aspect !== 'auto' && options.aspectRatios.includes(choices.aspect) ? choices.aspect : '9:16';
  const preset = motionPreset(choices.preset);
  const sentPrompt = preset.line ? `${prompt.trim()}\n\n${preset.line}` : prompt.trim();
  const price = videoCredits(model.id, quality, seconds, aspect === 'auto' ? '9:16' : aspect) + (extendTo ? START_EXTEND_CREDITS : 0);
  const client = clientList.find((known) => known.id === choices.clientId) ?? null;
  const engineState = engines?.[model.engine];

  const blocked = signedOut
    ? 'Sign in to make videos'
    : engineState && !engineState.ready
      ? engineState.reason ?? `${model.name} isn’t available right now.`
      : prompt.trim().length < 3
        ? 'Describe your video to generate it'
        : sentPrompt.length > MAX_CREATE_PROMPT
          ? `The prompt is too long with the preset’s line: keep it under ${MAX_CREATE_PROMPT.toLocaleString('en-IN')} characters.`
        : veo && !images.length
          ? 'Google Veo needs a start image'
          : uploading > 0
            ? 'Waiting for the images to upload…'
            : balance !== null && balance < price
              ? `This video needs ${price} credits; you have ${balance}.`
              : null;

  /* ------------------------------------------------------------------ images */

  const addFiles = async (files: File[]) => {
    const room = MAX_CREATE_IMAGES - images.length - uploading;
    const take = files.slice(0, Math.max(0, room));
    if (take.length < files.length) toast.info(`Up to ${MAX_CREATE_IMAGES} images; ${files.length - take.length} left out.`, TOAST);
    if (!take.length) return;
    setUploading((count) => count + take.length);
    try {
      const done = await uploadImages(take, { preview, onError: (message) => toast.error(message, TOAST) });
      setImages((current) => [...current, ...done.map((file) => ({ url: file.url, name: file.name }))].slice(0, MAX_CREATE_IMAGES));
      setFaceBlock(null);
    } finally {
      setUploading((count) => count - take.length);
    }
  };

  /* ---------------------------------------------------------------- generate */

  const generate = async () => {
    if (blocked || generating) return;
    setGenerating(true);
    setFaceBlock(null);
    let pending: string | null = null;
    let notice: string | null = null;
    try {
      const request = {
        prompt: sentPrompt,
        imageUrls: images.map((image) => image.url),
        imageRole: role,
        model: model.id,
        durationSeconds: seconds,
        quality,
        aspectRatio: aspect === 'auto' ? '9:16' : aspect,
        clientId: client?.id ?? null,
        surface: 'create' as const,
        ...(extendTo ? { reshape: 'extend' as const } : {}),
      };
      let video: StudioVideo;
      if (preview) {
        await sleep(extendTo ? 2000 : 600);
        video = {
          id: `preview-create-${Date.now()}`,
          createdAt: new Date().toISOString(),
          title: titleOf(prompt),
          style: null,
          poster: images[0]?.url ?? null,
          review: null,
          cancelled: false,
          prompt: sentPrompt,
          settings: { model: model.id, quality, durationSeconds: seconds, aspectRatio: aspect === 'auto' ? '9:16' : aspect, style: 'any' },
          takes: [],
        };
        video.takes = [{
          key: video.id, operationId: `preview-op-${Date.now()}`, status: 'rendering', url: null, model: model.id, quality, durationSeconds: seconds,
          aspectRatio: video.settings.aspectRatio, nativeDraft: quality === 'draft' && options.draft.native, credits: price, error: null,
          createdAt: video.createdAt, progress: 5, message: `Rendering with ${model.name}…`, prompt: sentPrompt, frames: request.imageUrls,
        }];
      } else {
        const { reviewId, review: raw } = await videoApi.quick(request);
        pending = reviewId;
        const review = readVideoReview(reviewId, raw);
        if (!review) throw new Error('The video could not be prepared.');
        const frames = review.frames.map((frame) => frame.url);
        // The panel was the review: render it now, as it was sent.
        const started = await videoApi.approve(reviewId, { prompt: review.prompt, frames, durationSeconds: review.durationSeconds });
        pending = null;
        notice = started.notice ?? review.notes.find((note) => /renders with|only the first|extended to/i.test(note)) ?? null;
        const take: VideoTake = {
          key: reviewId,
          operationId: started.operationId,
          status: 'rendering',
          url: null,
          model: started.video?.model ?? review.model,
          quality: started.video?.quality ?? review.quality,
          durationSeconds: started.video?.durationSeconds ?? review.durationSeconds,
          aspectRatio: review.aspectRatio,
          nativeDraft: started.video?.nativeDraft ?? false,
          credits: review.credits,
          error: null,
          createdAt: new Date().toISOString(),
          progress: 5,
          message: `Rendering with ${model.name}…`,
          prompt: review.prompt,
          frames,
        };
        video = {
          id: reviewId,
          createdAt: take.createdAt,
          title: titleOf(prompt),
          style: null,
          poster: review.frames[0]?.preview ?? review.frames[0]?.url ?? null,
          review: null,
          cancelled: false,
          prompt: review.prompt,
          settings: { model: review.model, quality: review.quality, durationSeconds: review.durationSeconds, aspectRatio: review.aspectRatio, style: 'any' },
          takes: [take],
          plan: { mode: review.mode, frames: review.frames },
        };
      }
      startedHere.current.add(video.id);
      setVideos((current) => [video, ...(current ?? [])]);
      setFreshId(video.id);
      setView('history');
      // The new card is first in the history: bring it into view (on a phone the history is below the panel).
      window.setTimeout(() => document.querySelector(`[data-video-id="${CSS.escape(video.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      const started = preview ? 'Preview: nothing is sent or charged; a sample clip will stand in.' : `Generating with ${model.name}. It’s the first card in your history.`;
      toast.success(notice ? `${started} ${notice}` : started, { ...TOAST, duration: notice ? 9000 : 5000 });
    } catch (error) {
      // Prepared but not started (credits, a refused submit): it doesn't wait for an approval nobody will give.
      if (pending) void videoApi.cancel(pending).catch(() => undefined);
      const message = error instanceof Error ? error.message : 'The video could not be started';
      if (error instanceof VideoApiError && error.status === 409 && /face/i.test(message) && !veo) setFaceBlock(message);
      else toast.error(message, { ...TOAST, duration: 9000 });
    } finally {
      setGenerating(false);
      if (!preview) void refreshCredits();
    }
  };

  const improve = async () => {
    if (improving || prompt.trim().length < 3) return;
    setImproving(true);
    const before = prompt;
    try {
      const result = preview
        ? await sleep(1200).then(() => ({
          prompt: `${seconds}-second ${aspect === '16:9' ? 'horizontal' : 'vertical'} video: warm, premium product ad.\nThe product is shown exactly as in Image 1, every colour and printed word unchanged.\nSetting: a sunlit marble counter with soft morning shadows.\nShot 1 (0-3 s): Close-up. A hand places the product in frame. Slow push-in.\nShot 2 (3-${seconds} s): Medium shot. The product turns slowly towards the camera. Gentle orbit.\nSound: (soft original acoustic guitar) <a light tap on marble>\nConstraints: no on-screen text, no logos, no extra products.`,
          summary: 'Your idea as a two-shot product film.',
        }))
        : await videoApi.enhance({
          idea: prompt,
          model: model.id,
          imageUrls: (veo ? images.slice(0, 1) : images).map((image) => image.url),
          imageRole: role,
          seconds,
          aspectRatio: aspect === 'auto' ? '9:16' : aspect,
          motion: preset.line || undefined,
        });
      setUndoPrompt(before);
      setPrompt(result.prompt);
      // The motion is in the new prompt now; adding it again would repeat it.
      if (preset.line) choose({ preset: 'general' });
      toast.success(result.summary, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be improved', TOAST);
    } finally {
      setImproving(false);
      if (!preview) void refreshCredits();
    }
  };

  /* ------------------------------------------------------------ history actions */

  const upgrade = async (video: StudioVideo, take: VideoTake, target: FinalQuality) => {
    if (busy) return;
    const cost = videoCredits(upgradeModelFor(take.model), target, take.durationSeconds, take.aspectRatio);
    if (balance !== null && balance < cost) {
      toast.error(`This upgrade needs ${cost} credits; you have ${balance}.`, TOAST);
      return;
    }
    setBusy(true);
    try {
      const started = preview ? { operationId: `preview-up-${Date.now()}`, video: null, notice: undefined } : await videoApi.upgrade(take.operationId, target);
      if (started.notice) toast.info(started.notice, { ...TOAST, duration: 8000 });
      const next: VideoTake = {
        key: `op:${started.operationId}`,
        operationId: started.operationId,
        status: 'rendering',
        url: null,
        model: started.video?.model ?? upgradeModelFor(take.model),
        quality: started.video?.quality ?? target,
        durationSeconds: started.video?.durationSeconds ?? take.durationSeconds,
        aspectRatio: take.aspectRatio,
        nativeDraft: false,
        credits: cost,
        error: null,
        createdAt: new Date().toISOString(),
        progress: 5,
        message: `Rendering the ${videoQualityLabel(target)} version…`,
        prompt: take.prompt,
        frames: take.frames,
        from: take.operationId,
      };
      setVideos((current) => current?.map((known) => (known.id === video.id ? { ...known, takes: [...known.takes, next] } : known)) ?? current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upgrade could not start', { ...TOAST, duration: 7000 });
    } finally {
      setBusy(false);
      if (!preview) void refreshCredits();
    }
  };

  /** A video that didn't render: the same prompt and images render again (music left out after a music-check stop). */
  const tryAgain = async (video: StudioVideo) => {
    if (busy || preview) return;
    setBusy(true);
    let pending: string | null = null;
    try {
      const { reviewId, review: raw } = await videoApi.again(video.id);
      pending = reviewId;
      const review = readVideoReview(reviewId, raw);
      if (!review) throw new Error('The video could not be prepared again.');
      const frames = review.frames.map((frame) => frame.url);
      const started = await videoApi.approve(reviewId, { prompt: review.prompt, frames, durationSeconds: review.durationSeconds });
      pending = null;
      const take: VideoTake = {
        key: reviewId, operationId: started.operationId, status: 'rendering', url: null, model: started.video?.model ?? review.model,
        quality: started.video?.quality ?? review.quality, durationSeconds: started.video?.durationSeconds ?? review.durationSeconds,
        aspectRatio: review.aspectRatio, nativeDraft: started.video?.nativeDraft ?? false, credits: review.credits, error: null,
        createdAt: new Date().toISOString(), progress: 5, message: 'Rendering again…', prompt: review.prompt, frames,
      };
      startedHere.current.add(reviewId);
      setVideos((current) => [{ ...video, id: reviewId, createdAt: take.createdAt, prompt: review.prompt, takes: [take], retryable: false, cancelled: false }, ...(current ?? [])]);
      setFreshId(reviewId);
    } catch (error) {
      if (pending) void videoApi.cancel(pending).catch(() => undefined);
      toast.error(error instanceof Error ? error.message : 'The video could not be tried again', { ...TOAST, duration: 7000 });
    } finally {
      setBusy(false);
      void refreshCredits();
    }
  };

  /** "Use these settings again": the prompt, images, model, length, quality and shape go back into the panel. */
  const reuse = (video: StudioVideo) => {
    setPrompt(video.prompt ?? '');
    setUndoPrompt(null);
    const frames = (video.plan?.frames ?? []).filter((frame) => frame.kind !== 'face').map((frame) => ({ url: frame.url, name: frame.label || 'Image' }));
    setImages(frames.slice(0, MAX_CREATE_IMAGES));
    choose({
      model: createModel(video.settings.model).id,
      seconds: video.settings.durationSeconds,
      quality: video.settings.quality,
      aspect: video.settings.aspectRatio,
      // An extended start image comes back as the image itself, already in its shape.
      extendTo: null,
      preset: 'general',
      role: video.plan?.mode === 'reference' ? 'reference' : 'first_frame',
    });
    setFaceBlock(null);
    toast.info('Settings loaded into the panel', TOAST);
  };

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore || preview) return;
    setLoadingMore(true);
    try {
      const page = await videoApi.history({ surface: 'create', before: nextBefore });
      setVideos((current) => [...(current ?? []), ...page.videos.filter((video) => !current?.some((known) => known.id === video.id))]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load older videos', TOAST);
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore, preview]);

  const pickPreset = (next: MotionPreset) => {
    choose({ preset: next.id, ...(next.seconds ? { seconds: snapVideoDuration(model.id, next.seconds) } : {}) });
    setView('history');
  };

  const changeModel = (id: string) => {
    const next = createModel(id);
    const nextOptions = videoModelOptions(next.id);
    choose({
      model: next.id,
      seconds: snapVideoDuration(next.id, choices.seconds),
      aspect: choices.aspect === 'auto' || nextOptions.aspectRatios.includes(choices.aspect as VideoAspect) ? choices.aspect : '9:16',
    });
    setFaceBlock(null);
  };

  useEffect(() => {
    if (!engines) return;
    const current = createModel(choices.model);
    const other = CREATE_MODELS.find((known) => known.engine !== current.engine);
    if (!engines[current.engine].ready && other && engines[other.engine].ready) {
      const timer = window.setTimeout(() => {
        changeModel(other.id);
        toast.info(`${current.name} isn’t available right now, so ${other.name} is picked.`, TOAST);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [engines]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({ videos: videos?.length ?? 0, rendering: (videos ?? []).filter((video) => video.takes.some((take) => take.status === 'rendering')).length }), [videos]);

  return (
    <div className="flex h-dvh flex-col bg-[#08080a] text-white">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/8 bg-[#0a0a0d]/90 px-3 backdrop-blur-xl sm:px-4">
        <Link href="/" title="GoGrowth home" className="flex shrink-0 items-center rounded-full p-1 hover:bg-white/7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gogrowth-mark.png" alt="GoGrowth" className="h-7 w-7 object-contain" />
        </Link>
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
          <PlaygroundTabs active="create" preview={preview} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {SHOW_PRICING ? (
            <Link href="/pricing" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10" title="Credits">
              <Sparkles className="h-4 w-4 text-[#fff05a]" /> {balance === null ? '…' : balance.toLocaleString('en-IN')}
            </Link>
          ) : (
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white sm:flex" title="Credits">
              <Sparkles className="h-4 w-4 text-[#fff05a]" /> {balance === null ? '…' : balance.toLocaleString('en-IN')}
            </span>
          )}
          <div className="hidden h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/[0.07] sm:flex">
            {user?.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.user_metadata.avatar_url} alt="Account" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : <User className="h-4 w-4 text-white/70" />}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="flex shrink-0 flex-col border-white/8 bg-[#0b0b0d] lg:w-[360px] lg:border-r">
          <ControlPanel
            preview={preview}
            model={model}
            engines={engines}
            preset={preset}
            images={images}
            uploading={uploading}
            role={role}
            prompt={prompt}
            seconds={seconds}
            quality={quality}
            aspect={aspect}
            credits={price}
            blocked={blocked}
            generating={generating}
            improving={improving}
            canUndo={undoPrompt !== null}
            faceBlock={faceBlock}
            clients={{ enabled: clientsEnabled, list: clientList, value: client }}
            onPresets={() => setView('presets')}
            onModel={changeModel}
            onFiles={(files) => void addFiles(files)}
            onLibrary={() => setLibraryOpen(true)}
            onRemoveImage={(url) => {
              setImages((current) => current.filter((image) => image.url !== url));
              setFaceBlock(null);
            }}
            onRole={(next) => choose({ role: next })}
            onPrompt={(next) => setPrompt(next)}
            onImprove={() => void improve()}
            onUndo={() => {
              if (undoPrompt !== null) setPrompt(undoPrompt);
              setUndoPrompt(null);
            }}
            onSeconds={(next) => choose({ seconds: next })}
            onQuality={(next) => choose({ quality: next })}
            onAspect={(next) => (canAuto ? choose({ extendTo: next === 'auto' ? null : next }) : choose({ aspect: next }))}
            onClient={(next: ClientRef | null) => choose({ clientId: next?.id ?? null })}
            onUseVeo={() => changeModel(createModel('veo-3.1-generate-001').id)}
            onGenerate={() => void generate()}
          />
        </aside>

        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-white/[0.06] bg-[#08080a]/90 px-4 py-2.5 backdrop-blur-xl sm:px-6">
            {([['history', 'History', History], ['presets', 'Presets', LayoutGrid]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={cx('inline-flex items-center gap-1.5 rounded-full !px-3 !py-1.5 text-sm transition-colors', view === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white')}
              >
                <Icon className="h-4 w-4" /> {label}
                {id === 'history' && counts.videos > 0 && <span className="text-xs tabular-nums text-white/40">{counts.videos}</span>}
              </button>
            ))}
            {counts.rendering > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#fff05a]/25 bg-[#fff05a]/10 px-2.5 py-1 text-xs text-[#fff05a]">
                <Loader2 className="h-3 w-3 animate-spin" /> {counts.rendering} rendering
              </span>
            )}
          </div>

          <div className="p-4 sm:p-6">
            {preview && (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-sky-100/80">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
                <span><span className="font-semibold text-sky-100">Preview with sample videos.</span> Nothing is sent to Seedance or Veo and nothing is charged; Generate shows a sample clip, not your video. Sign in on the real app to make real videos.</span>
              </div>
            )}
            {view === 'presets' ? (
              <>
                <h2 className="mb-1 text-[28px] font-black uppercase leading-none tracking-tight sm:text-[34px]">Pick a motion</h2>
                <p className="mb-5 text-sm text-white/50">Each preset adds one camera or motion line to your prompt. General leaves it to your words.</p>
                <PresetGallery value={preset.id} onPick={pickPreset} />
              </>
            ) : signedOut ? (
              <EmptyState signedOut />
            ) : videos === null ? (
              <div className="flex items-center gap-2 py-16 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading your videos…</div>
            ) : videos.length === 0 ? (
              <EmptyState onPresets={() => setView('presets')} />
            ) : (
              <CreateHistory
                videos={videos}
                freshId={freshId}
                onSeen={(id) => setFreshId((current) => (current === id ? null : current))}
                preview={preview}
                busy={busy}
                credits={balance}
                hasMore={Boolean(nextBefore)}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                onUpgrade={(video, take, target) => void upgrade(video, take, target)}
                onTryAgain={(video) => void tryAgain(video)}
                onReuse={reuse}
              />
            )}
          </div>
        </main>
      </div>

      <LibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        kind="image"
        title="Images from your Library"
        description={veo ? 'Veo starts from the first one.' : 'A start image, or up to 9 references.'}
        preview={preview}
        multiple
        max={Math.max(1, MAX_CREATE_IMAGES - images.length)}
        exclude={images.map((image) => image.url)}
        confirmLabel={(count) => `Use ${count} image${count === 1 ? '' : 's'}`}
        onPick={(items) => {
          const picked = items.filter((item) => item.url).map((item) => ({ url: item.url!, name: item.name }));
          setImages((current) => [...current, ...picked.filter((item) => !current.some((known) => known.url === item.url))].slice(0, MAX_CREATE_IMAGES));
          setFaceBlock(null);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

function EmptyState({ signedOut = false, onPresets }: { signedOut?: boolean; onPresets?: () => void }) {
  const steps = [
    { icon: ImagePlus, title: 'Add images', body: 'Optional: a start image, or up to 9 references for Seedance.' },
    { icon: LayoutGrid, title: 'Pick a motion', body: 'A preset like Orbit 360 or Hand reveal, or just your words.' },
    { icon: WandSparkles, title: 'Generate', body: 'Seedance or Veo renders it; it lands here when it’s ready.' },
  ];
  return (
    <div className="mx-auto max-w-4xl py-8 sm:py-14">
      <h1 className="text-[34px] font-black uppercase leading-[0.95] tracking-tight sm:text-[52px]">Make videos<br />in one click</h1>
      <p className="mt-3 max-w-xl text-sm text-white/50">Write what you want, add your product photos if you like, pick Seedance or Google Veo, and press Generate.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <div key={title} className="rounded-2xl border border-white/[0.06] bg-[#111114] p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff05a]/12 text-[#fff05a]"><Icon className="h-4 w-4" /></span>
            <p className="mt-3 text-[13px] font-bold uppercase tracking-wide text-white">{index + 1}. {title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">{body}</p>
          </div>
        ))}
      </div>
      {signedOut ? (
        <Link href="/login?redirectTo=/playground/create" className="mt-8 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-semibold text-black hover:bg-white">Sign in to start</Link>
      ) : (
        <button type="button" onClick={onPresets} className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-white hover:bg-white/[0.06]">
          <Clapperboard className="h-4 w-4" /> Browse motion presets
        </button>
      )}
    </div>
  );
}
