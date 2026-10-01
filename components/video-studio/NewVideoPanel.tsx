'use client';

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Check, FolderHeart, Link2, Loader2, Plus, Sparkles, X } from 'lucide-react';
import toast from '@/lib/toast';
import { VIDEO_STYLES, isSpeakingStyle, parseVideoStyle, videoStyleLabel, type VideoStyle } from '@/lib/videoStyles';
import { seedanceSpec, videoCredits, videoEngineOf, type VideoQuality } from '@/lib/videoModels';
import { videoApi, type ProductCapture } from '@/lib/video/client';
import { previewCapture } from '@/lib/video/preview';
import { HERO_FRAME_CREDITS } from '@/lib/video/shared';
import { uploadImages } from '@/lib/playground/upload';
import type { VideoProjectProduct } from '@/lib/playground/types';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { cx, Toggle } from '@/components/playground/ui';
import { EnginePicker, LengthQualityPicker } from './VideoSettings';

const TOAST = { position: 'top-center' as const };
/** Photos sent to the planner: store photos and uploads together. */
export const MAX_VIDEO_PHOTOS = 12;

export const EMPTY_PRODUCT: VideoProjectProduct = {
  url: null,
  title: null,
  vendor: null,
  description: null,
  price: null,
  currency: null,
  storePhotos: [],
  selected: [],
  photos: [],
  name: '',
};

/** New video's choices as the panel works with them (snapped to what the engine renders). */
export interface VideoChoices {
  model: string;
  duration: number;
  quality: VideoQuality;
  style: VideoStyle;
  /** null: on when there is a product link. */
  research: boolean | null;
  notes: string;
}

export interface PlanRequest {
  referenceImages: string[];
  productContext: { title?: string; vendor?: string; description?: string; price?: number; currency?: string } | null;
  title: string | null;
  research: boolean;
  notes: string;
  choices: VideoChoices;
}

function firstUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[),.]+$/, ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatPrice(price: number | null, currency: string | null): string | null {
  if (!price) return null;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency ?? 'INR', maximumFractionDigits: 0 }).format(price);
  } catch {
    return String(price);
  }
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/6 px-4 py-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-white/60">{n}</span>
        <h3 className="text-sm text-white">{title}</h3>
        {hint && <span className="ml-auto text-[11px] text-white/35">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * New video, for one project: the product (a store link and/or the user's photos), the
 * project's guidelines, the style, research and engine. The product and the choices are saved
 * with the project through `onProduct` and `onChoices`.
 */
export function NewVideoPanel({ busy, preview, signedIn, credits, initialUrl, product, onProduct, choices, onChoices, guidelines, onPlan }: {
  busy: boolean;
  preview: boolean;
  signedIn: boolean;
  credits: number;
  /** A product link handed over from Home ("Make a video instead"). */
  initialUrl: string | null;
  product: VideoProjectProduct;
  onProduct: (next: VideoProjectProduct) => void;
  choices: VideoChoices;
  onChoices: (patch: Partial<VideoChoices>) => void;
  /** The project's guidelines editor. */
  guidelines: ReactNode;
  onPlan: (request: PlanRequest) => void;
}) {
  const [link, setLink] = useState(initialUrl ?? product.url ?? '');
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // The product as last handed over, so async work (uploads, capture) builds on the newest one.
  const latest = useRef(product);
  useEffect(() => {
    latest.current = product;
  }, [product]);

  const captured = product.storePhotos.length > 0;
  const images = [...product.selected, ...product.photos.map((photo) => photo.url)];
  const room = MAX_VIDEO_PHOTOS - images.length;
  const productTitle = product.title?.trim() || product.name.trim() || null;
  const canResearch = Boolean(captured || product.name.trim());
  // On by default for a product link; for photos alone, once the product is named.
  const research = canResearch && (choices.research ?? captured);
  const videoCost = videoCredits(choices.model, choices.quality, choices.duration);
  const short = signedIn && !preview && credits < HERO_FRAME_CREDITS;
  const noRealFaces = videoEngineOf(choices.model) === 'seedance' && !seedanceSpec(choices.model).realFaces;
  const canPlan = !busy && !capturing && uploading === 0 && images.length > 0 && !short;

  const update = (patch: Partial<VideoProjectProduct>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    onProduct(next);
  };

  const fetchProduct = async (value: string) => {
    const url = firstUrl(value);
    if (!url) {
      toast.error('Paste the full product link, starting with https://', TOAST);
      return;
    }
    setCapturing(true);
    try {
      const found: ProductCapture | null = preview
        ? await new Promise<ProductCapture>((resolve) => setTimeout(() => resolve(previewCapture(url)), 900))
        : await videoApi.capture(url);
      if (!found || !found.images.length) throw new Error('No product photos were found on that page.');
      const storePhotos = found.images.map((image) => image.url).slice(0, 24);
      update({
        url,
        title: found.title ?? null,
        vendor: found.vendor ?? null,
        description: found.description ?? null,
        price: found.price ?? null,
        currency: found.currency ?? null,
        storePhotos,
        selected: storePhotos.slice(0, Math.max(1, MAX_VIDEO_PHOTOS - latest.current.photos.length)),
      });
      setLink(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that product page', TOAST);
    } finally {
      setCapturing(false);
    }
  };

  // A link handed over from Home is fetched straight away.
  useEffect(() => {
    if (!initialUrl) return;
    const timer = window.setTimeout(() => void fetchProduct(initialUrl), 0);
    return () => window.clearTimeout(timer);
  }, [initialUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhotos = (added: Array<{ url: string; name: string }>) => {
    const current = latest.current;
    const fresh = added.filter((photo) => !current.photos.some((known) => known.url === photo.url));
    update({ photos: [...current.photos, ...fresh].slice(0, Math.max(0, MAX_VIDEO_PHOTOS - current.selected.length)) });
  };

  const addFiles = async (files: File[]) => {
    const photos = files.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (!photos.length) {
      if (files.length) toast.error(room > 0 ? 'Those files aren’t images.' : `Up to ${MAX_VIDEO_PHOTOS} photos per video.`, TOAST);
      return;
    }
    setUploading(photos.length);
    try {
      const done = await uploadImages(photos, { preview, onError: (message) => toast.error(message, TOAST) });
      addPhotos(done.map((image) => ({ url: image.url, name: image.name })));
    } finally {
      setUploading(0);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const clearStore = () => {
    update({ url: null, title: null, vendor: null, description: null, price: null, currency: null, storePhotos: [], selected: [] });
    setLink('');
  };

  const plan = () => {
    if (!canPlan) return;
    onPlan({
      referenceImages: images,
      productContext: captured
        ? {
            title: product.title ?? undefined,
            vendor: product.vendor ?? undefined,
            description: product.description ?? undefined,
            price: product.price ?? undefined,
            currency: product.currency ?? undefined,
          }
        : product.name.trim() ? { title: product.name.trim() } : null,
      title: productTitle,
      research,
      notes: choices.notes.trim(),
      choices,
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-4 pb-1 pt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40 max-lg:hidden">New video</p>
        <p className="text-xs leading-relaxed text-white/50 lg:mt-1">We plan it, you approve the frames and prompt, then it renders.</p>
      </div>

      <Step n={1} title="Product" hint={images.length ? `${images.length} photo${images.length === 1 ? '' : 's'}` : undefined}>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx('space-y-3 rounded-2xl transition-colors', dragging && 'bg-[#fff05a]/[0.05] ring-1 ring-[#fff05a]/40')}
        >
          {captured ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.storePhotos[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-snug text-white">{product.title ?? 'Product'}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">
                    {[formatPrice(product.price, product.currency), product.vendor, `${product.storePhotos.length} photos`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={clearStore} disabled={busy} aria-label="Use another product" title="Use another product" className="rounded-full !p-1 text-white/45 hover:bg-white/8 hover:text-white disabled:opacity-40">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {product.storePhotos.map((url) => {
                  const on = product.selected.includes(url);
                  return (
                    <button
                      key={url}
                      type="button"
                      disabled={busy || (!on && room <= 0)}
                      onClick={() => update({ selected: on ? product.selected.filter((item) => item !== url) : [...product.selected, url] })}
                      className={cx('relative aspect-square overflow-hidden rounded-lg border !p-0 transition-all disabled:cursor-not-allowed', on ? 'border-[#fff05a] ring-1 ring-[#fff05a]/40' : 'border-white/10 opacity-45 hover:opacity-80')}
                      aria-pressed={on}
                      title={on ? 'Leave this photo out' : 'Use this photo'}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {on && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#fff05a] text-black"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-white/40">{product.selected.length} of {product.storePhotos.length} selected · tap a photo to leave it out</p>
            </div>
          ) : (
            <form
              onSubmit={(event) => { event.preventDefault(); void fetchProduct(link); }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 py-1.5 pl-3 pr-1.5 focus-within:border-white/25"
            >
              <Link2 className="h-4 w-4 shrink-0 text-white/35" />
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                disabled={busy || capturing}
                placeholder="Paste a product link"
                inputMode="url"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              <button type="submit" disabled={busy || capturing || !link.trim()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-40">
                {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {capturing ? 'Reading' : 'Fetch'}
              </button>
            </form>
          )}

          {product.photos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.photos.map((photo) => (
                <div key={photo.url} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => update({ photos: product.photos.filter((item) => item.url !== photo.url) })}
                    aria-label={`Remove ${photo.name || 'photo'}`}
                    className="absolute inset-0 flex items-center justify-center bg-black/55 !p-0 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:hidden"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <button type="button" disabled={busy || room <= 0 || uploading > 0} onClick={() => fileInput.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08] hover:text-white disabled:opacity-40">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {uploading ? `Uploading ${uploading}…` : 'Upload photos'}
            </button>
            <button type="button" disabled={busy || room <= 0} onClick={() => setLibraryOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08] hover:text-white disabled:opacity-40">
              <FolderHeart className="h-3.5 w-3.5" /> From Library
            </button>
          </div>

          {!captured && (
            <label className="block">
              <span className="text-[11px] text-white/45">What is it? <span className="text-white/30">(optional, helps research find its niche)</span></span>
              <input
                value={product.name}
                onChange={(event) => update({ name: event.target.value })}
                maxLength={160}
                disabled={busy}
                placeholder="e.g. Chamomile sleep tea, 30 bags"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
              />
            </label>
          )}
          {!images.length && !capturing && (
            <p className="text-[11px] leading-relaxed text-white/35">Paste a link to use the store’s photos, or add your own photos (drop them here). Up to {MAX_VIDEO_PHOTOS}. Saved with the project.</p>
          )}
        </div>
      </Step>

      <section className="border-b border-white/6 px-4 py-4">{guidelines}</section>

      <Step n={2} title="Style">
        <div className="space-y-1.5">
          {VIDEO_STYLES.map((style) => {
            const on = choices.style === style.id;
            return (
              <button
                key={style.id}
                type="button"
                disabled={busy}
                onClick={() => onChoices({ style: parseVideoStyle(style.id) ?? 'any' })}
                className={cx('flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60', on ? 'border-[#fff05a]/40 bg-[#fff05a]/[0.06]' : 'border-white/8 hover:border-white/20')}
                aria-pressed={on}
              >
                <span className={cx('mt-1 h-3 w-3 shrink-0 rounded-full border', on ? 'border-[#fff05a] bg-[#fff05a]' : 'border-white/30')} />
                <span className="min-w-0">
                  <span className={cx('block text-sm', on ? 'text-[#fff05a]' : 'text-white/90')}>{style.label}</span>
                  <span className="block text-[11px] leading-relaxed text-white/45">{style.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={3} title="Research">
        <div className={cx('flex items-start gap-3 rounded-xl border border-white/8 px-3 py-2.5', !canResearch && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/90">Study winning video ads first</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">
              {canResearch
                ? `Gemini watches the longest-running ${choices.style === 'any' ? '' : `${videoStyleLabel(choices.style)} `}video ads in your niche on Meta India, and Claude Opus 5.5 turns their shot sequence into your prompt · adds 1–2 min`
                : 'Paste a product link, or say what the product is, to research its niche.'}
            </p>
          </div>
          <Toggle checked={research} onCheckedChange={(value) => onChoices({ research: value })} disabled={busy || !canResearch} label="Study winning video ads first" />
        </div>
      </Step>

      <Step n={4} title="Engine & quality">
        <div className="space-y-3">
          <EnginePicker model={choices.model} onModel={(model) => onChoices({ model })} disabled={busy} />
          {noRealFaces && isSpeakingStyle(choices.style) && (
            <p className="rounded-xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-3 py-2 text-[11px] leading-relaxed text-[#fbf2a0]/85">
              {seedanceSpec(choices.model).name} refuses frames with a realistic person, so a {videoStyleLabel(choices.style)} video may come out as a product-only film. For a person on screen, pick Google Veo or Seedance 1.0 Pro.
            </p>
          )}
          <LengthQualityPicker
            model={choices.model}
            duration={choices.duration}
            quality={choices.quality}
            onDuration={(duration) => onChoices({ duration })}
            onQuality={(quality) => onChoices({ quality })}
            disabled={busy}
          />
        </div>
      </Step>

      <Step n={5} title="Notes" hint="optional">
        <textarea
          value={choices.notes}
          onChange={(event) => onChoices({ notes: event.target.value })}
          maxLength={1500}
          rows={3}
          disabled={busy}
          placeholder="What should it say or show? e.g. “Launch offer: 20% off”, show it on a work desk, a calm female voice"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/25"
        />
      </Step>

      <div className="sticky bottom-0 mt-auto border-t border-white/8 bg-[#0c0c0f]/95 p-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={plan}
          disabled={!canPlan}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fff05a] text-sm font-medium text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Planning your video…' : `Plan my video · ${HERO_FRAME_CREDITS} credits`}
        </button>
        <p className={cx('mt-2 text-center text-[11px] leading-relaxed', short ? 'text-red-300' : 'text-white/40')}>
          {short
            ? `Planning needs ${HERO_FRAME_CREDITS} credits; you have ${credits}.`
            : `${HERO_FRAME_CREDITS} now for the hero frame. The video (${videoCost} credits) is charged only when you approve it.`}
        </p>
      </div>

      <LibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        kind="image"
        title="Product photos from your Library"
        preview={preview}
        max={Math.max(1, room)}
        confirmLabel={(count) => (count ? `Use ${count} photo${count === 1 ? '' : 's'}` : 'Use')}
        onPick={(items) => addPhotos(items.flatMap((item) => (item.url ? [{ url: item.url, name: item.name }] : [])))}
      />
    </div>
  );
}
