'use client';

import { AlertTriangle, Download, ImagePlus, Loader2, RotateCcw, Star, Trash2, Wand2 } from 'lucide-react';
import toast from '@/lib/toast';
import { downloadUrl, playgroundApi } from '@/lib/playground/api';
import { ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { retryItem } from '@/lib/playground/runner';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundItem } from '@/lib/playground/types';
import { imageFileName } from '@/lib/playground/zip';
import { cssRatio, cx, IconButton, Popover, PopoverClose } from './ui';

const TOAST = { position: 'top-center' as const };

export function useItemActions(item: PlaygroundItem, prompt: string) {
  const preview = usePlaygroundStore((state) => state.preview);
  const projectId = usePlaygroundStore((state) => state.projectId);
  const upsertItems = usePlaygroundStore((state) => state.upsertItems);
  const upsertReference = usePlaygroundStore((state) => state.upsertReference);
  const removeItem = usePlaygroundStore((state) => state.removeItem);
  const fileName = item.imageUrl ? imageFileName(item.position, prompt, item.aspectRatio, item.imageUrl, item.variation) : 'image.jpg';

  return {
    fileName,
    href: item.imageUrl ? (preview ? item.imageUrl : downloadUrl(item.imageUrl, fileName)) : undefined,
    async toggleFavorite() {
      const favorite = !item.favorite;
      upsertItems([{ ...item, favorite }]);
      if (preview) return;
      try {
        upsertItems([(await playgroundApi.updateItem(item.id, { favorite })).item]);
      } catch (error) {
        upsertItems([{ ...item }]);
        toast.error(error instanceof Error ? error.message : 'Could not save', TOAST);
      }
    },
    async useAsReference(role: ReferenceRole) {
      if (!projectId || !item.imageUrl) return;
      try {
        if (preview) {
          upsertReference({ id: `ref-${item.id}-${role}`, url: item.imageUrl, role, label: 'From a generated image', enabled: true, width: item.width, height: item.height, sourceItemId: item.id, createdAt: new Date().toISOString() });
        } else {
          const { references } = await playgroundApi.addReferenceFromItem(projectId, item.id, role);
          references.forEach(upsertReference);
        }
        toast.success(`Added as a ${ROLE_LABELS[role].toLowerCase()} reference`, TOAST);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not add the reference', TOAST);
      }
    },
    async remove() {
      if (!window.confirm('Delete this image? This cannot be undone.')) return;
      try {
        if (!preview) await playgroundApi.deleteItem(item.id);
        removeItem(item.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not delete the image', TOAST);
      }
    },
    async retry() {
      try {
        await retryItem(item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue the image', TOAST);
      }
    },
  };
}

export function ReferenceRoleMenu({ onPick, children }: { onPick: (role: ReferenceRole) => void; children: React.ReactNode }) {
  return (
    <Popover trigger={children} side="bottom" align="end" className="w-52">
      <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/40">Use as reference</p>
      {(['product', 'person', 'style'] as ReferenceRole[]).map((role) => (
        <PopoverClose asChild key={role}>
          <button
            type="button"
            onClick={() => onPick(role)}
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm text-white/85 hover:bg-white/8"
          >
            {ROLE_LABELS[role]}
            <span className="text-[11px] text-white/35">
              {role === 'product' ? 'keep it exact' : role === 'person' ? 'keep the face' : 'match the look'}
            </span>
          </button>
        </PopoverClose>
      ))}
    </Popover>
  );
}

export function ImageCard({ item, prompt, onOpen, onCanvas }: {
  item: PlaygroundItem;
  prompt: string;
  onOpen: () => void;
  onCanvas?: () => void;
}) {
  const actions = useItemActions(item, prompt);
  const checking = usePlaygroundStore((state) => state.runner.checking.includes(item.id));
  const ratio = cssRatio(item.aspectRatio);

  if (item.status === 'done' && item.previewUrl) {
    return (
      <figure className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]" style={{ aspectRatio: ratio }}>
        <button type="button" onClick={onOpen} className="absolute inset-0 block h-full w-full cursor-zoom-in" aria-label="Open image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.previewUrl} alt={prompt} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        </button>
        {item.kind === 'edit' && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[#fff05a] px-2 py-0.5 text-[10px] font-medium text-black">Edited</span>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <div className="pointer-events-auto flex gap-1">
            <IconButton label={item.favorite ? 'Remove from favourites' : 'Add to favourites'} tone="solid" onClick={actions.toggleFavorite}>
              <Star className={cx('h-4 w-4', item.favorite && 'fill-[#fff05a] text-[#fff05a]')} />
            </IconButton>
            {onCanvas && (
              <IconButton label="Open in Canvas" tone="solid" onClick={onCanvas}>
                <Wand2 className="h-4 w-4" />
              </IconButton>
            )}
            <ReferenceRoleMenu onPick={actions.useAsReference}>
              <IconButton label="Use as reference" tone="solid"><ImagePlus className="h-4 w-4" /></IconButton>
            </ReferenceRoleMenu>
            <a
              href={actions.href}
              download={actions.fileName}
              aria-label="Download"
              title="Download"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/75"
            >
              <Download className="h-4 w-4" />
            </a>
            <IconButton label="Delete" tone="solid" onClick={actions.remove}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        </div>
        {item.favorite && (
          <Star className="pointer-events-none absolute left-2 top-2 h-4 w-4 fill-[#fff05a] text-[#fff05a] drop-shadow group-hover:opacity-0" />
        )}
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10 text-xs leading-snug text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="line-clamp-2">{prompt}</span>
        </figcaption>
      </figure>
    );
  }

  const generating = item.status === 'generating';
  return (
    <div
      className={cx(
        'relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3',
        generating ? 'border-white/12 bg-white/[0.04]' : 'border-white/8 bg-white/[0.02]',
        item.status === 'failed' && 'border-red-400/25 bg-red-500/[0.04]'
      )}
      style={{ aspectRatio: ratio }}
    >
      {generating && <div className="playground-shimmer pointer-events-none absolute inset-0" />}
      <div className="relative flex items-center justify-between gap-2 text-[11px] text-white/45">
        <span className="rounded-full border border-white/10 px-2 py-0.5">{item.aspectRatio}</span>
        <span>#{item.position + 1}</span>
      </div>
      <p className="relative line-clamp-4 text-xs leading-relaxed text-white/60">{prompt}</p>
      <div className="relative flex items-center justify-between gap-2 text-xs">
        {generating && (
          <span className="flex items-center gap-1.5 text-white/80">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#fff05a]" />
            {checking ? 'Checking…' : 'Generating…'}
          </span>
        )}
        {item.status === 'queued' && <span className="text-white/45">Queued</span>}
        {item.status === 'cancelled' && (
          <>
            <span className="text-white/40">Cancelled</span>
            <button type="button" onClick={actions.retry} className="rounded-full border border-white/12 px-2.5 py-1 text-white/80 hover:bg-white/8">
              Generate
            </button>
          </>
        )}
        {item.status === 'failed' && (
          <div className="flex w-full flex-col gap-2">
            <span className="flex items-start gap-1.5 text-red-200/85">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-3">{item.error ?? 'This image failed. Credits were refunded.'}</span>
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={actions.retry} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-white hover:bg-white/15">
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
              <IconButton label="Delete" tone="danger" className="h-7 w-7" onClick={actions.remove}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
