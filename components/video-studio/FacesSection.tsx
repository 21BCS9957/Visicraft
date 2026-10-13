'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Check, Copy, ImagePlus, Loader2, MessageCircle, Plus, RotateCcw, ScanFace, Trash2, X } from 'lucide-react';
import toast from '@/lib/toast';
import { videoApi } from '@/lib/video/client';
import { faceIsReady, MAX_FACE_PHOTOS, MAX_FACES, type FacesState, type VideoFace } from '@/lib/video/faces';
import { uploadImages } from '@/lib/playground/upload';
import { cx } from '@/components/playground/ui';

const TOAST = { position: 'top-center' as const };
const SOFT = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08] hover:text-white disabled:opacity-40';

/* ------------------------------------------------------------------- data */

export const PREVIEW_FACE_PHOTO = 'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/91_fb2dd131-c904-44d0-9c78-90b16b097866.jpg';

/** Sample faces for the Studio preview (?previewVideoStudio=1): one ready, one waiting for its scan. */
function previewFaces(): FacesState {
  const now = Date.now();
  return {
    faces: [
      { id: 'preview-face-ready', name: 'Priya', status: 'verified', scanLink: null, scanExpiresAt: null, error: null, createdAt: new Date(now - 86_400_000).toISOString(), photos: [{ id: 'preview-photo-1', url: PREVIEW_FACE_PHOTO, status: 'active', error: null, createdAt: new Date(now - 86_000_000).toISOString() }] },
    ],
    missing: [],
    setupMessage: null,
  };
}

/**
 * The signed-in user's verified faces, kept fresh: while a face waits for its scan or a photo
 * waits for BytePlus's check, each one is asked about every 4 seconds (the tab visible).
 */
export function useFaces(preview: boolean, enabled: boolean) {
  const [state, setState] = useState<FacesState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (preview ? Promise.resolve(previewFaces()) : videoApi.faces.list())
      .then((next) => {
        if (!active) return;
        if (next.missing.length > 0 || next.setupMessage) {
          console.warn('Verified faces are off:', next.setupMessage ?? `set ${next.missing.join(' and ')}`);
        }
        setState(next);
      })
      .catch((failure) => active && setError(failure instanceof Error ? failure.message : 'Your faces could not be loaded.'));
    return () => {
      active = false;
    };
  }, [preview, enabled]);

  const pending = (state?.faces ?? [])
    .filter((face) => (face.status === 'verifying' && face.scanLink) || face.photos.some((photo) => photo.status === 'processing'))
    .map((face) => face.id)
    .join(',');

  useEffect(() => {
    if (!pending || preview) return;
    const ids = pending.split(',');
    let running = false;
    const timer = window.setInterval(() => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      void Promise.all(ids.map((id) => videoApi.faces.get(id).catch(() => null)))
        .then((fresh) => setState((current) => current && { ...current, faces: current.faces.map((face) => fresh.find((next) => next?.id === face.id) ?? face) }))
        .finally(() => {
          running = false;
        });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [pending, preview]);

  const put = (face: VideoFace) => setState((current) => current && {
    ...current,
    faces: current.faces.some((known) => known.id === face.id) ? current.faces.map((known) => (known.id === face.id ? face : known)) : [face, ...current.faces],
  });
  const drop = (id: string) => setState((current) => current && { ...current, faces: current.faces.filter((face) => face.id !== id) });

  return { state, error, put, drop };
}

export type FacesHandle = ReturnType<typeof useFaces>;

/** Verified faces need BytePlus keys and the faces migration; neither is something the signed-in person can fix. */
function facesUnavailable(state: FacesState): boolean {
  return state.missing.length > 0 || Boolean(state.setupMessage);
}

/* ------------------------------------------------------------------- pieces */

function StatusChip({ face }: { face: VideoFace }) {
  if (faceIsReady(face)) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"><Check className="h-3 w-3" /> Ready</span>;
  if (face.status === 'verified') return <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-white/60">Verified · add a photo</span>;
  if (face.status === 'verifying') return <span className="inline-flex items-center gap-1 rounded-full border border-[#fff05a]/25 bg-[#fff05a]/10 px-2 py-0.5 text-[10px] font-medium text-[#fff05a]"><Loader2 className="h-3 w-3 animate-spin" /> Waiting for scan</span>;
  if (face.status === 'expired') return <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-white/55">Link expired</span>;
  return <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-300">Scan failed</span>;
}

function minutesLeft(until: string | null): number | null {
  if (!until) return null;
  return Math.max(0, Math.round((Date.parse(until) - Date.now()) / 60_000));
}

/** The one-time scan link as a QR code (to scan with the person's phone), with Copy and WhatsApp. */
function ScanLink({ face }: { face: VideoFace }) {
  const [qr, setQr] = useState<string | null>(null);
  const link = face.scanLink;
  useEffect(() => {
    if (!link) return;
    let active = true;
    void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } }).then((url) => active && setQr(url)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [link]);
  if (!link) return null;
  const left = minutesLeft(face.scanExpiresAt);
  const message = `Hi ${face.name}, please scan your face once so we can use it in our videos: ${link}`;
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-start gap-3">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt="Face scan link as a QR code" className="h-full w-full" /> : <span className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-black/50" /></span>}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] leading-snug text-white/65">{face.name} scans this with their phone camera and follows the steps (about a minute). Only {face.name} can do it.</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.success('Link copied', TOAST))} className={SOFT}><Copy className="h-3.5 w-3.5" /> Copy link</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={SOFT}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
          </div>
          {left !== null && <p className="text-[10.5px] text-white/40">Works once · {left} min left</p>}
        </div>
      </div>
    </div>
  );
}

