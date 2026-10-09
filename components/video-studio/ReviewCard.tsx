'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { Check, ChevronDown, Clapperboard, FileText, FolderHeart, ImagePlus, Info, Loader2, MapPin, MessageSquareQuote, Music2, Pencil, Play, RefreshCw, RotateCcw, Trash2, Upload, Users, Wand2, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { dictationErrorMessage, useSpeechDictation } from '@/lib/useSpeechDictation';
import { videoApi } from '@/lib/video/client';
import { DictationButton } from '@/components/shared/DictationButton';
import { cssAspect, isWideAspect, seedanceSpec, videoCredits, videoEngineOf, videoModelOptions, videoQualityLabel } from '@/lib/videoModels';
import { libraryApi } from '@/lib/playground/api';
import { previewLibrary } from '@/lib/playground/preview';
import { uploadImages } from '@/lib/playground/upload';
import type { LibraryItem } from '@/lib/playground/types';
import {
  dropImageReference,
  parseVideoPrompt,
  PROMPT_REWRITE_CREDITS,
  retimePrompt,
  setCastInPrompt,
  setSettingInPrompt,
  setShotInPrompt,
  setSpokenInPrompt,
  videoModelName,
  type FrameSource,
  type PromptShot,
  type ReviewFrameKind,
  type VideoReviewState,
} from '@/lib/video/shared';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { ShotSequence } from '@/components/playground/library/libraryParts';
import { cx, Popover, PopoverClose } from '@/components/playground/ui';

const TOAST = { position: 'top-center' as const };
/** Reference images one video can take here (Seedance 2.0 takes up to 9). */
const MAX_FRAMES = 9;

export interface ReviewEdits {
  prompt: string;
  negativePrompt?: string;
  frames: string[];
  /** The length picked in the card (the plan's, or another one the engine renders). */
  durationSeconds: number;
}

type Frame = VideoReviewState['frames'][number];
type Reference = VideoReviewState['referenceVideos'][number];
/** Where a new image goes: replacing image `index`, or added at the end. */
type ImageTarget = { index: number } | 'add';

/** What a frame is, in plain words (older reviews have no kind: it is read from the label). */
function frameKind(frame: Frame, mode: VideoReviewState['mode']): ReviewFrameKind {
  if (frame.kind) return frame.kind;
  if (mode === 'first_frame' || /^(opening scene|first frame)/i.test(frame.label)) return 'frame';
  if (/^(scene image|made by)/i.test(frame.label)) return 'scene';
  if (/mannequin/i.test(frame.label)) return 'mannequin';
  return 'photo';
}

function Stepper({ redraft = false }: { redraft?: boolean }) {
  const steps: Array<{ label: string; state: 'done' | 'current' | 'next' }> = redraft
    ? [
        { label: 'Draft ready', state: 'done' },
        { label: 'Your changes', state: 'current' },
        { label: 'New draft', state: 'next' },
      ]
    : [
        { label: 'Planned', state: 'done' },
        { label: 'Your approval', state: 'current' },
        { label: 'Render', state: 'next' },
      ];
  return (
    <ol className="flex items-center gap-2 text-[11px]" aria-label="Progress">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          {index > 0 && <span className="h-px w-4 bg-white/15 sm:w-8" aria-hidden />}
          <span className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
            step.state === 'done' && 'bg-white/[0.06] text-white/60',
            step.state === 'current' && 'bg-[#fff05a] font-medium text-black',
            step.state === 'next' && 'border border-white/10 text-white/40'
          )}>
            {step.state === 'done' && <Check className="h-3 w-3" strokeWidth={3} />}
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-snug text-white/45">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Text you can edit in place. While you type it keeps your exact text; the prompt is updated
 * after a short pause and when you leave the field.
 */
function EditableText({ value, onCommit, multiline = false, commitOnBlur = false, placeholder, label, disabled, className }: {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  /** Commit when the field is left (or Enter), not while typing: for fields whose length moves them. */
  commitOnBlur?: boolean;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value;
  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (next !== value) onCommit(next);
  };
  const change = (next: string) => {
    setDraft(next);
    if (commitOnBlur) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 600);
  };
  const onFocus = () => setDraft(value);
  const onBlur = () => {
    if (draft !== null) commit(draft);
    setDraft(null);
  };
  const base = cx(
    'w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 -mx-1.5 text-sm leading-snug text-white/85 outline-none transition-colors placeholder:text-white/25 hover:border-white/10 focus:border-[#fff05a]/40 focus:bg-black/30 disabled:opacity-60',
    className
  );
  return multiline ? (
    <textarea
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      rows={Math.min(6, Math.max(2, Math.ceil(shown.length / 70)))}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) => change(event.target.value)}
      className={cx(base, 'resize-none')}
    />
  ) : (
    <input
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) => change(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={base}
    />
  );
}

