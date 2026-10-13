'use client';

import { useRef, useState, type ReactNode } from 'react';
import { FolderHeart, Loader2, Sparkles, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { faceIsReady } from '@/lib/video/faces';
import { seedanceSpec, snapVideoDuration, videoCredits, videoEngineOf, type VideoAspect, type VideoQuality } from '@/lib/videoModels';
import { uploadImages } from '@/lib/playground/upload';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { FacesSection, useFaces } from './FacesSection';
import type { VideoChoices } from './NewVideoPanel';
import { LengthQualityPicker, ShapePicker } from './VideoSettings';

const TOAST = { position: 'top-center' as const };
const SOFT = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08] hover:text-white disabled:opacity-40';
/** Quick videos are Seedance; 2.5 unless another Seedance model is picked. */
export const QUICK_VIDEO_MODEL = 'dreamina-seedance-2-5-260628';
const MAX_PROMPT = 1500;

export interface QuickRequest {
  prompt: string;
  imageUrl: string | null;
  faceId: string | null;
  model: string;
  duration: number;
  quality: VideoQuality;
  aspectRatio: VideoAspect;
}

function Step({ n, title, hint, note, children }: { n: number; title: string; hint?: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/6 px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-medium text-white/70">{n}</span>
        <h3 className="min-w-0 flex-1 truncate text-sm text-white">{title}</h3>
        {hint && <span className="shrink-0 text-[11px] text-white/35">{hint}</span>}
      </div>
      {note && <p className="mt-1 pl-7 text-[11px] leading-snug text-white/40">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Quick video: a sentence or two, and if the user likes an image to start from and a verified
 * face, straight to Seedance (no product capture, no prompt writing). It opens the usual
 * approval card; the video is charged when it's approved.
 */
export function QuickVideoPanel({ busy, preview, signedIn, choices, onChoices, cardOpen = false, onMake }: {
  busy: boolean;
  preview: boolean;
  signedIn: boolean;
  choices: VideoChoices;
  onChoices: (patch: Partial<VideoChoices>) => void;
  cardOpen?: boolean;
  onMake: (request: QuickRequest) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [faceId, setFaceId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const faces = useFaces(preview, signedIn || preview);

  const model = videoEngineOf(choices.model) === 'seedance' && seedanceSpec(choices.model).family !== '1.0' ? choices.model : QUICK_VIDEO_MODEL;
  const face = faces.state?.faces.find((known) => known.id === faceId && faceIsReady(known)) ?? null;
  // Seedance 2.5 keeps the shape of the image it starts from.
  const shapeFromImage = Boolean(image) && !face && seedanceSpec(model).family === '2.5';
  const seconds = snapVideoDuration(model, choices.duration);
  const cost = videoCredits(model, choices.quality, seconds, choices.aspectRatio);
  const canMake = !busy && !uploading && prompt.trim().length >= 3;

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('That file isn’t an image.', TOAST);
      return;
    }
    setUploading(true);
    try {
      const [done] = await uploadImages([file], { preview, onError: (message) => toast.error(message, TOAST) });
      if (done) setImage({ url: done.url, name: done.name });
    } finally {
      setUploading(false);
    }
  };

  const make = () => {
    if (!canMake) return;
    onMake({ prompt: prompt.trim(), imageUrl: image?.url ?? null, faceId: face?.id ?? null, model, duration: seconds, quality: choices.quality, aspectRatio: choices.aspectRatio });
  };

  return (
    <div className="flex min-h-full flex-col">
      <Step n={1} title="Describe your video" hint={`${prompt.length}/${MAX_PROMPT}`}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT))}
          rows={5}
          disabled={busy}
          placeholder="e.g. A woman in a red Banarasi saree walks through a sunlit haveli courtyard, the camera slowly pushes in, soft sitar music"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/25"
        />
        <p className="mt-1.5 text-[11px] leading-snug text-white/40">Sent to Seedance as you write it. Say what happens, how the camera moves and any sound.</p>
      </Step>

      <Step n={2} title="Start from an image" hint="Optional" note="The video starts from it. A photo with a real person’s face renders without sound; for sound, use a verified face below.">
        {image ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" className="h-16 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
            <p className="min-w-0 flex-1 truncate text-xs text-white/75">{image.name || 'Your image'}</p>
            <button type="button" onClick={() => setImage(null)} disabled={busy} aria-label="Remove the image" title="Remove the image" className="rounded-full !p-1 text-white/45 hover:bg-white/8 hover:text-white disabled:opacity-40">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || uploading} className={SOFT}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
            </button>
            <button type="button" onClick={() => setLibraryOpen(true)} disabled={busy || uploading} className={SOFT}>
              <FolderHeart className="h-3.5 w-3.5" /> Library
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </Step>

      <Step n={3} title="Who’s in it" hint="Optional" note="A verified face stays the same in every shot, with sound. Each person scans their own face once.">
        <FacesSection preview={preview} faces={faces} selectedId={face?.id ?? null} onSelect={setFaceId} disabled={busy} />
      </Step>

      <Step n={4} title="Format">
        <div className="space-y-3">
          <ShapePicker model={model} value={choices.aspectRatio} onChange={(aspectRatio) => onChoices({ aspectRatio })} disabled={busy || shapeFromImage} />
          {shapeFromImage && <p className="-mt-1 text-[11px] text-white/45">The video takes your image’s shape.</p>}
          <LengthQualityPicker
            model={model}
            duration={seconds}
            quality={choices.quality}
            aspectRatio={choices.aspectRatio}
            onDuration={(duration) => onChoices({ duration })}
            onQuality={(quality) => onChoices({ quality })}
            disabled={busy}
          />
          {cardOpen && <p className="text-[11px] leading-snug text-white/45">These are for your next video. The open card has its own length.</p>}
        </div>
      </Step>

      <div className="sticky bottom-0 mt-auto border-t border-white/8 bg-[#0c0c0f]/95 p-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={make}
          disabled={!canMake}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fff05a] text-sm font-medium text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Getting it ready…' : 'Make my video'}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">About {cost} credits, charged only when you approve it.</p>
      </div>

      <LibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        kind="image"
        title="An image from your Library"
        description="Your video starts from it."
        preview={preview}
        multiple={false}
        max={1}
        confirmLabel={() => 'Use this image'}
        onPick={(items) => {
          const item = items[0];
          if (item?.url) setImage({ url: item.url, name: item.name });
        }}
      />
    </div>
  );
}
