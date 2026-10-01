'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Check, FileText, Loader2, Search, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { libraryApi } from '@/lib/playground/api';
import { ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { previewLibrary } from '@/lib/playground/preview';
import { uploadImages } from '@/lib/playground/upload';
import type { LibraryItem } from '@/lib/playground/types';
import { Markdown } from '../Markdown';
import { cx } from '../ui';

const TOAST = { position: 'top-center' as const };
const ROLES: ReferenceRole[] = ['product', 'person', 'style'];

/**
 * Picks images or a guideline document from the Library. Images can be multi-selected and
 * given a role (for references); new images can be uploaded into the Library from here.
 */
export function LibraryPicker({ open, onOpenChange, kind, title, preview = false, showRole = false, multiple = true, max, confirmLabel, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LibraryItem['kind'];
  title: string;
  preview?: boolean;
  showRole?: boolean;
  multiple?: boolean;
  max?: number;
  confirmLabel?: (count: number, role: ReferenceRole) => string;
  onPick: (items: LibraryItem[], role: ReferenceRole, content: string | null) => void | Promise<void>;
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<ReferenceRole>('product');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [docContent, setDocContent] = useState<{ id: string; content: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load (and re-search) while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (preview) {
        const sample = previewLibrary(kind).filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
        setItems(sample);
        setNextBefore(null);
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
  }, [open, kind, search, preview]);

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

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(files.length);
    try {
      const uploaded = await uploadImages(files, { preview, onError: (message) => toast.error(message, TOAST) });
      if (!uploaded.length) return;
      const added = preview
        ? uploaded.map((image, index) => ({ id: `local-lib-${Date.now()}-${index}`, kind: 'image' as const, name: image.name, url: image.url, preview: null, length: null, width: image.width, height: image.height, mimeType: image.mimeType, sizeBytes: image.sizeBytes, source: 'upload' as const, createdAt: new Date().toISOString() }))
        : (await libraryApi.addImages(uploaded)).items;
      setItems((current) => [...added, ...(current ?? [])]);
      setSelected((current) => (multiple ? [...current, ...added.map((item) => item.id)] : [added[0].id]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload', TOAST);
    } finally {
      setUploading(0);
    }
  };

  const loadMore = async () => {
    if (!nextBefore || preview) return;
    const result = await libraryApi.list(kind, { before: nextBefore, q: search });
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

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[86vh] w-[min(920px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/12 bg-[#141418] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none">
          <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
            <Dialog.Title className="text-base font-medium">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">Choose from your Library</Dialog.Description>
            <label className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-white/40" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="w-40 bg-transparent text-white outline-none placeholder:text-white/30" />
            </label>
            {kind === 'image' && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-sm text-white/80 hover:bg-white/8 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
              </>
            )}
            <Dialog.Close className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {items === null ? (
              <div className="flex items-center justify-center py-16 text-white/45"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your library…</div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-sm text-white/45">
                {search ? 'Nothing matches that name.' : kind === 'image' ? 'Your library is empty. Upload images here or save them from a project.' : 'No guideline documents yet. Save one from a project’s Guidelines.'}
              </div>
            ) : kind === 'image' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {items.map((item) => {
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
            ) : (
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                <ul className="space-y-1.5">
                  {items.map((item) => (
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
            <span className="text-xs text-white/40">{selected.length ? `${selected.length} selected` : multiple ? 'Select one or more' : 'Select one'}</span>
            <button type="button" onClick={() => void confirm()} disabled={!selected.length || busy} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-5 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
