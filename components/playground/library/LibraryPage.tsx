'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Dialog } from 'radix-ui';
import { Download, Eye, FileText, Loader2, Pencil, RotateCcw, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { downloadUrl, libraryApi } from '@/lib/playground/api';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import { previewLibrary, previewVideoAnalysis } from '@/lib/playground/preview';
import type { LibraryItem, LibraryKind } from '@/lib/playground/types';
import { IMAGE_ACCEPT, uploadImages, uploadLibraryVideo } from '@/lib/playground/upload';
import { VIDEO_ACCEPT } from '@/lib/playground/libraryVideo';
import { usePreviewFlag } from '../hooks';
import { Markdown } from '../Markdown';
import { PlaygroundTabs } from '../PlaygroundTabs';
import { cx, IconButton, timeAgo } from '../ui';
import { ALL_FOLDERS, FolderChips, MoveToMenu, NO_FOLDER, ShotSequence, useLibraryFolders, VideoThumb } from './libraryParts';

const TOAST = { position: 'top-center' as const };

const TABS: Array<{ kind: LibraryKind; label: string }> = [
  { kind: 'image', label: 'Images' },
  { kind: 'video', label: 'Videos' },
  { kind: 'document', label: 'Guideline docs' },
];

/** A local stand-in for an item added in preview mode (nothing is saved). */
function localItem(kind: LibraryKind, patch: Partial<LibraryItem>): LibraryItem {
  return {
    id: `local-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: '',
    url: null,
    preview: null,
    length: null,
    width: null,
    height: null,
    mimeType: null,
    sizeBytes: null,
    source: 'upload',
    createdAt: new Date().toISOString(),
    folderId: null,
    posterUrl: null,
    durationSeconds: null,
    analysis: null,
    ...patch,
  };
}

export function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const preview = usePreviewFlag();
  const [kind, setKind] = useState<LibraryKind>('image');
  const [folder, setFolder] = useState<string>(ALL_FOLDERS);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [openDoc, setOpenDoc] = useState<{ item: LibraryItem; content: string } | null>(null);
  const [watching, setWatching] = useState<Record<string, boolean>>({});
  const [openVideo, setOpenVideo] = useState<LibraryItem | null>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const signedOut = !preview && !authLoading && !user;
  const ready = !signedOut && (preview || !authLoading);
  const folders = useLibraryFolders(kind, preview, ready);
  const setup = setupMessage ?? folders.setupMessage;
  // Uploads go into the folder that is open.
  const uploadFolder = folder !== ALL_FOLDERS && folder !== NO_FOLDER ? folder : null;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const filter = folder === ALL_FOLDERS ? null : folder;
      if (preview) {
        const sample = previewLibrary(kind)
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .filter((item) => !filter || (filter === NO_FOLDER ? !item.folderId : item.folderId === filter));
        setItems(sample);
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
  }, [kind, folder, search, preview, ready, user?.id]);

  const switchTab = (next: LibraryKind) => {
    if (next === kind) return;
    setKind(next);
    setFolder(ALL_FOLDERS);
    setItems(null);
    setSearch('');
  };

  const added = (fresh: LibraryItem[], into: LibraryKind) => {
    if (into !== kind) return;
    setItems((current) => [...fresh, ...(current ?? [])]);
    if (uploadFolder) folders.recount(null, uploadFolder, fresh.length);
  };

  const addImages = async (files: File[]) => {
    if (!files.length) return;
    setUploading(files.length);
    try {
      const uploaded = await uploadImages(files, { preview, onError: (message) => toast.error(message, TOAST) });
      if (!uploaded.length) return;
      const fresh = preview
        ? uploaded.map((image) => localItem('image', { name: image.name, url: image.url, width: image.width, height: image.height, mimeType: image.mimeType, sizeBytes: image.sizeBytes, folderId: uploadFolder }))
        : (await libraryApi.addImages(uploaded, uploadFolder)).items;
      added(fresh, 'image');
      toast.success(`${fresh.length} image${fresh.length === 1 ? '' : 's'} added to your Library`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload', TOAST);
    } finally {
      setUploading(0);
    }
  };

  const addVideos = async (files: File[]) => {
    const videos = files.slice(0, 10);
    if (!videos.length) return;
    setUploading(videos.length);
    try {
      const uploaded = (await Promise.all(videos.map((file) => uploadLibraryVideo(file, { preview }).catch((error) => {
        toast.error(error instanceof Error ? error.message : `Could not upload ${file.name}`, TOAST);
        return null;
      })))).filter((video): video is NonNullable<typeof video> => video !== null);
      if (!uploaded.length) return;
      const fresh = preview
        ? uploaded.map((video) => localItem('video', { name: video.name, url: video.url, posterUrl: video.posterUrl, durationSeconds: video.durationSeconds, width: video.width, height: video.height, mimeType: video.mimeType, sizeBytes: video.sizeBytes, folderId: uploadFolder }))
        : (await libraryApi.addVideos(uploaded, uploadFolder)).items;
      added(fresh, 'video');
      toast.success(`${fresh.length} video${fresh.length === 1 ? '' : 's'} added to your Library`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload', TOAST);
    } finally {
      setUploading(0);
    }
  };

  const addDocument = async (file: File) => {
    const content = await file.text();
    if (content.length > MAX_BRIEF_CHARS) {
      toast.error(`Documents can be up to ${MAX_BRIEF_CHARS.toLocaleString('en-IN')} characters.`, TOAST);
      return;
    }
    try {
      const fresh = preview
        ? [localItem('document', { name: file.name, preview: content.slice(0, 400), length: content.length, mimeType: 'text/markdown', sizeBytes: content.length, folderId: uploadFolder })]
        : (await libraryApi.addDocument({ name: file.name, content }, uploadFolder)).items;
      added(fresh, 'document');
      toast.success(`${file.name} added to your Library`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the document', TOAST);
    }
  };

  const patchItem = (id: string, patch: Partial<LibraryItem>) => {
    setItems((current) => current?.map((known) => (known.id === id ? { ...known, ...patch } : known)) ?? current);
    setOpenVideo((current) => (current?.id === id ? { ...current, ...patch } : current));
  };

  const rename = async (item: LibraryItem) => {
    const name = window.prompt('Name', item.name)?.trim();
    if (!name || name === item.name) return;
    patchItem(item.id, { name });
    if (preview) return;
    try {
      await libraryApi.rename(item.id, name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename', TOAST);
    }
  };

  const move = async (item: LibraryItem, folderId: string | null) => {
    if (item.folderId === folderId) return;
    try {
      if (!preview) await libraryApi.move(item.id, folderId);
      folders.recount(item.folderId, folderId);
      // Left the folder being shown: it goes from this view.
      const leaves = folder !== ALL_FOLDERS && (folder === NO_FOLDER ? folderId !== null : folderId !== folder);
      if (leaves) setItems((current) => current?.filter((known) => known.id !== item.id) ?? current);
      else patchItem(item.id, { folderId });
      const target = folders.folders.find((known) => known.id === folderId);
      toast.success(target ? `Moved to ${target.name}` : 'Taken out of its folder', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move it', TOAST);
    }
  };

  const remove = async (item: LibraryItem) => {
    const what = item.kind === 'video' ? 'Videos that already copied its shots are not affected.' : 'Projects that already use it keep their copy.';
    if (!window.confirm(`Remove "${item.name || 'this item'}" from your Library? ${what}`)) return;
    try {
      if (!preview) await libraryApi.remove(item.id);
      setItems((current) => current?.filter((known) => known.id !== item.id) ?? current);
      if (item.folderId) folders.recount(item.folderId, null);
      setOpenVideo((current) => (current?.id === item.id ? null : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove', TOAST);
    }
  };

  const removeFolder = async (target: (typeof folders.folders)[number]) => {
    if (!(await folders.remove(target))) return;
    setItems((current) => current?.map((known) => (known.folderId === target.id ? { ...known, folderId: null } : known)) ?? current);
    setFolder(ALL_FOLDERS);
  };

  /** Gemini watches the video (once; `again` re-watches it) and its shots are saved with it. */
  const watch = async (item: LibraryItem, again = false) => {
    if (watching[item.id]) return;
    setWatching((current) => ({ ...current, [item.id]: true }));
    try {
      if (preview) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        patchItem(item.id, { analysis: previewVideoAnalysis() });
      } else {
        const { item: watched } = await libraryApi.analyze(item.id, again);
        patchItem(item.id, { analysis: watched.analysis });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'This video could not be read', { ...TOAST, duration: 8000 });
    } finally {
      setWatching((current) => ({ ...current, [item.id]: false }));
    }
  };

  const showDoc = async (item: LibraryItem) => {
    if (preview) return setOpenDoc({ item, content: item.preview ?? '' });
    try {
      const { content } = await libraryApi.get(item.id);
      setOpenDoc({ item, content: content ?? '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the document', TOAST);
    }
  };

  const downloadDoc = (name: string, content: string) => {
    const href = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  const loadMore = async () => {
    if (!nextBefore) return;
    const result = await libraryApi.list(kind, { before: nextBefore, q: search, folder: folder === ALL_FOLDERS ? null : folder });
    setItems((current) => [...(current ?? []), ...result.items]);
    setNextBefore(result.nextBefore);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: kind === 'image' ? IMAGE_ACCEPT : kind === 'video' ? VIDEO_ACCEPT : { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
    multiple: kind !== 'document',
    noClick: true,
    disabled: signedOut || (kind === 'video' && Boolean(setup)),
    onDrop: (accepted) => {
      if (kind === 'image') void addImages(accepted);
      else if (kind === 'video') void addVideos(accepted);
      else if (accepted[0]) void addDocument(accepted[0]);
    },
  });

  const downloadHref = (item: LibraryItem, fallback: string) => (item.url ? (preview ? item.url : downloadUrl(item.url, item.name || fallback)) : undefined);
  const uploadLabel = kind === 'image' ? 'Upload images' : kind === 'video' ? 'Upload videos' : 'Upload .md';
  const emptyText = search
    ? 'Nothing matches that name.'
    : folder !== ALL_FOLDERS
      ? 'Nothing in this folder yet. Upload here, or move items in with the folder button on each one.'
      : kind === 'image'
        ? 'Drop images here, or save them from a project (a reference or a generated image).'
        : kind === 'video'
          ? 'Drop videos here (MP4, MOV or WebM, up to 50 MB and 3 minutes), or save a finished video from the Video Studio. Use them as reference videos: a new video copies their shots and pacing.'
          : 'Drop a .md file here, or save a project’s Guidelines to the Library.';

  return (
    <div {...getRootProps()} className="relative min-h-screen bg-[#08080a] text-white">
      <input {...getInputProps()} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      {isDragActive && <div className="pointer-events-none fixed inset-0 z-40 border-2 border-dashed border-[#fff05a]/60 bg-[#fff05a]/[0.04]" />}
      <div className="relative mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl">Library</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
              Your images, videos and guideline documents, filed in folders and ready for any project: images as references, videos as reference videos to copy shots from, documents as guidelines.
            </p>
          </div>
          <PlaygroundTabs active="library" preview={preview} />
        </div>

        {signedOut ? (
          <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            <h2 className="text-lg font-light">Sign in to use your Library</h2>
            <Link href="/login?redirectTo=/playground/library" className="mt-6 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">Sign in</Link>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-sm">
                {TABS.map((tab) => (
                  <button key={tab.kind} type="button" onClick={() => switchTab(tab.kind)} className={cx('rounded-full px-4 py-1.5', kind === tab.kind ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white')}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm">
                <Search className="h-3.5 w-3.5 text-white/40" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="w-36 bg-transparent text-white outline-none placeholder:text-white/30 sm:w-44" />
              </label>
              <button
                type="button"
                onClick={() => (kind === 'document' ? docInput.current?.click() : open())}
                disabled={uploading > 0 || (kind === 'video' && Boolean(setup))}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#fff05a] px-4 py-2 text-sm font-medium text-black hover:bg-white disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? `Uploading ${uploading}…` : uploadLabel}
              </button>
              <input ref={docInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addDocument(file); event.target.value = ''; }} />
            </div>

            {setup ? (
              <p className="mt-4 rounded-2xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-4 py-3 text-sm text-[#fbf2a0]/90">{setup}</p>
            ) : (
              <div className="mt-4">
                <FolderChips
                  folders={folders.folders}
                  active={folder}
                  onSelect={(id) => { setFolder(id); setItems(null); }}
                  onCreate={folders.create}
                  onRename={(target, name) => void folders.rename(target, name)}
                  onRemove={(target) => void removeFolder(target)}
                />
              </div>
            )}

            {items === null ? (
              <div className="mt-16 flex items-center gap-2 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading your library…</div>
            ) : items.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-dashed border-white/12 p-12 text-center text-sm leading-relaxed text-white/45">{emptyText}</div>
            ) : kind === 'image' ? (
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                {items.map((item) => (
                  <figure key={item.id} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url ?? ''} alt={item.name} loading="lazy" className="aspect-square w-full object-cover" />
                    <figcaption className="flex items-center gap-1 px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-white/75">{item.name || 'Untitled'}</span>
                      <span className="text-[10px] text-white/35">{timeAgo(item.createdAt)}</span>
                    </figcaption>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
                      <IconButton label="Rename" tone="solid" onClick={() => void rename(item)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      {!setup && <MoveToMenu item={item} folders={folders.folders} onMove={(target, folderId) => void move(target, folderId)} onCreate={folders.create} />}
                      <a href={downloadHref(item, 'image')} download={item.name || 'image'} aria-label="Download" title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/75"><Download className="h-3.5 w-3.5" /></a>
                      <IconButton label="Remove from Library" tone="solid" onClick={() => void remove(item)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </figure>
                ))}
              </div>
            ) : kind === 'video' ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-4">
                {items.map((item) => (
                  <figure key={item.id} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
                    <button type="button" onClick={() => setOpenVideo(item)} className="block w-full !p-0" title="Open">
                      <VideoThumb item={item} className="aspect-[9/16] w-full" />
                    </button>
                    <figcaption className="space-y-1 px-2.5 py-2">
                      <span className="block truncate text-xs text-white/80">{item.name || 'Untitled'}</span>
                      {item.analysis ? (
                        <button type="button" onClick={() => setOpenVideo(item)} className="inline-flex items-center gap-1 text-[11px] text-[#d9ccff] hover:text-white">
                          <Eye className="h-3 w-3" /> {item.analysis.sequence.length} shots
                        </button>
                      ) : (
                        <button type="button" onClick={() => void watch(item)} disabled={watching[item.id]} className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-[#fff05a] disabled:text-white/40">
                          {watching[item.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {watching[item.id] ? 'Reading shots…' : 'Read shots'}
                        </button>
                      )}
                    </figcaption>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
                      <IconButton label="Rename" tone="solid" onClick={() => void rename(item)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      <MoveToMenu item={item} folders={folders.folders} onMove={(target, folderId) => void move(target, folderId)} onCreate={folders.create} />
                      <a href={downloadHref(item, 'video')} download={item.name || 'video'} aria-label="Download" title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/75"><Download className="h-3.5 w-3.5" /></a>
                      <IconButton label="Remove from Library" tone="solid" onClick={() => void remove(item)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </figure>
                ))}
              </div>
            ) : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <li key={item.id} className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <button type="button" onClick={() => void showDoc(item)} className="block w-full text-left">
                      <span className="flex items-center gap-2 text-sm text-white"><FileText className="h-4 w-4 text-white/45" /> <span className="truncate">{item.name}</span></span>
                      <span className="mt-2 line-clamp-4 block whitespace-pre-wrap text-xs leading-relaxed text-white/50">{item.preview}</span>
                      <span className="mt-2 block text-[11px] text-white/35">{(item.length ?? 0).toLocaleString('en-IN')} characters · {timeAgo(item.createdAt)}</span>
                    </button>
                    <div className="mt-3 flex gap-1">
                      <IconButton label="Rename" onClick={() => void rename(item)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      {!setup && <MoveToMenu item={item} folders={folders.folders} onMove={(target, folderId) => void move(target, folderId)} onCreate={folders.create} tone="plain" />}
                      <IconButton label="Remove from Library" tone="danger" onClick={() => void remove(item)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {nextBefore && (
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={() => void loadMore()} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/8">Load more</button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog.Root open={Boolean(openDoc)} onOpenChange={(next) => !next && setOpenDoc(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[86vh] w-[min(820px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/12 bg-[#141418] text-white outline-none">
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
              <Dialog.Title className="flex min-w-0 items-center gap-2 text-base font-medium"><FileText className="h-4 w-4 shrink-0 text-white/50" /> <span className="truncate">{openDoc?.item.name}</span></Dialog.Title>
              <Dialog.Description className="sr-only">Guideline document</Dialog.Description>
              <button type="button" onClick={() => openDoc && downloadDoc(openDoc.item.name, openDoc.content)} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 hover:bg-white/8"><Download className="h-3.5 w-3.5" /> Download</button>
              <Dialog.Close className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{openDoc && <Markdown>{openDoc.content}</Markdown>}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(openVideo)} onOpenChange={(next) => !next && setOpenVideo(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90vh] w-[min(880px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/12 bg-[#141418] text-white outline-none">
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
              <Dialog.Title className="min-w-0 truncate text-base font-medium">{openVideo?.name || 'Video'}</Dialog.Title>
              <Dialog.Description className="sr-only">A Library video and its shots</Dialog.Description>
              <Dialog.Close className="ml-auto rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            {openVideo && (
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,260px)_1fr]">
                <video src={openVideo.url ?? undefined} poster={openVideo.posterUrl ?? undefined} controls playsInline className="mx-auto max-h-[60vh] w-full rounded-2xl border border-white/10 bg-black object-contain" />
                <div className="min-w-0">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Shot by shot</p>
                  {openVideo.analysis ? (
                    <>
                      <ShotSequence analysis={openVideo.analysis} />
                      <button type="button" onClick={() => void watch(openVideo, true)} disabled={watching[openVideo.id]} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8 disabled:opacity-50">
                        {watching[openVideo.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Read again
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <p className="text-sm leading-relaxed text-white/60">The video is watched to the end and broken into shots: what is on screen, the camera, any on-screen text and what each shot is for. It is saved with the video.</p>
                      <button type="button" onClick={() => void watch(openVideo)} disabled={watching[openVideo.id]} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white disabled:bg-white/15 disabled:text-white/40">
                        {watching[openVideo.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {watching[openVideo.id] ? 'Reading shots…' : 'Read shots'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
