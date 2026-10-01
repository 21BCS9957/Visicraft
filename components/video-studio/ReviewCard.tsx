'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { videoQualityLabel } from '@/lib/videoModels';
import { dropImageReference, videoModelName, type VideoReviewState } from '@/lib/video/shared';
import { cx } from '@/components/playground/ui';

export interface ReviewEdits {
  prompt: string;
  negativePrompt?: string;
  frames: string[];
}

/**
 * The approval step before every render: the frame (or the reference images the film is built
 * from) and the exact prompt the video model gets, both editable. Nothing is charged for the
 * video until "Approve & render".
 */
export function ReviewCard({ review, busy, credits, onApprove, onCancel, onView }: {
  review: VideoReviewState;
  busy: boolean;
  /** The user's balance, to warn before approving. */
  credits: number | null;
  onApprove: (edits: ReviewEdits) => void;
  onCancel: () => void;
  onView: (url: string) => void;
}) {
  const [prompt, setPrompt] = useState(review.prompt);
  const [negative, setNegative] = useState(review.negativePrompt ?? '');
  const [frames, setFrames] = useState(review.frames);
  const edited = prompt !== review.prompt || negative !== (review.negativePrompt ?? '') || frames.length !== review.frames.length;
  const short = credits !== null && credits < review.credits;
  const reference = review.mode === 'reference';

  const removeFrame = (index: number) => {
    setFrames((current) => current.filter((_, i) => i !== index));
    setPrompt((current) => dropImageReference(current, index + 1));
  };

  const undo = () => {
    setPrompt(review.prompt);
    setNegative(review.negativePrompt ?? '');
    setFrames(review.frames);
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-[#fff05a]/25 bg-[#fff05a]/[0.035]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <p className="text-base text-white">Review before rendering</p>
          <p className="mt-1 text-xs text-white/50">
            {videoModelName(review.model)} · {review.durationSeconds}s · {videoQualityLabel(review.quality)} · 9:16
          </p>
          {review.writtenBy && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#d9ccff]">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> {review.writtenBy}
            </p>
          )}
        </div>
        <span className="rounded-full border border-[#fff05a]/30 bg-[#fff05a]/10 px-3 py-1 text-xs text-[#fff05a]">
          {review.credits} credits · charged only when you approve
        </span>
      </div>

      <div className="space-y-5 p-5">
        {review.notes.map((note) => (
          <p key={note} className="rounded-xl border border-[#fff05a]/15 bg-black/20 px-3 py-2 text-xs leading-relaxed text-[#fbf2a0]/85">{note}</p>
        ))}

        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
            {reference ? 'Reference images the film is built from' : 'First frame · the video starts here'}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {frames.map((frame, index) => (
              <figure key={frame.url} className="relative w-28 shrink-0">
                <button type="button" onClick={() => onView(frame.url)} title="View larger" className="block w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 !p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.url} alt={frame.label} className="aspect-[9/16] w-full object-cover" />
                </button>
                {reference && frames.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFrame(index)}
                    disabled={busy}
                    aria-label={`Leave out image ${index + 1}`}
                    title="Leave this image out"
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 !p-0 text-white/85 hover:bg-black hover:text-white disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <figcaption className="mt-1.5 text-[10px] leading-snug text-white/55">
                  {reference ? `Image ${index + 1}: ` : ''}{frame.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Prompt the video model gets · edit anything</p>
            {edited && (
              <button type="button" onClick={undo} disabled={busy} className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white disabled:opacity-40">
                <RotateCcw className="h-3 w-3" /> Undo changes
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={12}
            maxLength={6000}
            disabled={busy}
            spellCheck={false}
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus:border-[#fff05a]/40 disabled:opacity-70"
          />
        </div>

        {review.negativePrompt !== undefined && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Keep out of the video (negative prompt)</p>
            <textarea
              value={negative}
              onChange={(event) => setNegative(event.target.value)}
              rows={3}
              maxLength={1500}
              disabled={busy}
              spellCheck={false}
              className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus:border-[#fff05a]/40 disabled:opacity-70"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
        {short && <span className="mr-auto text-xs text-red-300">You have {credits} credits; this video needs {review.credits}.</span>}
        <button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-full border border-white/15 px-4 text-sm text-white/75 hover:bg-white/8 hover:text-white disabled:opacity-40">
          Cancel video
        </button>
        <button
          type="button"
          onClick={() => onApprove({ prompt, negativePrompt: review.negativePrompt !== undefined ? negative : undefined, frames: frames.map((frame) => frame.url) })}
          disabled={busy || short || !prompt.trim()}
          className={cx('inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40')}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Starting…' : `Approve & render · ${review.credits} credits`}
        </button>
      </div>
    </div>
  );
}
