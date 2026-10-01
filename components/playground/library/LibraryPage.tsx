'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { Dialog } from 'radix-ui';
import { Download, FileText, Loader2, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { downloadUrl, libraryApi } from '@/lib/playground/api';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import { previewLibrary } from '@/lib/playground/preview';
import type { LibraryItem } from '@/lib/playground/types';
import { IMAGE_ACCEPT, uploadImages } from '@/lib/playground/upload';
import { usePreviewFlag } from '../hooks';
import { Markdown } from '../Markdown';
import { PlaygroundTabs } from '../PlaygroundTabs';
import { cx, IconButton, timeAgo } from '../ui';

const TOAST = { position: 'top-center' as const };

export function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const preview = usePreviewFlag();
  const [kind, setKind] = useState<LibraryItem['kind']>('image');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [openDoc, setOpenDoc] = useState<{ item: LibraryItem; content: string } | null>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const signedOut = !preview && !authLoading && !user;

  useEffect(() => {
    if (signedOut || (!preview && authLoading)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (preview) {
        const sample = previewLibrary(kind).filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
        setItems(sample);
        return;
      }
      libraryApi.list(kind, { q: search })
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setNextBefore(result.nextBefore);
        })
        .catch((error) => !cancelled && toast.error(error instanceof Error ? error.message : 'Could not load your library', TOAST));
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, search, preview, signedOut, authLoading, user?.id]);

  const addImages = async (files: File[]) => {
    if (!files.length) return;
    setUploading(files.length);
    try {
      const uploaded = await uploadImages(files, { preview, onError: (message) => toast.error(message, TOAST) });
      if (!uploaded.length) return;
      const added = preview
        ? uploaded.map((image, index) => ({ id: `local-${Date.now()}-${index}`, kind: 'image' as const, name: image.name, url: image.url, preview: null, length: null, width: image.width, height: image.height, mimeType: image.mimeType, sizeBytes: image.sizeBytes, source: 'upload' as const, createdAt: new Date().toISOString() }))
        : (await libraryApi.addImages(uploaded)).items;
      if (kind === 'image') setItems((current) => [...added, ...(current ?? [])]);
      toast.success(`${added.length} image${added.length === 1 ? '' : 's'} added to your Library`, TOAST);
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
      const [item] = preview
        ? [{ id: `local-doc-${Date.now()}`, kind: 'document' as const, name: file.name, url: null, preview: content.slice(0, 400), length: content.length, width: null, height: null, mimeType: 'text/markdown', sizeBytes: content.length, source: 'upload' as const, createdAt: new Date().toISOString() }]
        : (await libraryApi.addDocument({ name: file.name, content })).items;
      if (kind === 'document') setItems((current) => [item, ...(current ?? [])]);
      toast.success(`${file.name} added to your Library`, TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the document', TOAST);
    }
  };

  const rename = async (item: LibraryItem) => {
    const name = window.prompt('Name', item.name)?.trim();
    if (!name || name === item.name) return;
    setItems((current) => current?.map((known) => (known.id === item.id ? { ...known, name } : known)) ?? current);
    if (preview) return;
    try {
      await libraryApi.rename(item.id, name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename', TOAST);
    }
  };

  const remove = async (item: LibraryItem) => {
    if (!window.confirm(`Remove "${item.name || 'this item'}" from your Library? Projects that already use it keep their copy.`)) return;
    try {
      if (!preview) await libraryApi.remove(item.id);
      setItems((current) => current?.filter((known) => known.id !== item.id) ?? current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove', TOAST);
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
    const result = await libraryApi.list(kind, { before: nextBefore, q: search });
    setItems((current) => [...(current ?? []), ...result.items]);
    setNextBefore(result.nextBefore);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: kind === 'image' ? IMAGE_ACCEPT : { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
    multiple: kind === 'image',
    noClick: true,
    disabled: signedOut,
    onDrop: (accepted) => {
      if (kind === 'image') void addImages(accepted);
      else if (accepted[0]) void addDocument(accepted[0]);
    },
  });

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
              Your images and guideline documents, ready to use in any project: add them as references or load them as guidelines.
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
                {(['image', 'document'] as const).map((option) => (
                  <button key={option} type="button" onClick={() => { setKind(option); setItems(null); setSearch(''); }} className={cx('rounded-full px-4 py-1.5', kind === option ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white')}>
                    {option === 'image' ? 'Images' : 'Guideline docs'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm">
                <Search className="h-3.5 w-3.5 text-white/40" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="w-44 bg-transparent text-white outline-none placeholder:text-white/30" />
              </label>
              <button type="button" onClick={() => (kind === 'image' ? open() : docInput.current?.click())} disabled={uploading > 0} className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#fff05a] px-4 py-2 text-sm font-medium text-black hover:bg-white disabled:opacity-60">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? `Uploading ${uploading}…` : kind === 'image' ? 'Upload images' : 'Upload .md'}
              </button>
              <input ref={docInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addDocument(file); event.target.value = ''; }} />
            </div>

            {items === null ? (
              <div className="mt-16 flex items-center gap-2 text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading your library…</div>
            ) : items.length === 0 ? (
              <div className="mt-10 rounded-3xl border border-dashed border-white/12 p-12 text-center text-sm text-white/45">
                {search ? 'Nothing matches that name.' : kind === 'image'
                  ? 'Drop images here, or save them from a project (a reference or a generated image).'
                  : 'Drop a .md file here, or save a project’s Guidelines to the Library.'}
              </div>
            ) : kind === 'image' ? (
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {items.map((item) => (
                  <figure key={item.id} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url ?? ''} alt={item.name} loading="lazy" className="aspect-square w-full object-cover" />
                    <figcaption className="flex items-center gap-1 px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-white/75">{item.name || 'Untitled'}</span>
                      <span className="text-[10px] text-white/35">{timeAgo(item.createdAt)}</span>
                    </figcaption>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton label="Rename" tone="solid" onClick={() => void rename(item)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      <a href={item.url ? (preview ? item.url : downloadUrl(item.url, item.name || 'image')) : undefined} download={item.name || 'image'} aria-label="Download" title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/75"><Download className="h-3.5 w-3.5" /></a>
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
    </div>
  );
}
