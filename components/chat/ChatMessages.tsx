'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, Download, FolderPlus, Maximize2, PencilLine, RotateCcw } from 'lucide-react';
import toast from '@/lib/toast';
import type { ChatAttachment, ChatImage, ChatMessage } from '@/lib/chat/types';
import { downloadUrl, libraryApi } from '@/lib/playground/api';
import { QUALITY_LABELS } from '@/lib/playground/models';
import { Markdown } from '@/components/playground/Markdown';
import { cx } from '@/components/playground/ui';
import { ImageViewer } from '@/components/shared/ImageViewer';

const TOAST = { position: 'top-center' as const };

/** What the reply being written shows while it streams. */
export interface LiveReply {
  creating: boolean;
  partial: string | null;
  partialIndex: number;
  /** "1080 × 1350", "Auto". */
  size: string;
  credits: number;
}

/** The "W × H" of a size label as a CSS aspect ratio; Auto is square. */
function aspectOf(size: string): string {
  const match = /(\d+)\s*×\s*(\d+)/.exec(size);
  return match ? `${match[1]} / ${match[2]}` : '1 / 1';
}

function Thumb({ item, onOpen }: { item: ChatAttachment; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="h-20 w-20 overflow-hidden rounded-xl border border-white/10 !p-0" title={item.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
    </button>
  );
}

function ImageResult({ image, preview, onEdit, onOpen }: { image: ChatImage; preview: boolean; onEdit: () => void; onOpen: () => void }) {
  const [saving, setSaving] = useState(false);
  const name = `visicraft-chat-${image.width ?? ''}x${image.height ?? ''}.png`;
  const save = async () => {
    if (preview) return toast.success('Saved to your Library (preview)', TOAST);
    setSaving(true);
    try {
      await libraryApi.addImages([{ url: image.url, name: (image.revisedPrompt ?? 'Chat image').slice(0, 80), width: image.width, height: image.height, mimeType: 'image/png', source: 'generated' }]);
      toast.success('Saved to your Library', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save it to the Library', TOAST);
    } finally {
      setSaving(false);
    }
  };
  const action = 'inline-flex h-8 items-center gap-1.5 rounded-full bg-black/55 !px-2.5 !py-0 text-xs text-white/90 backdrop-blur-md transition-colors hover:bg-black/80';
  return (
    <figure className="group relative w-fit max-w-full">
      <button type="button" onClick={onOpen} className="block overflow-hidden rounded-2xl border border-white/10 bg-[#111114] !p-0" aria-label="Open the image full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.previewUrl ?? image.url} alt={image.revisedPrompt ?? 'Generated image'} className="block max-h-[520px] w-auto max-w-full object-contain" style={image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined} />
      </button>
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap justify-end gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 [&>*]:pointer-events-auto">
        <button type="button" onClick={onEdit} className={action}><PencilLine className="h-3.5 w-3.5" /> Edit</button>
        <a href={preview ? image.url : downloadUrl(image.url, name)} download={name} className={action}><Download className="h-3.5 w-3.5" /> Download</a>
        <button type="button" onClick={() => void save()} disabled={saving} className={action}><FolderPlus className="h-3.5 w-3.5" /> Library</button>
        <button type="button" onClick={onOpen} className={action} aria-label="Full size"><Maximize2 className="h-3.5 w-3.5" /></button>
      </div>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
        <span>{image.width && image.height ? `${image.width} × ${image.height}` : 'Auto size'}</span>
        <span>· {image.model.includes('sunburst') ? 'GPT Image Sunburst' : 'GPT Image Flare'} · {QUALITY_LABELS[image.quality] ?? image.quality}</span>
        {image.upscaled && <span>· enlarged beyond 2K</span>}
        {image.revisedPrompt && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(image.revisedPrompt ?? '').then(() => toast.success('Prompt copied', TOAST))}
            className="inline-flex items-center gap-1 rounded-full !px-1.5 !py-0.5 text-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            <Copy className="h-3 w-3" /> Copy prompt
          </button>
        )}
      </figcaption>
    </figure>
  );
}

function Creating({ live }: { live: LiveReply }) {
  return (
    <div className="relative w-[min(360px,100%)] overflow-hidden rounded-2xl border border-white/10 bg-[#111114]" style={{ aspectRatio: aspectOf(live.size) }}>
      {live.partial ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={live.partial} alt="" className={cx('h-full w-full object-cover transition-[filter] duration-700', live.partialIndex === 0 ? 'blur-xl' : 'blur-sm')} />
      ) : (
        <div className="playground-shimmer h-full w-full bg-white/[0.03]" />
      )}
      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white/85 backdrop-blur-md">
        Creating image{live.size !== 'Auto' ? ` · ${live.size}` : ''}…
      </span>
    </div>
  );
}

export function ChatMessages({ messages, live, preview, onEdit, onRetry }: {
  messages: ChatMessage[];
  live: LiveReply | null;
  preview: boolean;
  onEdit: (image: ChatImage) => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex flex-col items-end gap-2">
              {message.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">{message.attachments.map((item) => <Thumb key={item.url} item={item} onOpen={() => setViewing(item.url)} />)}</div>
              )}
              {message.text && <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[#1d1d22] px-4 py-2.5 text-[15px] leading-relaxed text-white">{message.text}</div>}
            </div>
          );
        }
        const generating = message.status === 'generating';
        const previous = messages[index - 1];
        return (
          <div key={message.id} className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gogrowth-mark.png" alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-white/5 p-1" />
            <div className="min-w-0 flex-1 space-y-3">
              {message.text ? (
                <Markdown className="text-[15px] [&_p]:my-1 [&_p]:text-white/90">{message.text}</Markdown>
              ) : generating && !live?.creating ? (
                <span className="inline-flex gap-1 pt-2" aria-label="Thinking">
                  {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" style={{ animationDelay: `${dot * 120}ms` }} />)}
                </span>
              ) : null}
              {generating && live?.creating && <Creating live={live} />}
              {message.images.map((image) => (
                <ImageResult key={image.url} image={image} preview={preview} onEdit={() => onEdit(image)} onOpen={() => setViewing(image.url)} />
              ))}
              {message.status === 'failed' && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">{message.error ?? 'The reply failed.'} Nothing was charged.</span>
                  {previous?.role === 'user' && (
                    <button type="button" onClick={() => onRetry(previous)} className="inline-flex items-center gap-1 rounded-full border border-red-300/30 !px-2.5 !py-1 text-red-100 hover:bg-red-500/10">
                      <RotateCcw className="h-3 w-3" /> Try again
                    </button>
                  )}
                </div>
              )}
              {message.status === 'stopped' && <p className="text-xs text-white/40">Stopped. Nothing was charged.</p>}
              {message.credits > 0 && <p className="text-[11px] text-white/30">{message.credits} credits</p>}
            </div>
          </div>
        );
      })}
      {viewing && <ImageViewer url={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