function FaceCard({ face, preview, selected, selectable, disabled, onSelect, faces }: {
  face: VideoFace;
  preview: boolean;
  selected: boolean;
  selectable: boolean;
  disabled: boolean;
  onSelect: () => void;
  faces: FacesHandle;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = faceIsReady(face);
  const cover = face.photos.find((photo) => photo.status === 'active') ?? face.photos[0];
  const room = MAX_FACE_PHOTOS - face.photos.filter((photo) => photo.status !== 'failed').length;

  const run = async (what: string, action: () => Promise<void>) => {
    setBusy(what);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That didn’t work. Try again.', { ...TOAST, duration: 7000 });
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = (file: File) => run('photo', async () => {
    const [uploaded] = await uploadImages([file], { preview, onError: (message) => toast.error(message, TOAST) });
    if (!uploaded) return;
    if (preview) {
      const photo = { id: `preview-photo-${Date.now()}`, url: uploaded.url, status: 'processing' as const, error: null, createdAt: new Date().toISOString() };
      faces.put({ ...face, photos: [...face.photos, photo] });
      window.setTimeout(() => faces.put({ ...face, photos: [...face.photos, { ...photo, status: 'active' }] }), 2500);
      return;
    }
    faces.put(await videoApi.faces.addPhoto(face.id, uploaded.url));
  });

  const removePhoto = (photoId: string) => run(photoId, async () => {
    faces.put(preview ? { ...face, photos: face.photos.filter((photo) => photo.id !== photoId) } : await videoApi.faces.removePhoto(face.id, photoId));
  });

  const remove = () => {
    if (!window.confirm(`Remove ${face.name}? Their face is also removed from BytePlus. Videos already made keep it.`)) return;
    void run('remove', async () => {
      if (!preview) await videoApi.faces.remove(face.id);
      faces.drop(face.id);
    });
  };

  const rescan = () => run('rescan', async () => {
    faces.put(preview ? { ...face, status: 'verifying', scanLink: 'https://example.com/scan', scanExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } : await videoApi.faces.rescan(face.id));
  });

  return (
    <div className={cx('rounded-2xl border p-3 transition-colors', selected ? 'border-[#fff05a]/60 bg-[#fff05a]/[0.06]' : 'border-white/10 bg-black/25')}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSelect}
          disabled={!selectable || disabled}
          aria-pressed={selected}
          title={selectable ? (selected ? 'Leave them out of this video' : `Put ${face.name} in this video`) : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left !p-0 disabled:cursor-default"
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
            {cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={cover.url} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full items-center justify-center text-white/45"><ScanFace className="h-5 w-5" /></span>}
            {selected && <span className="absolute inset-0 flex items-center justify-center bg-black/45"><Check className="h-5 w-5 text-[#fff05a]" strokeWidth={3} /></span>}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-white">{face.name}</span>
            <span className="mt-0.5 block"><StatusChip face={face} /></span>
          </span>
        </button>
        <button type="button" onClick={remove} disabled={busy !== null} title={`Remove ${face.name}`} aria-label={`Remove ${face.name}`} className="rounded-full !p-1.5 text-white/40 hover:bg-white/8 hover:text-red-300 disabled:opacity-40">
          {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {face.status === 'verifying' && <ScanLink face={face} />}

      {(face.status === 'expired' || face.status === 'failed') && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <p className="text-[11px] text-white/55">{face.status === 'expired' ? 'The scan link wasn’t used in time.' : face.error ?? 'The face scan didn’t pass.'}</p>
          <button type="button" onClick={() => void rescan()} disabled={busy !== null} className={SOFT}>
            {busy === 'rescan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} New link
          </button>
        </div>
      )}

      {face.status === 'verified' && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {face.photos.map((photo) => (
              <div key={photo.id} className="group relative h-16 w-12 overflow-hidden rounded-lg border border-white/10" title={photo.error ?? undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className={cx('h-full w-full object-cover', photo.status !== 'active' && 'opacity-50')} />
                {photo.status === 'processing' && <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white" /></span>}
                {photo.status === 'failed' && <span className="absolute inset-0 flex items-center justify-center bg-red-500/30"><AlertCircle className="h-4 w-4 text-white" /></span>}
                <button type="button" onClick={() => void removePhoto(photo.id)} disabled={busy !== null} aria-label="Remove this photo" className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 !p-0.5 text-white group-hover:block">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {room > 0 && (
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="flex h-16 w-12 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-[9px] text-white/50 hover:border-[#fff05a]/40 hover:text-white disabled:opacity-40">
                {busy === 'photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Photo
              </button>
            )}
          </div>
          {!ready && (
            <p className="mt-2 text-[11px] leading-snug text-white/45">
              {face.photos.some((photo) => photo.status === 'processing')
                ? 'BytePlus is checking the photo (usually a few minutes).'
                : `Add 1–${MAX_FACE_PHOTOS} clear photos of ${face.name}: face visible, nobody else in them.`}
            </p>
          )}
          {face.photos.some((photo) => photo.status === 'failed') && (
            <p className="mt-1 text-[11px] leading-snug text-red-300/80">{face.photos.find((photo) => photo.status === 'failed')?.error}</p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addPhoto(file);
              event.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Verified faces: people who scanned their own face once (with BytePlus), so Seedance 2.x keeps
 * their face in a video, with sound. Pick one for the video, or add someone: their name, the
 * uploader's confirmation that they agreed, then the scan link for their phone, then photos.
 */
export function FacesSection({ preview, faces, selectedId, onSelect, disabled }: {
  preview: boolean;
  faces: FacesHandle;
  selectedId: string | null;
  onSelect: (faceId: string | null) => void;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const { state, error } = faces;

  const start = async () => {
    if (!name.trim() || !consent || starting) return;
    setStarting(true);
    try {
      if (preview) {
        const face: VideoFace = { id: `preview-face-${Date.now()}`, name: name.trim(), status: 'verifying', scanLink: 'https://example.com/scan', scanExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), error: null, photos: [], createdAt: new Date().toISOString() };
        faces.put(face);
        window.setTimeout(() => faces.put({ ...face, status: 'verified', scanLink: null, scanExpiresAt: null }), 6000);
      } else {
        faces.put(await videoApi.faces.create(name.trim()));
      }
      setAdding(false);
      setName('');
      setConsent(false);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The face scan could not be started.', { ...TOAST, duration: 8000 });
    } finally {
      setStarting(false);
    }
  };

  if (error) return <p className="text-[11px] text-red-300">{error}</p>;
  if (!state) return <p className="flex items-center gap-2 text-[11px] text-white/40"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your faces…</p>;
  // Face verification is an account-level setup job, so say only what it means for the video.
  if (facesUnavailable(state)) {
    return <p className="text-[11px] leading-snug text-white/45">Verified faces aren’t available yet. Your video still renders from a photo, without sound.</p>;
  }

  return (
    <div className="space-y-2">
      {state.faces.map((face) => (
        <FaceCard
          key={face.id}
          face={face}
          preview={preview}
          faces={faces}
          selected={selectedId === face.id}
          selectable={faceIsReady(face)}
          disabled={disabled}
          onSelect={() => onSelect(selectedId === face.id ? null : face.id)}
        />
      ))}
      {adding ? (
        <div className="space-y-2.5 rounded-2xl border border-white/10 bg-black/25 p-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Their name, e.g. Priya"
            className="h-9 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
          />
          <label className="flex items-start gap-2 text-[11px] leading-snug text-white/60">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#fff05a]" />
            This person agrees to appear in AI-made videos and will scan their own face. (BytePlus only accepts a face its owner scans.)
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void start()} disabled={!name.trim() || !consent || starting} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#fff05a] px-3.5 text-xs font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/40">
              {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanFace className="h-3.5 w-3.5" />} Get the scan link
            </button>
            <button type="button" onClick={() => setAdding(false)} className={SOFT}>Cancel</button>
          </div>
        </div>
      ) : state.faces.length < MAX_FACES ? (
        <button type="button" onClick={() => setAdding(true)} disabled={disabled} className={SOFT}><Plus className="h-3.5 w-3.5" /> Add a face</button>
      ) : (
        <p className="text-[11px] text-white/40">Up to {MAX_FACES} faces. Remove one to add another.</p>
      )}
    </div>
  );
}