/** A labelled line inside a shot (a framing or camera move written out in full). */
function ShotDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 w-14 shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/8 bg-black/20 px-3.5 py-2.5">
      <span className="mt-1 shrink-0 text-white/45">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{label} <Pencil className="h-2.5 w-2.5 opacity-70" /></p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/** A reference video, played with its shot list (not part of the video). */
function ReferenceDialog({ reference, preview, onClose }: { reference: Reference; preview: boolean; onClose: () => void }) {
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  useEffect(() => {
    let cancelled = false;
    const load = preview
      ? Promise.resolve(previewLibrary('video').find((known) => known.id === reference.id) ?? null)
      : libraryApi.get(reference.id).then((result) => result.item).catch(() => null);
    void load.then((found) => {
      if (cancelled) return;
      setItem(found);
      setState(found || reference.url ? 'ready' : 'gone');
    });
    return () => {
      cancelled = true;
    };
  }, [reference.id, reference.url, preview]);
  const url = reference.url ?? item?.url ?? null;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90vh] w-[min(860px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/12 bg-[#141418] text-white outline-none">
          <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-medium">{reference.name}</Dialog.Title>
              <Dialog.Description className="text-xs text-white/45">Reference video · its shots and pacing were copied; it is not sent to the video engine</Dialog.Description>
            </div>
            <Dialog.Close className="ml-auto rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,260px)_1fr]">
            {state === 'loading' ? (
              <div className="flex items-center gap-2 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : state === 'gone' || !url ? (
              <p className="text-sm text-white/55">This reference video is no longer in your Library.</p>
            ) : (
              <video src={url} poster={reference.posterUrl ?? item?.posterUrl ?? undefined} controls autoPlay muted playsInline className="mx-auto max-h-[60vh] w-full rounded-2xl border border-white/10 bg-black object-contain" />
            )}
            {item?.analysis && (
              <div className="min-w-0">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Shot by shot</p>
                <ShotSequence analysis={item.analysis} />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Upload a photo or pick one from the Library, for replacing or adding an image. */
/** What a tile is called, in plain words, and a short line under it. */
function tileText(frame: Frame, kind: ReviewFrameKind, opening: boolean): { title: string; sub: string | null } {
  const label = frame.label.trim();
  const named = label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  switch (kind) {
    case 'crop':
      return { title: named || 'Close-up of your product', sub: 'Cut from your photo' };
    case 'scene': {
      const shot = label.match(/shot (\d+)/i)?.[1];
      return { title: 'Scene made for this video', sub: shot ? `For shot ${shot}` : null };
    }
    case 'mannequin':
      return { title: 'Your photo, on a mannequin', sub: 'The model was replaced; the garment is kept' };
    case 'frame':
      return { title: opening ? 'Opening scene' : 'First frame', sub: opening ? 'The video opens on it' : 'The video starts from it' };
    default:
      return { title: named || 'Your photo', sub: named ? 'Your photo' : null };
  }
}

/** The original photo a close-up was cut from, with the cut area outlined. */
function SourceInset({ source, onOpen }: { source: FrameSource; onOpen: () => void }) {
  const [x, y, w, h] = source.box;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Where it was cut from"
      aria-label="See where this close-up was cut from"
      className="absolute bottom-1.5 left-1.5 overflow-hidden rounded-md border border-white/50 bg-black/60 !p-0 shadow-lg shadow-black/40"
    >
      <span className="relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source.url} alt="" className="block h-14 w-auto max-w-[56px]" />
        <span className="absolute rounded-[2px] border-[1.5px] border-[#fff05a]" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }} />
      </span>
    </button>
  );
}

function ImageSourceMenu({ trigger, onUpload, onLibrary }: { trigger: ReactNode; onUpload: () => void; onLibrary: () => void }) {
  return (
    <Popover side="bottom" align="start" className="w-52" trigger={trigger}>
      <PopoverClose asChild>
        <button type="button" onClick={onUpload} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"><Upload className="h-4 w-4 text-white/50" /> Upload a photo</button>
      </PopoverClose>
      <PopoverClose asChild>
        <button type="button" onClick={onLibrary} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"><FolderHeart className="h-4 w-4 text-white/50" /> From your Library</button>
      </PopoverClose>
    </Popover>
  );
}

/**
 * "Change it in your words": a short idea (typed or spoken) becomes a full, polished rewrite of
 * the prompt in a few seconds. The previous prompt is one tap away.
 */
function RewriteBox({ prompt, images, seconds, model, projectId, preview, disabled, credits, onRewrite }: {
  prompt: string;
  images: number;
  /** The video's length now; the idea may ask for another one the engine renders. */
  seconds: number;
  model: string;
  /** The project whose guidelines the rewrite follows. */
  projectId?: string;
  preview: boolean;
  disabled: boolean;
  credits: number | null;
  /** The new prompt, what changed, the prompt it replaced (for Undo) and its length. */
  onRewrite: (next: string, summary: string, before: string, seconds: number) => void;
}) {
  const { refreshCredits } = useCredits();
  const [idea, setIdea] = useState('');
  const [working, setWorking] = useState(false);
  // The new prompt while it is being written.
  const [live, setLive] = useState('');
  const liveBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (liveBox.current) liveBox.current.scrollTop = liveBox.current.scrollHeight;
  }, [live]);
  const dictation = useSpeechDictation((value) => setIdea((prev) => (typeof value === 'function' ? value(prev) : value).slice(0, 600)), {
    onError: (code) => {
      const message = dictationErrorMessage(code);
      if (message) toast.error(message, TOAST);
    },
  });
  const short = credits !== null && credits < PROMPT_REWRITE_CREDITS;

  const rewrite = async () => {
    const instruction = idea.trim();
    if (!instruction || working || disabled) return;
    if (dictation.isListening) dictation.stop();
    setWorking(true);
    setLive('');
    const before = prompt;
    try {
      if (preview) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const asked = Number(instruction.match(/(\d+)\s*(?:s\b|sec|second)/i)?.[1]);
        const length = videoModelOptions(model).durations.includes(asked) ? asked : seconds;
        const shot1 = parseVideoPrompt(before)?.shots[0];
        const changed = shot1
          ? setShotInPrompt(before, shot1.n, { framing: shot1.framing, action: `${instruction.charAt(0).toUpperCase()}${instruction.slice(1)}, graceful and precise`, camera: shot1.camera, image: shot1.images[0] ?? null })
          : `${before}\n\n${instruction}`;
        const next = retimePrompt(changed, length);
        for (let end = 0; end < next.length; end += 60) {
          setLive(next.slice(0, end + 60));
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        onRewrite(next, `Shot 1 now shows: ${instruction}.`, before, length);
      } else {
        const result = await videoApi.rewritePrompt({ prompt: before, instruction, images, seconds, model, projectId }, (text, { reset }) => {
          setLive((current) => (reset ? text : current + text));
        });
        onRewrite(result.prompt, result.summary, before, result.seconds);
      }
      setIdea('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be rewritten', { ...TOAST, duration: 7000 });
    } finally {
      setWorking(false);
      setLive('');
      // Charged when it starts, refunded if it fails.
      if (!preview) void refreshCredits();
    }
  };

  return (
    <div className="rounded-2xl border border-[#c8b8ff]/20 bg-[#c8b8ff]/[0.05] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#d9ccff]">
        <Wand2 className="h-3.5 w-3.5" /> Change it in your words
      </p>
      <textarea
        value={idea}
        onChange={(event) => {
          if (dictation.isListening) dictation.cancel();
          setIdea(event.target.value.slice(0, 600));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void rewrite();
          }
        }}
        rows={2}
        disabled={disabled || working}
        placeholder="e.g. the girl dances Bharatanatyam in the courtyard"
        aria-label="Describe the change"
        className="mt-2 block w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-snug text-white outline-none placeholder:text-white/30 focus:border-[#c8b8ff]/40 disabled:opacity-60"
      />
      {working && (
        <div
          ref={liveBox}
          aria-live="polite"
          className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs leading-relaxed text-white/70"
        >
          {live || <span className="text-white/40">Reading your prompt…</span>}
          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-[#d9ccff]/70 align-middle" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-48 text-[11px] leading-snug text-white/40">
          {working ? (live ? 'Writing the new prompt…' : 'Working out the change…') : 'The whole prompt is rewritten around it. Product and images stay the same.'}
        </p>
        <DictationButton dictation={dictation} text={idea} size="sm" disabled={disabled || working} toastOptions={TOAST} />
        <button
          type="button"
          onClick={() => void rewrite()}
          disabled={disabled || working || !idea.trim() || short}
          title={short ? `Needs ${PROMPT_REWRITE_CREDITS} credits` : undefined}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#d9ccff] px-4 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/40"
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {working ? 'Rewriting…' : `Rewrite · ${PROMPT_REWRITE_CREDITS} credits`}
        </button>
      </div>
    </div>
  );
}

/**
 * The approval step before every render, in three parts: what the video is made from (the
 * images the engine gets: replace, remove or add them), the plan shot by shot (edit any shot,
 * who's in it, where, the spoken line; the full prompt is one tap away), and the reference
 * videos it copied (not sent). Nothing is charged for the video until "Approve & render".
 */
export function ReviewCard({ review, busy, credits, projectId, preview = false, redraft = false, onApprove, onCancel, onView }: {
  review: VideoReviewState;
  /** The video project (its guidelines go to the prompt rewrite). */
  projectId?: string;
  busy: boolean;
  /** The user's balance, to warn before approving. */
  credits: number | null;
  preview?: boolean;
  /** Editing a finished take into a new draft of the same video (not a first approval). */
  redraft?: boolean;
  onApprove: (edits: ReviewEdits) => void;
  /** Cancels the video (or, for a new draft, closes the editor). */
  onCancel: () => void;
  /** Opens an image full size; `box` outlines where a close-up was cut from. */
  onView: (url: string, box?: FrameSource['box']) => void;
}) {
  const [prompt, setPromptState] = useState(review.prompt);
  const [negative, setNegative] = useState(review.negativePrompt ?? '');
  const [frames, setFrames] = useState(review.frames);
  const [fullPrompt, setFullPrompt] = useState(false);
  const [openReference, setOpenReference] = useState<Reference | null>(null);
  const [target, setTarget] = useState<ImageTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState<ImageTarget | null>(null);
  const [seconds, setSeconds] = useState(review.durationSeconds);
  const [rewritten, setRewritten] = useState<{ summary: string; before: string; beforeSeconds: number; seconds: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The newest prompt, so Approve never sends one a field is still committing.
  const promptRef = useRef(review.prompt);
  const setPrompt = (next: string | ((current: string) => string)) => {
    const value = typeof next === 'function' ? next(promptRef.current) : next;
    promptRef.current = value;
    setPromptState(value);
  };

  const edited = prompt !== review.prompt || negative !== (review.negativePrompt ?? '') || frames.map((f) => f.url).join() !== review.frames.map((f) => f.url).join() || seconds !== review.durationSeconds;
  // Priced for the length picked here.
  const cost = seconds === review.durationSeconds ? review.credits : videoCredits(review.model, review.quality, seconds, review.aspectRatio);
  const short = credits !== null && credits < cost;
  const lengths = videoModelOptions(review.model).durations;
  const reference = review.mode === 'reference';
  const parsed = useMemo(() => parseVideoPrompt(prompt), [prompt]);
  const noFaces = videoEngineOf(review.model) === 'seedance' && !seedanceSpec(review.model).realFaces;

  const removeFrame = (index: number) => {
    setFrames((current) => current.filter((_, i) => i !== index));
    setPrompt((current) => dropImageReference(current, index + 1));
    // The prompt before a rewrite still has the old image numbers.
    setRewritten(null);
  };

  const undo = () => {
    setPrompt(review.prompt);
    setNegative(review.negativePrompt ?? '');
    setFrames(review.frames);
    setSeconds(review.durationSeconds);
    setRewritten(null);
  };

  /** Another length: the shots keep their share of the film, re-timed to the new length. */
  const changeLength = (next: number) => {
    if (next === seconds) return;
    setSeconds(next);
    setPrompt((current) => retimePrompt(current, next));
  };

  /** A replacement keeps the image's number, so every shot that used it now uses the new one. */
  const placeImage = (where: ImageTarget, url: string, name: string) => {
    if (frames.some((frame) => frame.url === url)) {
      toast.error('That image is already in the list.', TOAST);
      return;
    }
    const added: Frame = { url, label: name || 'Your upload', kind: 'photo' };
    setFrames((current) => (where === 'add' ? [...current, added] : current.map((frame, i) => (i === where.index ? added : frame))));
  };

  const chooseUpload = (where: ImageTarget) => {
    setTarget(where);
    fileInput.current?.click();
  };
  const chooseLibrary = (where: ImageTarget) => {
    setTarget(where);
    setPickerOpen(true);
  };

  const uploadFile = async (file: File) => {
    const where = target;
    if (!where) return;
    setUploading(where);
    try {
      const [uploaded] = await uploadImages([file], { preview, onError: (message) => toast.error(message, TOAST) });
      if (uploaded) placeImage(where, uploaded.url, uploaded.name);
    } finally {
      setUploading(null);
      setTarget(null);
    }
  };

  const updateShot = (shot: PromptShot, patch: Partial<{ framing: string; action: string; camera: string; image: number | null }>) => {
    setPrompt((current) => setShotInPrompt(current, shot.n, {
      framing: patch.framing ?? shot.framing,
      action: patch.action ?? shot.action,
      camera: patch.camera ?? shot.camera,
      image: patch.image !== undefined ? patch.image : shot.images[0] ?? null,
    }));
  };

  const approve = () => onApprove({
    prompt: promptRef.current,
    negativePrompt: review.negativePrompt !== undefined ? negative : undefined,
    frames: frames.map((frame) => frame.url),
    durationSeconds: seconds,
  });

  const cast = parsed?.cast ?? review.outline?.cast ?? null;
  // Why the video is made from these images, in plain words.
  const hasCrops = frames.some((frame) => frameKind(frame, review.mode) === 'crop');
  const what = review.garment ? 'the outfit' : 'the product';
  const fromPlan = cast && !/^Nobody/i.test(cast) ? ' The people, the setting and the moves come from the plan below.' : ' The setting and the moves come from the plan below.';
  const imagesHint = !reference
    ? 'The video starts from this frame. You can replace it with your own photo.'
    : hasCrops && noFaces
      ? `${videoModelName(review.model)} can’t take photos with a face, so we cut these close-ups of ${what} out of your photos. They give it the exact ${review.garment ? 'fabric, colours and pattern' : 'look, colours and details'}.${fromPlan}`
      : `${videoModelName(review.model)} copies ${what} from these images.${fromPlan}`;
  const castEditable = Boolean(parsed && /Cast:\s*.+?\.\s+Faces look|One presenter speaks to the camera:/.test(prompt));
  const outlineShots = !parsed && !edited ? review.outline?.shots ?? [] : [];
  const isUploading = (where: ImageTarget) => uploading !== null && (where === 'add' ? uploading === 'add' : uploading !== 'add' && uploading.index === where.index);

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111114]">
      <div className="space-y-4 border-b border-white/8 px-5 py-4">
        <Stepper redraft={redraft} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-light text-white">{redraft ? 'Make small changes, then a new draft' : 'Check your video before it renders'}</h2>
            <p className="mt-0.5 text-xs text-white/50">
              {videoModelName(review.model)} · {seconds}s · {videoQualityLabel(review.quality)} · {review.aspectRatio}
            </p>
            {review.writtenBy && <p className="mt-1 text-xs text-[#d9ccff]/80">{review.writtenBy}</p>}
          </div>
          <span className="rounded-full border border-[#fff05a]/30 bg-[#fff05a]/10 px-3 py-1 text-xs text-[#fff05a]">
            {cost} credits · {redraft ? 'when you start the new draft' : 'only when you approve'}
          </span>
        </div>
        {lengths.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Video length">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Length</span>
            {lengths.map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                aria-pressed={option === seconds}
                onClick={() => changeLength(option)}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors disabled:opacity-50',
                  option === seconds ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/10 bg-black/25 text-white/65 hover:border-white/25 hover:text-white'
                )}
              >
                {option}s
              </button>
            ))}
            {seconds !== review.durationSeconds && (
              <span className="text-[11px] text-white/45">Shots re-timed from {review.durationSeconds}s to {seconds}s</span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-7 p-5">
        <Section title={reference ? 'What the video copies your product from' : 'The frame your video starts from'} hint={imagesHint}>
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible">
            {frames.map((frame, index) => {
              const kind = frameKind(frame, review.mode);
              const opening = parsed?.opening === index + 1;
              const busyHere = isUploading({ index });
              // A first frame or a scene image is made in the video's shape; photos keep the usual tile.
              const shaped = kind === 'scene' || kind === 'frame' || kind === 'mannequin';
              const tile = shaped ? review.aspectRatio : '9:16';
              const wide = shaped && isWideAspect(tile);
              const text = tileText(frame, kind, opening);
              const source = frame.source;
              return (
                <figure key={frame.url} className={cx('shrink-0 sm:w-auto', wide ? 'w-64 sm:col-span-2' : 'w-36')}>
                  <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    <button type="button" onClick={() => onView(frame.url)} title="See full size" aria-label={`See ${text.title} full size`} className="block w-full !p-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frame.url} alt={text.title} style={{ aspectRatio: cssAspect(tile) }} className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </button>
                    {reference && (
                      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">Image {index + 1}</span>
                    )}
                    {/* Stacked, so they never cover the image number (touch screens make every button 44 px). */}
                    <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
                      <ImageSourceMenu
                        onUpload={() => chooseUpload({ index })}
                        onLibrary={() => chooseLibrary({ index })}
                        trigger={(
                          <button type="button" disabled={busy || uploading !== null} title="Replace" aria-label={`Replace image ${index + 1}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 !p-0 text-white/85 backdrop-blur-md hover:bg-black/85 hover:text-white disabled:opacity-40">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      />
                      {reference && frames.length > 1 && (
                        <button type="button" onClick={() => removeFrame(index)} disabled={busy || uploading !== null} title="Remove" aria-label={`Remove image ${index + 1}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 !p-0 text-white/85 backdrop-blur-md hover:bg-red-500/70 hover:text-white disabled:opacity-40">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {source && <SourceInset source={source} onOpen={() => onView(source.url, source.box)} />}
                    {busyHere && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>
                    )}
                  </div>
                  <figcaption className="mt-2 space-y-0.5">
                    <p className={cx('line-clamp-2 text-xs leading-snug', kind === 'scene' ? 'text-[#d9ccff]' : 'text-white/85')}>{text.title}</p>
                    {text.sub && <p className="text-[10.5px] text-white/45">{text.sub}</p>}
                  </figcaption>
                </figure>
              );
            })}

            {reference && frames.length < MAX_FRAMES && (
              <ImageSourceMenu
                onUpload={() => chooseUpload('add')}
                onLibrary={() => chooseLibrary('add')}
                trigger={(
                  <button type="button" disabled={busy || uploading !== null} className="flex aspect-[9/16] w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-xs text-white/55 transition-colors hover:border-[#fff05a]/40 hover:text-white disabled:opacity-40 sm:w-auto">
                    {isUploading('add') ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    Add an image
                  </button>
                )}
              />
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
              event.target.value = '';
            }}
          />
        </Section>

        {review.referenceVideos.length > 0 && (
          <Section title="Copied from" hint="Your video copies the shots and pacing of this video. It is not sent to the video engine.">
            <div className="flex flex-wrap gap-3">
              {review.referenceVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => setOpenReference(video)}
                  className="group flex w-full max-w-xs items-center gap-3 rounded-2xl border border-[#c8b8ff]/20 bg-[#c8b8ff]/[0.05] p-2 pr-4 text-left transition-colors hover:border-[#c8b8ff]/40 hover:bg-[#c8b8ff]/[0.09]"
                >
                  <span className="relative flex h-16 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40">
                    {video.posterUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={video.posterUrl} alt="" className="h-full w-full object-cover" />
                      : video.url
                        ? <video src={`${video.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        : <Clapperboard className="h-4 w-4 text-white/40" />}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Play className="h-4 w-4 fill-white text-white" /></span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{video.name}</span>
                    <span className="block text-[11px] text-[#d9ccff]/80">{video.shots ? `${video.shots} shots copied` : 'Shots copied'} · tap to watch</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section
          title="Shot by shot"
          hint={parsed ? 'Click any text to change it. Your changes go straight into the prompt.' : 'Edit the prompt below; it is exactly what the video engine gets.'}
          action={edited ? (
            <button type="button" onClick={undo} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] text-white/55 hover:bg-white/8 hover:text-white disabled:opacity-40">
              <RotateCcw className="h-3 w-3" /> Undo all changes
            </button>
          ) : undefined}
        >
          <RewriteBox
            prompt={prompt}
            images={frames.length}
            seconds={seconds}
            model={review.model}
            projectId={projectId}
            preview={preview}
            disabled={busy}
            credits={credits}
            onRewrite={(next, summary, before, nextSeconds) => {
              setPrompt(next);
              setRewritten({ summary, before, beforeSeconds: seconds, seconds: nextSeconds });
              setSeconds(nextSeconds);
            }}
          />
          {rewritten && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[#c8b8ff]/20 bg-black/20 px-3 py-2 text-xs text-white/75">
              <Check className="h-3.5 w-3.5 shrink-0 text-[#d9ccff]" /> {rewritten.summary}
              {rewritten.seconds !== rewritten.beforeSeconds && ` Now ${rewritten.seconds}s.`}
              <button
                type="button"
                onClick={() => {
                  setPrompt(rewritten.before);
                  setSeconds(rewritten.beforeSeconds);
                  setRewritten(null);
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/8 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" /> Undo this rewrite
              </button>
            </p>
          )}

          {parsed && (
            <div className="grid gap-2 sm:grid-cols-2">
              {cast && (
                <Field icon={<Users className="h-4 w-4" />} label="Who's in it">
                  {castEditable
                    ? <EditableText multiline label="Who's in it" value={cast} disabled={busy} onCommit={(next) => setPrompt((current) => setCastInPrompt(current, next))} />
                    : <p className="text-sm leading-snug text-white/85">{cast}</p>}
                </Field>
              )}
              {parsed.setting && (
                <Field icon={<MapPin className="h-4 w-4" />} label="Where">
                  <EditableText multiline label="Where" value={parsed.setting} disabled={busy} onCommit={(next) => setPrompt((current) => setSettingInPrompt(current, next))} />
                </Field>
              )}
            </div>
          )}

          {parsed ? (
            <ol className="space-y-2">
              {parsed.shots.map((shot) => {
                // A framing or camera move written out in full (lens, what stays in frame) gets its own line.
                const longFraming = shot.framing.length > 28;
                const longCamera = shot.camera.length > 30;
                return (
                <li key={shot.n} className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-medium text-white/75">{shot.n}</span>
                    <span className="text-[11px] tabular-nums text-[#fbf2a0]/85">{shot.t}</span>
                    {!longFraming && (
                      <EditableText label={`Shot ${shot.n} framing`} commitOnBlur value={shot.framing} placeholder="Framing" disabled={busy} onCommit={(framing) => updateShot(shot, { framing })} className="!mx-0 w-auto max-w-[150px] !py-0.5 text-[11px] text-white/60" />
                    )}
                    {!longFraming && !longCamera && <span className="text-white/20">·</span>}
                    {!longCamera && (
                      <EditableText label={`Shot ${shot.n} camera`} commitOnBlur value={shot.camera} placeholder="Camera move" disabled={busy} onCommit={(camera) => updateShot(shot, { camera })} className="!mx-0 w-auto max-w-[170px] !py-0.5 text-[11px] text-white/60" />
                    )}
                    {reference && (
                      <label className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-2.5 pr-1 text-[11px] text-white/70">
                        <span className="sr-only">Image for shot {shot.n}</span>
                        <select
                          value={shot.images[0] ?? 0}
                          disabled={busy}
                          onChange={(event) => updateShot(shot, { image: Number(event.target.value) || null })}
                          className="h-7 appearance-none bg-transparent pr-4 text-[11px] text-white/80 outline-none"
                        >
                          <option value={0}>No image</option>
                          {frames.map((frame, index) => (
                            <option key={frame.url} value={index + 1}>Image {index + 1}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none -ml-4 h-3 w-3 text-white/45" />
                      </label>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-3 pl-8">
                    {shot.images[0] && frames[shot.images[0] - 1] && (
                      <button type="button" onClick={() => onView(frames[shot.images[0] - 1].url)} title={`Image ${shot.images[0]}`} className="shrink-0 overflow-hidden rounded-lg border border-white/10 !p-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frames[shot.images[0] - 1].url} alt="" className="h-14 w-8 object-cover" />
                      </button>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      {longFraming && (
                        <ShotDetail label="Framing">
                          <EditableText multiline label={`Shot ${shot.n} framing`} commitOnBlur value={shot.framing} disabled={busy} onCommit={(framing) => updateShot(shot, { framing })} className="text-xs text-white/65" />
                        </ShotDetail>
                      )}
                      <EditableText multiline label={`Shot ${shot.n} action`} value={shot.action} disabled={busy} onCommit={(action) => updateShot(shot, { action })} />
                      {longCamera && (
                        <ShotDetail label="Camera">
                          <EditableText multiline label={`Shot ${shot.n} camera`} commitOnBlur value={shot.camera} disabled={busy} onCommit={(camera) => updateShot(shot, { camera })} className="text-xs text-white/65" />
                        </ShotDetail>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ol>
          ) : outlineShots.length ? (
            <ol className="space-y-2">
              {outlineShots.map((shot, index) => (
                <li key={`${shot.t}-${index}`} className="flex gap-3 rounded-2xl border border-white/8 bg-black/20 p-3.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-medium text-white/75">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white/45"><span className="tabular-nums text-[#fbf2a0]/85">{shot.t}</span>{shot.camera && <> · {shot.camera}</>}</p>
                    <p className="mt-1 text-sm leading-snug text-white/85">{shot.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {parsed && (parsed.spoken || parsed.sound) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {parsed.spoken && (
                <Field icon={<MessageSquareQuote className="h-4 w-4" />} label="They say">
                  <EditableText multiline label="Spoken line" value={parsed.spoken} disabled={busy} onCommit={(next) => setPrompt((current) => setSpokenInPrompt(current, next))} />
                </Field>
              )}
              {parsed.sound && (
                <div className="flex gap-3 rounded-2xl border border-white/8 bg-black/20 px-3.5 py-2.5">
                  <span className="mt-0.5 shrink-0 text-white/45"><Music2 className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Sound</p>
                    <p className="mt-0.5 text-sm leading-snug text-white/85">{parsed.sound}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {parsed ? (
            <button type="button" onClick={() => setFullPrompt((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 px-3 text-xs text-white/70 hover:bg-white/8 hover:text-white">
              <FileText className="h-3.5 w-3.5" /> {fullPrompt ? 'Hide the full prompt' : 'Show the full prompt'}
            </button>
          ) : null}

          {(fullPrompt || !parsed) && (
            <div className="space-y-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={12}
                maxLength={6000}
                disabled={busy}
                spellCheck={false}
                aria-label="The full prompt"
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus:border-[#fff05a]/40 disabled:opacity-70"
              />
              {review.negativePrompt !== undefined && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Keep out of the video</p>
                  <textarea
                    value={negative}
                    onChange={(event) => setNegative(event.target.value)}
                    rows={3}
                    maxLength={1500}
                    disabled={busy}
                    spellCheck={false}
                    aria-label="Keep out of the video"
                    className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus:border-[#fff05a]/40 disabled:opacity-70"
                  />
                </div>
              )}
            </div>
          )}
        </Section>

        {review.notes.length > 0 && (
          <Section title="Good to know">
            <ul className="space-y-1.5">
              {review.notes.map((note) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed text-white/55">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" /> {note}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-white/8 bg-[#111114]/95 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-end">
        {short && <span className="text-xs text-red-300 sm:mr-auto">You have {credits} credits; this video needs {cost}.</span>}
        {!short && edited && <span className="text-xs text-white/45 sm:mr-auto">Your changes will be used.</span>}
        {!short && !edited && redraft && <span className="text-xs text-white/40 sm:mr-auto">Change a shot, the people, the place or an image above.</span>}
        <button
          type="button"
          onClick={approve}
          disabled={busy || short || !prompt.trim() || uploading !== null}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 sm:order-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Starting…' : redraft ? `Make the new draft · ${cost} credits` : `Approve & render · ${cost} credits`}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-full border border-white/15 px-4 text-sm text-white/75 hover:bg-white/8 hover:text-white disabled:opacity-40 sm:order-1">
          {redraft ? 'Close without changes' : 'Cancel video'}
        </button>
      </div>

      {openReference && <ReferenceDialog reference={openReference} preview={preview} onClose={() => setOpenReference(null)} />}
      <LibraryPicker
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setTarget(null);
        }}
        kind="image"
        title={target === 'add' ? 'Add an image from your Library' : 'Replace with an image from your Library'}
        preview={preview}
        multiple={false}
        confirmLabel={() => (target === 'add' ? 'Add this image' : 'Use this image')}
        onPick={(items) => {
          const item = items[0];
          if (item?.url && target) placeImage(target, item.url, item.name);
          setTarget(null);
        }}
      />
    </div>
  );
}
