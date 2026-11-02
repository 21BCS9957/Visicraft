'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { ArrowUp, Check, FolderOpen, ImagePlus, Loader2, Paperclip, Ratio, Sparkles, Square, X } from 'lucide-react';
import toast from '@/lib/toast';
import { chatImagePrice, choiceLabel, planSize, sameChoice, SIZE_PRESETS, sizeFromText, type SizeChoice } from '@/lib/chat/sizes';
import type { ChatAttachment } from '@/lib/chat/types';
import { QUALITY_LABELS, type ImageQuality } from '@/lib/playground/models';
import { uploadImages } from '@/lib/playground/upload';
import { useSpeechDictation } from '@/lib/useSpeechDictation';
import { LibraryPicker } from '@/components/playground/library/LibraryPicker';
import { cx } from '@/components/playground/ui';
import { DictationButton } from '@/components/shared/DictationButton';

const TOAST = { position: 'top-center' as const };
const MAX_ATTACHMENTS = 6;
const QUALITIES: ImageQuality[] = ['high', 'xhigh', 'max'];

function Chip({ icon, label, children, title }: { icon: ReactNode; label: string; children: (close: () => void) => ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" title={title} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 !px-2.5 !py-0 text-xs text-white/75 transition-colors hover:border-white/25 hover:text-white">
          {icon} {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} collisionPadding={12} className="z-[95] w-[min(300px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#17171b]/95 p-2 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ChatComposer({ text, onText, attachments, onAttachments, size, onSize, quality, onQuality, sending, blocked, preview, placeholder, focusKey, onSend, onStop }: {
  text: string;
  onText: (text: string) => void;
  attachments: ChatAttachment[];
  onAttachments: (next: ChatAttachment[]) => void;
  size: SizeChoice;
  onSize: (size: SizeChoice) => void;
  quality: ImageQuality;
  onQuality: (quality: ImageQuality) => void;
  sending: boolean;
  /** Why sending is off (setup, signed out); null when it can send. */
  blocked: string | null;
  preview: boolean;
  placeholder: string;
  /** Changes when the box should take the focus (a new chat, Edit on an image). */
  focusKey: string;
  onSend: () => void;
  onStop: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [library, setLibrary] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [custom, setCustom] = useState({ width: '1080', height: '1350' });
  const dictation = useSpeechDictation((value) => onText(typeof value === 'function' ? value(text) : value), { onError: (message) => toast.error(message, TOAST) });

  // The box grows with its text, up to a third of the screen.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, Math.round(window.innerHeight * 0.33))}px`;
  }, [text]);
  useEffect(() => {
    box.current?.focus();
  }, [focusKey]);

  const typed = sizeFromText(text);
  const plan = planSize(typed ?? size);
  const price = chatImagePrice(plan, quality, attachments.length);
  const canSend = !blocked && !sending && uploading === 0 && (text.trim().length > 0 || attachments.length > 0);

  const add = async (picked: File[]) => {
    const room = MAX_ATTACHMENTS - attachments.length - uploading;
    const take = picked.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (!take.length) {
      if (picked.length) toast.info(`Up to ${MAX_ATTACHMENTS} images per message.`, TOAST);
      return;
    }
    setUploading((count) => count + take.length);
    try {
      const done = await uploadImages(take, { preview, onError: (message) => toast.error(message, TOAST) });
      onAttachments([...attachments, ...done.map((file) => ({ url: file.url, name: file.name, width: file.width ?? null, height: file.height ?? null }))].slice(0, MAX_ATTACHMENTS));
    } finally {
      setUploading((count) => count - take.length);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-6 sm:pb-5">
      <div
        className={cx('rounded-[26px] border bg-[#161619] p-2 shadow-[0_8px_40px_rgba(0,0,0,0.35)] transition-colors', dragging ? 'border-[#fff05a]/60' : 'border-white/10 focus-within:border-white/20')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void add([...event.dataTransfer.files]);
        }}
      >
        {(attachments.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-2 px-2 pt-1.5">
            {attachments.map((item) => (
              <figure key={item.url} className="relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                <button type="button" onClick={() => onAttachments(attachments.filter((known) => known.url !== item.url))} aria-label="Remove image" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 !p-0 text-white/80 hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </figure>
            ))}
            {Array.from({ length: uploading }, (_, index) => <div key={index} className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/[0.05]"><Loader2 className="h-4 w-4 animate-spin text-white/50" /></div>)}
          </div>
        )}
        <textarea
          ref={box}
          value={text}
          rows={1}
          onChange={(event) => onText(event.target.value.slice(0, 8000))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
            if (pasted.length) {
              event.preventDefault();
              void add(pasted);
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          className="block max-h-[33vh] min-h-[44px] w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[15px] leading-relaxed text-white !outline-none placeholder:text-white/35"
        />
        <input ref={files} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = '';
          void add(picked);
        }} />
        <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
          <Chip icon={<Paperclip className="h-3.5 w-3.5" />} label="Attach" title="Add images (or paste / drop them)">
            {(close) => (
              <div className="space-y-0.5">
                <button type="button" onClick={() => { close(); files.current?.click(); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm text-white/85 hover:bg-white/[0.06]"><ImagePlus className="h-4 w-4" /> Upload images</button>
                <button type="button" onClick={() => { close(); setLibrary(true); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm text-white/85 hover:bg-white/[0.06]"><FolderOpen className="h-4 w-4" /> From your Library</button>
                <p className="px-2.5 pb-1 pt-1 text-[11px] text-white/40">You can also paste or drop images here.</p>
              </div>
            )}
          </Chip>
          <Chip icon={<Ratio className="h-3.5 w-3.5" />} label={typed ? `${plan.label} (from your message)` : choiceLabel(size)} title="Image size">
            {(close) => (
              <div className="space-y-0.5">
                {typed && <p className="px-2.5 pb-1 pt-1 text-[11px] leading-snug text-[#fff05a]/80">Your message asks for {plan.label}; that wins over this setting.</p>}
                {plan.clamped && <p className="px-2.5 pb-1 text-[11px] leading-snug text-white/50">Longer than 3:1, so it’s made at 3:1 and trimmed, with the important parts kept in the middle.</p>}
                {SIZE_PRESETS.map((preset) => {
                  const choice: SizeChoice = preset.id === 'auto' ? { kind: 'auto' } : { kind: 'ratio', ratio: preset.id };
                  const selected = sameChoice(choice, size);
                  return (
                    <button key={preset.id} type="button" onClick={() => { onSize(choice); close(); }} className={cx('flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm', selected ? 'bg-[#fff05a]/12 text-[#fff05a]' : 'text-white/85 hover:bg-white/[0.06]')}>
                      <span className="min-w-0 flex-1">{preset.label}</span>
                      <span className={cx('text-[11px]', selected ? 'text-[#fff05a]/70' : 'text-white/40')}>{preset.hint}</span>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
                <div className="mt-1 border-t border-white/8 px-2.5 pt-2">
                  <p className="text-[11px] text-white/45">Any size, in pixels</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input value={custom.width} onChange={(event) => setCustom({ ...custom, width: event.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" aria-label="Width" className="h-8 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white !outline-none focus:border-white/25" />
                    <span className="text-white/40">×</span>
                    <input value={custom.height} onChange={(event) => setCustom({ ...custom, height: event.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" aria-label="Height" className="h-8 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white !outline-none focus:border-white/25" />
                    <button
                      type="button"
                      onClick={() => {
                        const width = Number(custom.width);
                        const height = Number(custom.height);
                        if (width < 64 || height < 64) return toast.error('Use at least 64 × 64 pixels.', TOAST);
                        onSize({ kind: 'custom', width, height });
                        close();
                      }}
                      className="ml-auto h-8 rounded-lg bg-white/10 !px-3 !py-0 text-xs text-white hover:bg-white/15"
                    >
                      Use
                    </button>
                  </div>
                  <p className="mt-1.5 pb-1 text-[11px] leading-snug text-white/35">Or just type it in your message: “1080x1350”, “3:1”, “9:16 story”, “square”.</p>
                </div>
              </div>
            )}
          </Chip>
          <Chip icon={<Sparkles className="h-3.5 w-3.5" />} label={QUALITY_LABELS[quality]} title="Image quality">
            {(close) => (
              <div className="space-y-0.5">
                {QUALITIES.map((option) => {
                  const selected = option === quality;
                  return (
                    <button key={option} type="button" onClick={() => { onQuality(option); close(); }} className={cx('flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm', selected ? 'bg-[#fff05a]/12 text-[#fff05a]' : 'text-white/85 hover:bg-white/[0.06]')}>
                      <span className="min-w-0 flex-1">{QUALITY_LABELS[option]}</span>
                      <span className={cx('text-[11px] tabular-nums', selected ? 'text-[#fff05a]/70' : 'text-white/40')}>{chatImagePrice(plan, option, attachments.length).credits} cr</span>
                    </button>
                  );
                })}
                <p className="px-2.5 pb-1 pt-1 text-[11px] leading-snug text-white/40">High suits most posts. Max is slower, for fine detail and small text.</p>
              </div>
            )}
          </Chip>
          <span className="hidden text-[11px] text-white/30 sm:inline">≈ {price.credits} credits if it makes an image</span>
          <div className="ml-auto flex items-center gap-1.5">
            <DictationButton dictation={dictation} text={text} size="sm" disabled={sending} />
            {sending ? (
              <button type="button" onClick={onStop} aria-label="Stop" title="Stop (nothing is charged)" className="flex h-9 w-9 items-center justify-center rounded-full bg-white !p-0 text-black hover:bg-white/85">
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button type="button" onClick={onSend} disabled={!canSend} aria-label="Send" title={blocked ?? 'Send (Enter)'} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff05a] !p-0 text-[#1f1c00] transition-colors hover:bg-white disabled:bg-white/15 disabled:text-white/40">
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-white/30">{blocked ?? 'Images are made with OpenAI’s GPT Image. Check details like text and logos before you use them.'}</p>
      <LibraryPicker
        open={library}
        onOpenChange={setLibrary}
        kind="image"
        title="Images from your Library"
        description="Attach them to your message."
        preview={preview}
        multiple
        max={Math.max(1, MAX_ATTACHMENTS - attachments.length)}
        exclude={attachments.map((item) => item.url)}
        confirmLabel={(count) => `Attach ${count} image${count === 1 ? '' : 's'}`}
        onPick={(items) => {
          const picked = items.filter((item) => item.url).map((item) => ({ url: item.url!, name: item.name, width: item.width, height: item.height }));
          onAttachments([...attachments, ...picked.filter((item) => !attachments.some((known) => known.url === item.url))].slice(0, MAX_ATTACHMENTS));
          setLibrary(false);
        }}
      />
    </div>
  );
}
