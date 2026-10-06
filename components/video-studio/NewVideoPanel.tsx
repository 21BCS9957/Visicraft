'use client';

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertCircle, Check, Clapperboard, FolderHeart, Info, Link2, Loader2, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import toast from '@/lib/toast';
import { VIDEO_STYLES, isSpeakingStyle, parseVideoStyle, videoStyleLabel, type VideoStyle } from '@/lib/videoStyles';
import { seedanceSpec, videoCredits, videoEngineOf, type VideoAspect, type VideoQuality } from '@/lib/videoModels';
import { videoApi, type ProductCapture } from '@/lib/video/client';
import { previewCapture } from '@/lib/video/preview';
import { HERO_FRAME_CREDITS } from '@/lib/video/shared';
import { libraryApi, PlaygroundApiError } from '@/lib/playground/api';
import { MAX_REFERENCE_VIDEOS, REFERENCE_VIDEO_FOLDER } from '@/lib/playground/libraryVideo';
import { previewLibrary, previewVideoAnalysis } from '@/lib/playground/preview';
import { uploadImages, uploadLibraryVideo } from '@/lib/playground/upload';
import type { LibraryItem, VideoProjectProduct } from '@/lib/playground/types';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { ShotSequence, VideoThumb } from '@/components/playground/library/libraryParts';
import { cx, Popover, Tip } from '@/components/playground/ui';
import { EnginePicker, LengthQualityPicker, ShapePicker } from './VideoSettings';

const TOAST = { position: 'top-center' as const };
/** Small secondary buttons (Upload, Library). */
const SOFT = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08] hover:text-white disabled:opacity-40';
/** Short names for the style chips; the selected style's description shows under them. */
const STYLE_CHIPS: Record<VideoStyle, string> = {
  ugc: 'UGC review',
  talking_head: 'Talking head',
  demo: 'Product demo',
  cinematic: 'Cinematic',
  any: 'Match reference',
};
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
  /** The video's shape; the frames and prompt are made for it. */
  aspectRatio: VideoAspect;
  style: VideoStyle;
  /** Library videos whose shots the video copies (never sent to the engine). */
  referenceVideoIds: string[];
  notes: string;
}

export interface PlanRequest {
  referenceImages: string[];
  productContext: { title?: string; vendor?: string; description?: string; price?: number; currency?: string } | null;
  title: string | null;
  /** Library videos to copy shots from. */
  referenceVideoIds: string[];
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

/** One numbered step: a one-line title, an optional short hint on the right and one line of help. */
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

/** A reference video the panel shows, with the progress of reading its shots. */
interface ReferenceTile {
  item: LibraryItem;
  watching: boolean;
  error: string | null;
}

/**
 * New video, for one project: the images the video is made from (a store link and/or the
 * user's photos), the reference videos whose shots it copies, the project's guidelines, the
 * style and the engine. The product and the choices are saved with the project through
 * `onProduct` and `onChoices`.
 */
export function NewVideoPanel({ busy, preview, signedIn, credits, initialUrl, product, onProduct, choices, onChoices, guidelines, cardOpen = false, onPlan }: {
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
  /** A video waiting for approval or a new draft is open beside this panel (it has its own length). */
  cardOpen?: boolean;
  onPlan: (request: PlanRequest) => void;
}) {
  const [link, setLink] = useState(initialUrl ?? product.url ?? '');
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [references, setReferences] = useState<Record<string, ReferenceTile>>({});
  const [uploadingReferences, setUploadingReferences] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  // The product as last handed over, so async work (uploads, capture) builds on the newest one.
  const latest = useRef(product);
  useEffect(() => {
    latest.current = product;
  }, [product]);

  const captured = product.storePhotos.length > 0;
  const images = [...product.selected, ...product.photos.map((photo) => photo.url)];
  const room = MAX_VIDEO_PHOTOS - images.length;
  const productTitle = product.title?.trim() || product.name.trim() || null;
  const referenceIds = choices.referenceVideoIds;
  const referenceRoom = MAX_REFERENCE_VIDEOS - referenceIds.length;
  const watchingAny = referenceIds.some((id) => references[id]?.watching);
  const videoCost = videoCredits(choices.model, choices.quality, choices.duration, choices.aspectRatio);
  const seedance = videoEngineOf(choices.model) === 'seedance';
  // Seedance 2.x has no hero frame: planning, plus a second scene image if Claude asks for one.
  const sceneImages = seedance && ['2.0', '2.5'].includes(seedanceSpec(choices.model).family);
  const short = signedIn && !preview && credits < HERO_FRAME_CREDITS;
  const noRealFaces = seedance && !seedanceSpec(choices.model).realFaces;
  const canPlan = !busy && !capturing && uploading === 0 && uploadingReferences === 0 && !watchingAny && images.length > 0 && !short;

  const patchReference = (id: string, patch: Partial<ReferenceTile>) => {
    setReferences((current) => (current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current));
  };

  /** A reference's shots are read as soon as it is added; the result is saved with the Library video. */
  const watchReference = async (item: LibraryItem, again = false) => {
    setReferences((current) => ({ ...current, [item.id]: { item: current[item.id]?.item ?? item, watching: true, error: null } }));
    try {
      if (preview) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        patchReference(item.id, { watching: false, item: { ...item, analysis: previewVideoAnalysis() } });
        return;
      }
      const { item: watched } = await libraryApi.analyze(item.id, again);
      patchReference(item.id, { watching: false, item: watched });
    } catch (error) {
      patchReference(item.id, { watching: false, error: error instanceof Error ? error.message : 'This video could not be read' });
    }
  };

