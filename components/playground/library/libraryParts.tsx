'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clapperboard, Folder, FolderInput, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import { libraryApi } from '@/lib/playground/api';
import { previewLibraryFolders } from '@/lib/playground/preview';
import type { LibraryFolder, LibraryItem, LibraryKind, LibraryVideoAnalysis } from '@/lib/playground/types';
import { videoStyleLabel } from '@/lib/videoStyles';
import { Chip, cx, IconButton, Popover, PopoverClose } from '../ui';

const TOAST = { position: 'top-center' as const };

/** "All" shows every item; NONE the un-filed ones. */
export const ALL_FOLDERS = 'all';
export const NO_FOLDER = 'none';

export function formatLength(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The folders of one Library tab, kept in step with creates, renames, removes and moves. */
export function useLibraryFolders(kind: LibraryKind, preview: boolean, enabled = true) {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = preview
      ? Promise.resolve({ folders: previewLibraryFolders(kind), setupMessage: null })
      : libraryApi.folders.list(kind);
    load
      .then((result) => {
        if (cancelled) return;
        setFolders(result.folders);
        setSetupMessage(result.setupMessage ?? null);
      })
      .catch(() => !cancelled && setFolders([]));
    return () => {
      cancelled = true;
    };
  }, [kind, preview, enabled]);

  const create = useCallback(async (name: string): Promise<LibraryFolder | null> => {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return null;
    try {
      const folder = preview
        ? folders.find((known) => known.name.toLowerCase() === clean.toLowerCase()) ?? { id: `local-folder-${Date.now()}`, kind, name: clean, count: 0, createdAt: new Date().toISOString() }
        : (await libraryApi.folders.create(kind, clean)).folder;
      setFolders((current) => (current.some((known) => known.id === folder.id) ? current : [...current, folder].sort((a, b) => a.name.localeCompare(b.name))));
      return folder;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the folder', TOAST);
      return null;
    }
  }, [folders, kind, preview]);

  const rename = useCallback(async (folder: LibraryFolder, name: string) => {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean || clean === folder.name) return;
    try {
      if (!preview) await libraryApi.folders.rename(folder.id, clean);
      setFolders((current) => current.map((known) => (known.id === folder.id ? { ...known, name: clean } : known)).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename the folder', TOAST);
    }
  }, [preview]);

  const remove = useCallback(async (folder: LibraryFolder): Promise<boolean> => {
    try {
      if (!preview) await libraryApi.folders.remove(folder.id);
      setFolders((current) => current.filter((known) => known.id !== folder.id));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the folder', TOAST);
      return false;
    }
  }, [preview]);

  /** Counts follow an item moving from one folder to another (or into / out of none). */
  const recount = useCallback((from: string | null, to: string | null, by = 1) => {
    setFolders((current) => current.map((folder) => ({
      ...folder,
      count: folder.count + (folder.id === to ? by : 0) - (folder.id === from ? by : 0),
    })));
  }, []);

  return { folders, setupMessage, create, rename, remove, recount };
}

/**
 * The folder row of a Library tab: All · each folder · Not filed · + New folder. The open
 * folder can be renamed or removed (its items stay in the Library).
 */
