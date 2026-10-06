'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Check, FileText, Loader2, Search, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { libraryApi } from '@/lib/playground/api';
import { ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { previewLibrary } from '@/lib/playground/preview';
import { uploadImages, uploadLibraryVideo } from '@/lib/playground/upload';
import type { LibraryItem } from '@/lib/playground/types';
import { Markdown } from '../Markdown';
import { cx } from '../ui';
import { ALL_FOLDERS, FolderChips, NO_FOLDER, useLibraryFolders, VideoThumb } from './libraryParts';

const TOAST = { position: 'top-center' as const };
const ROLES: ReferenceRole[] = ['product', 'person', 'style'];

function localItem(kind: LibraryItem['kind'], patch: Partial<LibraryItem>): LibraryItem {
  return {
    id: `local-lib-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind, name: '', url: null, preview: null, length: null, width: null, height: null, mimeType: null, sizeBytes: null,
    source: 'upload', createdAt: new Date().toISOString(), folderId: null, posterUrl: null, durationSeconds: null, analysis: null,
    ...patch,
  };
}

/**
 * Picks images, videos or a guideline document from the Library, folder by folder. Images and
 * videos can be multi-selected (images can be given a role, for references); new images or
 * videos can be uploaded into the Library from here, into `uploadFolder` when it is named.
 */
export function LibraryPicker({ open, onOpenChange, kind, title, description, preview = false, showRole = false, multiple = true, max, exclude, uploadFolder, confirmLabel, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LibraryItem['kind'];
  title: string;
  /** A line under the title, e.g. what the picked items are used for. */
  description?: string;
  preview?: boolean;
  showRole?: boolean;
  multiple?: boolean;
  max?: number;
  /** Items already picked elsewhere, left out of the list. */
  exclude?: string[];
  /** Uploads from here go into this folder (created when missing). */
  uploadFolder?: string;
  confirmLabel?: (count: number, role: ReferenceRole) => string;
  onPick: (items: LibraryItem[], role: ReferenceRole, content: string | null) => void | Promise<void>;
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<ReferenceRole>('product');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<string>(ALL_FOLDERS);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [docContent, setDocContent] = useState<{ id: string; content: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folders = useLibraryFolders(kind, preview, open);
  const setup = setupMessage ?? folders.setupMessage;
  const hidden = new Set(exclude ?? []);
  const visible = (items ?? []).filter((item) => !hidden.has(item.id));

  // Load (and re-search) while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const filter = folder === ALL_FOLDERS ? null : folder;
    const timer = setTimeout(() => {
      if (preview) {
        const sample = previewLibrary(kind)
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .filter((item) => !filter || (filter === NO_FOLDER ? !item.folderId : item.folderId === filter));
        setItems(sample);
        setNextBefore(null);
        return;
      }
      libraryApi.list(kind, { q: search, folder: filter })
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setNextBefore(result.nextBefore);
          setSetupMessage(result.setupMessage ?? null);
        })
        .catch((error) => !cancelled && toast.error(error instanceof Error ? error.message : 'Could not load your library', TOAST));
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, kind, search, folder, preview]);

  // A document's full text for the preview pane.
  useEffect(() => {
    if (kind !== 'document' || !open) return;
    const id = selected[0];
    if (!id || docContent?.id === id) return;
    const item = items?.find((known) => known.id === id);
    if (preview && item) {
      setDocContent({ id, content: item.preview ?? '' });
      return;
    }
    libraryApi.get(id).then(({ content }) => setDocContent({ id, content: content ?? '' })).catch(() => undefined);
  }, [kind, open, selected, items, preview, docContent?.id]);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((known) => known !== id);
      if (!multiple) return [id];
      if (max && current.length >= max) {
        toast.error(`Pick up to ${max}.`, TOAST);
        return current;
      }
      return [...current, id];
    });
  };

  /** The folder uploads go into: the open one, else `uploadFolder` (created when missing). */
  const targetFolder = async (): Promise<string | null> => {
    if (folder !== ALL_FOLDERS && folder !== NO_FOLDER) return folder;
    if (!uploadFolder || setup) return null;
    const existing = folders.folders.find((known) => known.name.toLowerCase() === uploadFolder.toLowerCase());
    return existing?.id ?? (await folders.create(uploadFolder))?.id ?? null;
  };

  const upload = async (files: File[]) => {
    if (!files.length) return;
    const room = max ? Math.max(0, max - selected.length) : files.length;
    const chosen = kind === 'video' ? files.slice(0, Math.max(1, Math.min(room || 1, 10))) : files;
    setUploading(chosen.length);
    try {
      const into = await targetFolder();
      let added: LibraryItem[] = [];
      if (kind === 'video') {
        const uploaded = (await Promise.all(chosen.map((file) => uploadLibraryVideo(file, { preview }).catch((error) => {
          toast.error(error instanceof Error ? error.message : `Could not upload ${file.name}`, TOAST);
          return null;
        })))).filter((video): video is NonNullable<typeof video> => video !== null);
        if (!uploaded.length) return;
        added = preview
          ? uploaded.map((video) => localItem('video', { name: video.name, url: video.url, posterUrl: video.posterUrl, durationSeconds: video.durationSeconds, width: video.width, height: video.height, mimeType: video.mimeType, sizeBytes: video.sizeBytes, folderId: into }))
          : (await libraryApi.addVideos(uploaded, into)).items;
      } else {
        const uploaded = await uploadImages(chosen, { preview, onError: (message) => toast.error(message, TOAST) });
        if (!uploaded.length) return;
        added = preview
          ? uploaded.map((image) => localItem('image', { name: image.name, url: image.url, width: image.width, height: image.height, mimeType: image.mimeType, sizeBytes: image.sizeBytes, folderId: into }))
          : (await libraryApi.addImages(uploaded, into)).items;
      }
      if (into) folders.recount(null, into, added.length);
      setItems((current) => [...added, ...(current ?? [])]);
      setSelected((current) => {
        if (!multiple) return [added[0].id];
        const next = [...current, ...added.map((item) => item.id)];
        return max ? next.slice(0, max) : next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload', TOAST);
    } finally {
      setUploading(0);
    }
  };

  const loadMore = async () => {
    if (!nextBefore || preview) return;
    const result = await libraryApi.list(kind, { before: nextBefore, q: search, folder: folder === ALL_FOLDERS ? null : folder });
    setItems((current) => [...(current ?? []), ...result.items]);
    setNextBefore(result.nextBefore);
  };

  const confirm = async () => {
    const picked = (items ?? []).filter((item) => selected.includes(item.id));
    if (!picked.length) return;
    setBusy(true);
    try {
      await onPick(picked, role, kind === 'document' ? docContent?.content ?? null : null);
      setSelected([]);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const label = confirmLabel ? confirmLabel(selected.length, role) : `Use ${selected.length || ''}`.trim();
  const canUpload = kind === 'image' || (kind === 'video' && !setup);
  const empty = search
    ? 'Nothing matches that name.'
    : folder !== ALL_FOLDERS
      ? 'Nothing in this folder.'
      : kind === 'image'
        ? 'Your library is empty. Upload images here or save them from a project.'
        : kind === 'video'
          ? 'No videos yet. Upload one here (MP4, MOV or WebM, up to 50 MB and 3 minutes).'
          : 'No guideline documents yet. Save one from a project’s Guidelines.';

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[86vh] w-[min(920px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/12 bg-[#141418] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-medium">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'mt-0.5 text-xs leading-relaxed text-white/50' : 'sr-only'}>{description ?? 'Choose from your Library'}</Dialog.Description>
            </div>
            <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-white/40" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="w-32 bg-transparent text-white outline-none placeholder:text-white/30 sm:w-40" />
            </label>
            {canUpload && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {uploading ? `Uploading ${uploading}…` : 'Upload'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'}
                  multiple={multiple}
                  className="hidden"
                  onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }}
                />
              </>
            )}
            <Dialog.Close className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
          </div>

          {!setup && (folders.folders.length > 0 || kind !== 'document') && (
            <div className="border-b border-white/8 px-5 py-3">
              <FolderChips compact folders={folders.folders} active={folder} onSelect={(id) => { setFolder(id); setItems(null); }} onCreate={folders.create} />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {setup && kind === 'video' ? (
              <p className="rounded-2xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-4 py-3 text-sm text-[#fbf2a0]/90">{setup}</p>
            ) : items === null ? (
              <div className="flex items-center justify-center py-16 text-white/45"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your library…</div>
            ) : visible.length === 0 ? (
              <div className="py-16 text-center text-sm text-white/45">{empty}</div>
            ) : kind === 'image' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {visible.map((item) => {
                  const on = selected.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(item.id)} className={cx('group relative overflow-hidden rounded-xl border text-left', on ? 'border-[#fff05a] ring-2 ring-[#fff05a]/40' : 'border-white/10 hover:border-white/25')}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url ?? ''} alt={item.name} loading="lazy" className="aspect-square w-full object-cover" />
                      <span className="block truncate px-2 py-1.5 text-[11px] text-white/70">{item.name || 'Untitled'}</span>
                      {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#fff05a] text-black"><Check className="h-3.5 w-3.5" /></span>}
                    </button>
                  );
                })}
              </div>
            ) : kind === 'video' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                {visible.map((item) => {
                  const on = selected.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(item.id)} className={cx('group relative overflow-hidden rounded-xl border text-left !p-0', on ? 'border-[#fff05a] ring-2 ring-[#fff05a]/40' : 'border-white/10 hover:border-white/25')}>
                      <VideoThumb item={item} className="aspect-[9/16] w-full" />
                      <span className="block truncate px-2 pt-1.5 text-[11px] text-white/75">{item.name || 'Untitled'}</span>
                      <span className="block px-2 pb-1.5 text-[10px] text-white/40">{item.analysis ? `${item.analysis.sequence.length} shots` : 'Shots not read yet'}</span>
                      {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#fff05a] text-black"><Check className="h-3.5 w-3.5" /></span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                <ul className="space-y-1.5">
                  {visible.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => toggle(item.id)} className={cx('flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left', selected.includes(item.id) ? 'border-[#fff05a]/60 bg-[#fff05a]/8' : 'border-white/8 hover:bg-white/5')}>
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-white">{item.name}</span>
                          <span className="block text-[11px] text-white/40">{(item.length ?? 0).toLocaleString('en-IN')} characters</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="min-h-[240px] rounded-2xl border border-white/8 bg-black/20 p-4">
                  {selected[0] && docContent?.id === selected[0]
                    ? <Markdown>{docContent.content}</Markdown>
                    : <p className="text-sm text-white/35">Pick a document to preview it.</p>}
                </div>
              </div>
            )}
            {nextBefore && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => void loadMore()} className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-white/70 hover:bg-white/8">Load more</button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/8 px-5 py-4">
            {showRole && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                Add as
                <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
                  {ROLES.map((option) => (
                    <button key={option} type="button" onClick={() => setRole(option)} className={cx('rounded-full px-3 py-1 text-xs', role === option ? 'bg-white/12 text-white' : 'text-white/50 hover:text-white')}>
                      {ROLE_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <span className="text-xs text-white/40">{selected.length ? `${selected.length} selected` : multiple ? (max ? `Select up to ${max}` : 'Select one or more') : 'Select one'}</span>
            <button type="button" onClick={() => void confirm()} disabled={!selected.length || busy} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