  // The saved reference videos' details (poster, shots); ones gone from the Library are dropped.
  useEffect(() => {
    const missing = referenceIds.filter((id) => !references[id]);
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, ReferenceTile> = {};
      const gone: string[] = [];
      await Promise.all(missing.map(async (id) => {
        if (preview) {
          const item = previewLibrary('video').find((known) => known.id === id);
          if (item) found[id] = { item, watching: false, error: null };
          else gone.push(id);
          return;
        }
        try {
          const { item } = await libraryApi.get(id);
          found[id] = { item, watching: false, error: null };
        } catch (error) {
          if (error instanceof PlaygroundApiError && error.status === 404) gone.push(id);
        }
      }));
      if (cancelled) return;
      setReferences((current) => ({ ...found, ...current }));
      if (gone.length) onChoices({ referenceVideoIds: referenceIds.filter((id) => !gone.includes(id)) });
    })();
    return () => {
      cancelled = true;
    };
  }, [referenceIds.join(','), preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const addReferences = (items: LibraryItem[]) => {
    const fresh = items.filter((item) => item.kind === 'video' && !referenceIds.includes(item.id)).slice(0, Math.max(0, referenceRoom));
    if (!fresh.length) return;
    setReferences((current) => ({ ...current, ...Object.fromEntries(fresh.map((item) => [item.id, { item, watching: false, error: null }])) }));
    onChoices({ referenceVideoIds: [...referenceIds, ...fresh.map((item) => item.id)] });
    for (const item of fresh) if (!item.analysis) void watchReference(item);
  };

  const removeReference = (id: string) => {
    onChoices({ referenceVideoIds: referenceIds.filter((known) => known !== id) });
  };

  /** Uploads go into the Library's "Reference videos" folder, then join this video. */
  const uploadReferences = async (files: File[]) => {
    const videos = files.slice(0, Math.max(0, referenceRoom));
    if (!videos.length) {
      if (files.length) toast.error(`Up to ${MAX_REFERENCE_VIDEOS} reference videos per video.`, TOAST);
      return;
    }
    setUploadingReferences(videos.length);
    try {
      const uploaded = (await Promise.all(videos.map((file) => uploadLibraryVideo(file, { preview }).catch((error) => {
        toast.error(error instanceof Error ? error.message : `Could not upload ${file.name}`, TOAST);
        return null;
      })))).filter((video): video is NonNullable<typeof video> => video !== null);
      if (!uploaded.length) return;
      if (preview) {
        addReferences(uploaded.map((video, index) => ({
          id: `local-ref-${Date.now()}-${index}`, kind: 'video', name: video.name, url: video.url, preview: null, length: null,
          width: video.width, height: video.height, mimeType: video.mimeType, sizeBytes: video.sizeBytes, source: 'upload',
          createdAt: new Date().toISOString(), folderId: null, posterUrl: video.posterUrl, durationSeconds: video.durationSeconds, analysis: null,
        })));
        return;
      }
      const folder = await libraryApi.folders.create('video', REFERENCE_VIDEO_FOLDER).then((result) => result.folder.id).catch(() => null);
      addReferences((await libraryApi.addVideos(uploaded, folder)).items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the video', TOAST);
    } finally {
      setUploadingReferences(0);
    }
  };

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
      referenceVideoIds: referenceIds,
      notes: choices.notes.trim(),
      choices,
    });
  };

  const style = VIDEO_STYLES.find((option) => option.id === choices.style) ?? VIDEO_STYLES[VIDEO_STYLES.length - 1];
  const photoHint = images.length ? `${images.length} of ${MAX_VIDEO_PHOTOS}` : `Up to ${MAX_VIDEO_PHOTOS}`;

  return (
    <div className="flex min-h-full flex-col">
      <p className="px-4 pt-4 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40 max-lg:hidden">New video</p>

      <Step n={1} title="Images in your video" hint={photoHint} note="Your video is made from these, with the product kept exact.">
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx('space-y-2.5 rounded-2xl transition-colors', dragging && 'bg-[#fff05a]/[0.05] ring-1 ring-[#fff05a]/40')}
        >
          {captured ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.storePhotos[0]} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-white/10 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-snug text-white">{product.title ?? 'Product'}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">
                    {[formatPrice(product.price, product.currency), product.vendor].filter(Boolean).join(' · ') || `${product.storePhotos.length} photos`}
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
              <p className="mt-2 text-[11px] text-white/35">Tap a photo to leave it out</p>
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
                aria-label="Product link"
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
                    className="absolute inset-0 flex items-center justify-center bg-black/55 !p-0 text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 disabled:hidden"
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
            <button type="button" disabled={busy || room <= 0 || uploading > 0} onClick={() => fileInput.current?.click()} className={SOFT}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {uploading ? `Uploading ${uploading}…` : 'Upload'}
            </button>
            <button type="button" disabled={busy || room <= 0} onClick={() => setLibraryOpen(true)} className={SOFT}>
              <FolderHeart className="h-3.5 w-3.5" /> Library
            </button>
          </div>

          {!captured && product.photos.length > 0 && (
            <input
              value={product.name}
              onChange={(event) => update({ name: event.target.value })}
              maxLength={160}
              disabled={busy}
              aria-label="Product name"
              placeholder="Product name (optional)"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
            />
          )}
        </div>
      </Step>

      <Step
        n={2}
        title="Reference videos"
        hint={referenceIds.length ? `${referenceIds.length} of ${MAX_REFERENCE_VIDEOS}` : 'Optional'}
        note="We copy their shots and pacing, never their product, people or text."
      >
        <div className="space-y-2.5">
          {referenceIds.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {referenceIds.map((id) => {
                const tile = references[id];
                const analysis = tile?.item.analysis ?? null;
                return (
                  <div key={id} className="min-w-0">
                    <div className="relative overflow-hidden rounded-xl border border-white/10">
                      {tile ? <VideoThumb item={tile.item} className="aspect-[9/16] w-full" /> : <span className="flex aspect-[9/16] w-full items-center justify-center bg-black/30"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></span>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeReference(id)}
                        aria-label={`Remove ${tile?.item.name || 'reference video'}`}
                        title="Remove from this video"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 !p-0 text-white/85 hover:bg-black hover:text-white disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-white/75" title={tile?.item.name}>{tile?.item.name || 'Reference video'}</p>
                    {tile?.watching ? (
                      <p className="flex items-center gap-1 text-[10px] text-white/45"><Loader2 className="h-3 w-3 animate-spin" /> Reading shots…</p>
                    ) : analysis ? (
                      <Popover
                        side="bottom"
                        align="start"
                        className="w-[min(360px,calc(100vw-32px))] p-3"
                        trigger={<button type="button" className="text-left text-[10px] text-[#d9ccff] underline-offset-2 hover:underline">{analysis.sequence.length} shots</button>}
                      >
                        <ShotSequence analysis={analysis} compact />
                      </Popover>
                    ) : tile?.error ? (
                      <button type="button" onClick={() => void watchReference(tile.item)} title={tile.error} className="flex items-center gap-1 text-left text-[10px] text-red-300 hover:text-red-200">
                        <AlertCircle className="h-3 w-3 shrink-0" /> Retry
                      </button>
                    ) : tile ? (
                      <button type="button" onClick={() => void watchReference(tile.item)} className="flex items-center gap-1 text-left text-[10px] text-white/50 hover:text-[#fff05a]">
                        <RotateCcw className="h-3 w-3" /> Read shots
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={referenceInput}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              multiple
              className="hidden"
              onChange={(event) => {
                void uploadReferences(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <button type="button" disabled={busy || referenceRoom <= 0 || uploadingReferences > 0} onClick={() => referenceInput.current?.click()} className={SOFT}>
              {uploadingReferences ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {uploadingReferences ? `Uploading ${uploadingReferences}…` : 'Upload'}
            </button>
            <button type="button" disabled={busy || referenceRoom <= 0} onClick={() => setReferencePickerOpen(true)} className={SOFT}>
              <Clapperboard className="h-3.5 w-3.5" /> Library
            </button>
          </div>
        </div>
      </Step>

      <section className="border-b border-white/6 px-4 py-3">{guidelines}</section>

      <Step n={3} title="Style">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Style">
          {VIDEO_STYLES.map((option) => {
            const on = choices.style === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => onChoices({ style: parseVideoStyle(option.id) ?? 'any' })}
                className={cx('h-8 rounded-full border px-3 text-xs transition-colors disabled:opacity-60', on ? 'border-[#fff05a]/50 bg-[#fff05a]/10 text-[#fff05a]' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/25 hover:text-white')}
              >
                {STYLE_CHIPS[option.id]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-white/40">{style.description}</p>
      </Step>

      <Step n={4} title="Engine & format">
        <div className="space-y-3">
          <EnginePicker model={choices.model} onModel={(model) => onChoices({ model })} disabled={busy} />
          {noRealFaces && isSpeakingStyle(choices.style) && (
            <p className="rounded-xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-3 py-2 text-[11px] leading-snug text-[#fbf2a0]/85">
              {seedanceSpec(choices.model).name} can’t show a realistic person, so a {videoStyleLabel(choices.style)} may come out product-only. Pick Google Veo for a person on screen.
            </p>
          )}
          <ShapePicker model={choices.model} value={choices.aspectRatio} onChange={(aspectRatio) => onChoices({ aspectRatio })} disabled={busy} />
          <LengthQualityPicker
            model={choices.model}
            duration={choices.duration}
            quality={choices.quality}
            aspectRatio={choices.aspectRatio}
            onDuration={(duration) => onChoices({ duration })}
            onQuality={(quality) => onChoices({ quality })}
            disabled={busy}
          />
          {cardOpen && (
            <p className="text-[11px] leading-snug text-white/45">These are for your next new video. To change the open video’s length, use Length in its card; its shape is set when it’s planned.</p>
          )}
        </div>
      </Step>

      <Step n={5} title="Notes" hint="Optional">
        <textarea
          value={choices.notes}
          onChange={(event) => onChoices({ notes: event.target.value })}
          maxLength={1500}
          rows={3}
          disabled={busy}
          placeholder="e.g. 20% launch offer, show it on a work desk, a calm female voice"
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
          {busy ? 'Planning your video…' : `Plan my video · ${sceneImages ? `up to ${HERO_FRAME_CREDITS * 2}` : HERO_FRAME_CREDITS} credits`}
        </button>
        <p className={cx('mt-2 flex items-center justify-center gap-1 text-center text-[11px]', short ? 'text-red-300' : 'text-white/40')}>
          {short
            ? `You need ${HERO_FRAME_CREDITS} credits to plan; you have ${credits}.`
            : watchingAny
              ? 'Reading your reference videos…'
              : <>
                  The video ({videoCost} credits) is charged when you approve it.
                  {sceneImages && (
                    <Tip text={`${HERO_FRAME_CREDITS} to plan, including one scene image if one is needed. ${HERO_FRAME_CREDITS} more only if a second scene image is made.`}>
                      <button type="button" aria-label="How planning is charged" className="rounded-full !p-0.5 text-white/40 hover:text-white"><Info className="h-3 w-3" /></button>
                    </Tip>
                  )}
                </>}
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

      <LibraryPicker
        open={referencePickerOpen}
        onOpenChange={setReferencePickerOpen}
        kind="video"
        title="Reference videos from your Library"
        description="Your video copies their shots and pacing. They never appear in it."
        preview={preview}
        max={Math.max(1, referenceRoom)}
        exclude={referenceIds}
        uploadFolder={REFERENCE_VIDEO_FOLDER}
        confirmLabel={(count) => (count ? `Use ${count} video${count === 1 ? '' : 's'}` : 'Use')}
        onPick={(items) => addReferences(items)}
      />
    </div>
  );
}