export function FolderChips({ folders, active, onSelect, onCreate, onRename, onRemove, disabled, compact = false }: {
  folders: LibraryFolder[];
  /** ALL_FOLDERS, NO_FOLDER or a folder id. */
  active: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<LibraryFolder | null>;
  onRename?: (folder: LibraryFolder, name: string) => void;
  onRemove?: (folder: LibraryFolder) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const current = folders.find((folder) => folder.id === active);
  const newFolder = async () => {
    const name = window.prompt('New folder name')?.trim();
    if (!name) return;
    const folder = await onCreate(name);
    if (folder) onSelect(folder.id);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip active={active === ALL_FOLDERS} onClick={() => onSelect(ALL_FOLDERS)} disabled={disabled}>All</Chip>
      {folders.map((folder) => (
        <Chip key={folder.id} active={active === folder.id} onClick={() => onSelect(folder.id)} disabled={disabled} title={folder.name}>
          <Folder className="h-3.5 w-3.5" />
          <span className={cx('truncate', compact ? 'max-w-[120px]' : 'max-w-[180px]')}>{folder.name}</span>
          <span className="text-[10px] opacity-60">{folder.count}</span>
        </Chip>
      ))}
      {folders.length > 0 && (
        <Chip active={active === NO_FOLDER} onClick={() => onSelect(NO_FOLDER)} disabled={disabled}>Not in a folder</Chip>
      )}
      <Chip onClick={() => void newFolder()} disabled={disabled}>
        <Plus className="h-3.5 w-3.5" /> New folder
      </Chip>
      {current && (onRename || onRemove) && (
        <span className="ml-1 flex items-center gap-0.5">
          {onRename && (
            <IconButton label={`Rename ${current.name}`} disabled={disabled} onClick={() => {
              const name = window.prompt('Folder name', current.name)?.trim();
              if (name) onRename(current, name);
            }}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {onRemove && (
            <IconButton label={`Remove ${current.name}`} tone="danger" disabled={disabled} onClick={() => {
              if (window.confirm(`Remove the folder "${current.name}"? Its ${current.count === 1 ? 'item stays' : 'items stay'} in your Library, just not in a folder.`)) onRemove(current);
            }}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </span>
      )}
    </div>
  );
}

/** "Move to…": files an item in one of the tab's folders, a new one, or none. */
export function MoveToMenu({ item, folders, onMove, onCreate, tone = 'solid' }: {
  item: LibraryItem;
  folders: LibraryFolder[];
  onMove: (item: LibraryItem, folderId: string | null) => void;
  onCreate: (name: string) => Promise<LibraryFolder | null>;
  tone?: 'solid' | 'plain';
}) {
  return (
    <Popover
      side="bottom"
      align="end"
      className="w-56"
      trigger={<IconButton label="Move to folder" tone={tone}><FolderInput className="h-3.5 w-3.5" /></IconButton>}
    >
      <p className="px-2 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.16em] text-white/40">Move to</p>
      {folders.map((folder) => (
        <PopoverClose asChild key={folder.id}>
          <button type="button" onClick={() => onMove(item, folder.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8">
            <Folder className="h-3.5 w-3.5 shrink-0 text-white/45" />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {item.folderId === folder.id && <Check className="h-3.5 w-3.5 text-[#fff05a]" />}
          </button>
        </PopoverClose>
      ))}
      {item.folderId && (
        <PopoverClose asChild>
          <button type="button" onClick={() => onMove(item, null)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-white/70 hover:bg-white/8">
            Not in a folder
          </button>
        </PopoverClose>
      )}
      <PopoverClose asChild>
        <button
          type="button"
          onClick={async () => {
            const name = window.prompt('New folder name')?.trim();
            if (!name) return;
            const folder = await onCreate(name);
            if (folder) onMove(item, folder.id);
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-white/8 px-2 py-1.5 text-left text-sm text-white/70 hover:bg-white/8"
        >
          <Plus className="h-3.5 w-3.5" /> New folder…
        </button>
      </PopoverClose>
    </Popover>
  );
}

/** A Library video: its poster (or first frame), its length, and it plays muted on hover. */
export function VideoThumb({ item, className }: { item: LibraryItem; className?: string }) {
  const length = formatLength(item.durationSeconds);
  // The tiles are tall; a video wider than 3:4 is shown whole instead of cropped.
  const wide = Boolean(item.width && item.height && item.width / item.height > 0.8);
  return (
    <span className={cx('relative block overflow-hidden bg-black/40', className)}>
      {item.url && (
        <video
          src={item.posterUrl ? item.url : `${item.url}#t=0.5`}
          poster={item.posterUrl ?? undefined}
          muted
          loop
          playsInline
          preload={item.posterUrl ? 'none' : 'metadata'}
          onMouseEnter={(event) => { event.currentTarget.play().catch(() => undefined); }}
          onMouseLeave={(event) => { event.currentTarget.pause(); }}
          className={cx('h-full w-full', wide ? 'object-contain' : 'object-cover')}
        />
      )}
      {!item.url && <Clapperboard className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white/30" />}
      {length && <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white/85">{length}</span>}
    </span>
  );
}

/** What Gemini saw in a video: its format, hook and timed shots. */
export function ShotSequence({ analysis, compact = false }: { analysis: LibraryVideoAnalysis; compact?: boolean }) {
  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {analysis.style && <span className="rounded-full border border-[#c8b8ff]/25 bg-[#c8b8ff]/10 px-2 py-0.5 text-[#d9ccff]">{videoStyleLabel(analysis.style)}</span>}
        {analysis.format && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-white/70">{analysis.format}</span>}
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-white/55">{analysis.sequence.length} shots</span>
      </div>
      {analysis.hook && !compact && <p className="text-xs leading-relaxed text-white/65"><span className="text-white/40">Hook:</span> {analysis.hook}</p>}
      <ol className="space-y-1.5">
        {analysis.sequence.map((beat, index) => (
          <li key={`${beat.t}-${index}`} className="flex gap-2 text-xs leading-relaxed">
            <span className="h-fit shrink-0 rounded-full bg-[#fff05a]/15 px-1.5 text-[10px] tabular-nums text-[#fbf2a0]">{beat.t}</span>
            <span className="min-w-0 text-white/75">
              {beat.shot}
              {beat.camera && <span className="text-white/40"> · {beat.camera}</span>}
              {beat.text && <span className="text-white/50"> · “{beat.text}”</span>}
              {beat.purpose && <span className="ml-1 text-[10px] uppercase tracking-[0.12em] text-white/35">{beat.purpose}</span>}
            </span>
          </li>
        ))}
      </ol>
      {analysis.audio && !compact && <p className="text-[11px] leading-relaxed text-white/45">Sound: {analysis.audio}</p>}
    </div>
  );
}
