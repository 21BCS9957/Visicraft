'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Building2, ChevronRight, FolderOpen, ImagePlus, Loader2, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import type { ClientRef } from '@/lib/clients';
import type { MotionPreset } from '@/lib/video/presets';
import { PROMPT_ENHANCE_CREDITS } from '@/lib/video/shared';
import { videoAspectInfo, videoCredits, videoModelOptions, videoQualityLabel, type VideoAspect, type VideoQuality } from '@/lib/videoModels';
import { ClientPicker } from '@/components/playground/ClientPicker';
import { cx } from '@/components/playground/ui';
import { ShapeIcon } from '@/components/video-studio/VideoSettings';
import { ModelPicker, type CreateModel, type EngineState } from './ModelPicker';
import { PresetCard } from './PresetGallery';

/**
 * The Create tab's left panel, like Higgsfield's: the preset, the images, the prompt, the
 * model and a grid of settings, with Generate (and its price) at the bottom. Everything that is
 * sent shows here, so Generate renders at once.
 */

export interface PanelImage {
  url: string;
  name: string;
}

export type ImageRole = 'first_frame' | 'reference';
export type CreateAspect = VideoAspect | 'auto';

/** Up to 9 images (Seedance's reference film); Veo uses the first. */
export const MAX_CREATE_IMAGES = 9;
export const MAX_CREATE_PROMPT = 4000;

const CARD = 'rounded-2xl border border-white/[0.06] bg-[#141417]';

function SettingTile({ label, value, children, wide = false }: { label: string; value: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={cx(CARD, 'flex min-w-0 items-center gap-2 !px-3 !py-2.5 text-left transition-colors hover:border-white/15', wide && 'col-span-2')}>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-white/45">{label}</span>
            <span className="block truncate text-sm font-medium text-white">{value}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} collisionPadding={12} className="z-[95] w-[min(300px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141418]/95 p-2 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Option({ selected, onClick, children, hint }: { selected: boolean; onClick: () => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx('flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm transition-colors', selected ? 'bg-[#fff05a]/12 text-[#fff05a]' : 'text-white/85 hover:bg-white/[0.06]')}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {hint && <span className={cx('shrink-0 text-[11px]', selected ? 'text-[#fff05a]/70' : 'text-white/40')}>{hint}</span>}
    </button>
  );
}

export function ControlPanel(props: {
  preview: boolean;
  model: CreateModel;
  engines: EngineState | null;
  preset: MotionPreset;
  images: PanelImage[];
  uploading: number;
  role: ImageRole;
  prompt: string;
  seconds: number;
  quality: VideoQuality;
  aspect: CreateAspect;
  credits: number;
  /** Why Generate can't run yet (null: it can). */
  blocked: string | null;
  generating: boolean;
  improving: boolean;
  canUndo: boolean;
  /** A real face stopped Seedance: offer Veo. */
  faceBlock: string | null;
  clients: { enabled: boolean; list: ClientRef[]; value: ClientRef | null };
  onPresets: () => void;
  onModel: (model: string) => void;
  onFiles: (files: File[]) => void;
  onLibrary: () => void;
  onRemoveImage: (url: string) => void;
  onRole: (role: ImageRole) => void;
  onPrompt: (prompt: string) => void;
  onImprove: () => void;
  onUndo: () => void;
  onSeconds: (seconds: number) => void;
  onQuality: (quality: VideoQuality) => void;
  onAspect: (aspect: CreateAspect) => void;
  onClient: (client: ClientRef | null) => void;
  onUseVeo: () => void;
  onGenerate: () => void;
}) {
  const { model, images, role, quality, seconds, aspect } = props;
  const options = videoModelOptions(model.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const veo = model.engine === 'veo';
  const canAuto = !veo && images.length === 1 && role === 'first_frame';
  const asReferences = !veo && (images.length > 1 || (images.length === 1 && role === 'reference'));
  const priceAspect = aspect === 'auto' ? '9:16' : aspect;

  const insert = (text: string) => {
    const box = promptRef.current;
    const start = box?.selectionStart ?? props.prompt.length;
    const end = box?.selectionEnd ?? start;
    const before = props.prompt.slice(0, start);
    const spacer = before && !/\s$/.test(before) ? ' ' : '';
    const next = `${before}${spacer}${text}${props.prompt.slice(end)}`;
    props.onPrompt(next.slice(0, MAX_CREATE_PROMPT));
    window.setTimeout(() => {
      box?.focus();
      const caret = before.length + spacer.length + text.length;
      box?.setSelectionRange(caret, caret);
    }, 0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 [scrollbar-width:thin]">
        <PresetCard preset={props.preset} model={model.name} onChange={props.onPresets} />

        {/* Upload media */}
        <section
          className={cx(CARD, 'p-3 transition-colors', dragging && 'border-[#fff05a]/60 bg-[#fff05a]/[0.04]')}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
            if (files.length) props.onFiles(files);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length) props.onFiles(files);
            }}
          />
          {images.length === 0 && props.uploading === 0 ? (
            <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 !py-5 text-center transition-colors hover:border-white/30">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07]"><ImagePlus className="h-4 w-4 text-white/70" /></span>
              <span className="text-sm font-medium text-white">Upload images</span>
              <span className="text-[11px] text-white/40">{veo ? 'Veo starts from one image' : 'Optional · a start image, or up to 9 references'}</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white/45">
                  {veo ? 'Start image' : asReferences ? `References · Image 1${images.length > 1 ? `–${images.length}` : ''}` : 'Start image'}
                </p>
                <span className="text-[11px] tabular-nums text-white/35">{veo ? (images.length > 1 ? `1 of ${images.length} used` : '1/1') : `${images.length}/${MAX_CREATE_IMAGES}`}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {images.map((image, index) => (
                  <figure key={image.url} className={cx('group relative aspect-square overflow-hidden rounded-lg ring-1 ring-white/10', veo && index > 0 && 'opacity-35')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold text-white">{index + 1}</span>
                    <button type="button" onClick={() => props.onRemoveImage(image.url)} aria-label={`Remove image ${index + 1}`} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 !p-0 text-white/80 hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  </figure>
                ))}
                {Array.from({ length: props.uploading }, (_, index) => (
                  <div key={`up-${index}`} className="flex aspect-square items-center justify-center rounded-lg bg-white/[0.05]"><Loader2 className="h-4 w-4 animate-spin text-white/50" /></div>
                ))}
                {images.length + props.uploading < MAX_CREATE_IMAGES && (
                  <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add images" className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/15 !p-0 text-white/50 hover:border-white/35 hover:text-white">
                    <Upload className="h-4 w-4" />
                  </button>
                )}
              </div>
              {images.length === 1 && !veo && (
                <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="How the image is used">
                  {([['first_frame', 'Start frame'], ['reference', 'Reference']] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={role === id} onClick={() => props.onRole(id)} className={cx('rounded-lg !px-2 !py-1.5 text-xs transition-colors', role === id ? 'bg-white/12 text-white' : 'text-white/50 hover:text-white')}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {veo && images.length > 1 && <p className="mt-2 text-[11px] text-white/45">Veo uses the first image only.</p>}
            </>
          )}
          <button type="button" onClick={props.onLibrary} className="mt-2 inline-flex items-center gap-1.5 rounded-full !px-2 !py-1 text-[11px] text-white/50 hover:bg-white/[0.06] hover:text-white">
            <FolderOpen className="h-3.5 w-3.5" /> From the Library
          </button>
        </section>

        {/* Prompt */}
        <section className={cx(CARD, 'p-3')}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-white/45">Prompt</p>
            <span className={cx('text-[10px] tabular-nums', props.prompt.length > MAX_CREATE_PROMPT * 0.9 ? 'text-[#fff05a]' : 'text-white/30')}>{props.prompt.length.toLocaleString('en-IN')}</span>
          </div>
          <textarea
            ref={promptRef}
            value={props.prompt}
            onChange={(event) => props.onPrompt(event.target.value.slice(0, MAX_CREATE_PROMPT))}
            rows={5}
            placeholder={asReferences ? 'Describe your video. Say where each image goes, e.g. “she holds the bottle (Image 2)”.' : 'Describe your video in a few words or in detail: who, what happens, where, the camera.'}
            className="mt-1.5 max-h-[40vh] min-h-[110px] w-full resize-y bg-transparent text-sm leading-relaxed text-white !outline-none placeholder:text-white/30"
          />
          {asReferences && (
            <div className="mt-1 flex flex-wrap gap-1">
              {images.map((image, index) => (
                <button key={image.url} type="button" onClick={() => insert(`(Image ${index + 1})`)} className="rounded-md bg-white/[0.06] !px-1.5 !py-0.5 text-[11px] text-white/65 hover:bg-white/12 hover:text-white">
                  + Image {index + 1}
                </button>
              ))}
            </div>
          )}
          {props.preset.line && (
            <p className="mt-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] leading-snug text-white/50">
              <span className="font-medium text-white/70">{props.preset.name}:</span> {props.preset.line}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={props.onImprove}
              disabled={props.improving || props.prompt.trim().length < 3}
              title="Claude turns your idea into a shot-by-shot prompt for this model"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 !px-2.5 !py-1 text-xs text-white/80 transition-colors hover:border-[#fff05a]/40 hover:text-[#fff05a] disabled:opacity-40"
            >
              {props.improving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
              {props.improving ? 'Writing…' : 'Improve prompt'}
              <span className="text-[10px] text-white/35">{PROMPT_ENHANCE_CREDITS} cr</span>
            </button>
            {props.canUndo && (
              <button type="button" onClick={props.onUndo} className="inline-flex items-center gap-1 rounded-full !px-2 !py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white">
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </button>
            )}
          </div>
        </section>

        <ModelPicker value={model.id} engines={props.engines} onChange={props.onModel} />

        {/* Settings, two by two */}
        <div className="grid grid-cols-2 gap-2.5">
          <SettingTile label="Duration" value={`${seconds}s`}>
            {(close) => (
              <div className="grid grid-cols-4 gap-1">
                {options.durations.map((value) => (
                  <button key={value} type="button" onClick={() => { props.onSeconds(value); close(); }} className={cx('rounded-xl !px-2 !py-2 text-sm transition-colors', value === seconds ? 'bg-[#fff05a]/12 text-[#fff05a]' : 'text-white/80 hover:bg-white/[0.06]')}>
                    {value}s
                  </button>
                ))}
              </div>
            )}
          </SettingTile>
          <SettingTile label="Shape" value={aspect === 'auto' ? 'Match image' : `${aspect} · ${videoAspectInfo(aspect).label}`}>
            {(close) => (
              <div className="space-y-0.5">
                {canAuto ? (
                  <>
                    <Option selected onClick={close} hint="keeps your image">Match image</Option>
                    <p className="px-2.5 pt-1 text-[11px] leading-snug text-white/45">Seedance 2.5 keeps a start image’s own shape. To pick a shape, crop the image first or switch it to “Reference”.</p>
                  </>
                ) : options.aspectRatios.map((ratio) => (
                  <Option key={ratio} selected={aspect === ratio} onClick={() => { props.onAspect(ratio); close(); }} hint={videoAspectInfo(ratio).use}>
                    <span className="inline-flex items-center gap-2"><ShapeIcon ratio={ratio} /> {ratio} · {videoAspectInfo(ratio).label}</span>
                  </Option>
                ))}
                {veo && <p className="px-2.5 pt-1 text-[11px] text-white/40">Square and 3:4 need Seedance.</p>}
              </div>
            )}
          </SettingTile>
          <SettingTile label="Quality" value={quality === 'draft' ? `Draft · ${options.draft.resolution}` : videoQualityLabel(quality)} wide={!props.clients.enabled}>
            {(close) => (
              <div className="space-y-0.5">
                {(['draft', ...options.qualities] as VideoQuality[]).map((value) => (
                  <Option key={value} selected={value === quality} onClick={() => { props.onQuality(value); close(); }} hint={`${videoCredits(model.id, value, seconds, priceAspect)} cr`}>
                    {value === 'draft' ? `Draft · ${options.draft.resolution}` : videoQualityLabel(value)}
                  </Option>
                ))}
                <p className="px-2.5 pt-1 text-[11px] leading-snug text-white/40">
                  {options.draft.native ? 'A draft is a cheap test; like it, then upgrade the same take to 1080p.' : 'A draft is a cheap test; upgrade it later and pay only for the final.'}
                </p>
              </div>
            )}
          </SettingTile>
          {props.clients.enabled && (
            <ClientPicker
              open={clientOpen}
              onOpenChange={setClientOpen}
              value={props.clients.value?.id ?? null}
              title="Which client is this video for?"
              side="top"
              onPick={(client) => props.onClient(client)}
            >
              <button type="button" className={cx(CARD, 'flex min-w-0 items-center gap-2 !px-3 !py-2.5 text-left transition-colors hover:border-white/15')}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-white/45">Client</span>
                  <span className={cx('flex items-center gap-1 truncate text-sm font-medium', props.clients.value ? 'text-white' : 'text-white/45')}>
                    <Building2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{props.clients.value?.name ?? 'None'}</span>
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
              </button>
            </ClientPicker>
          )}
        </div>

        {props.faceBlock && (
          <div className="rounded-2xl border border-[#fff05a]/25 bg-[#fff05a]/[0.06] p-3">
            <p className="text-xs leading-relaxed text-[#fbf2a0]">{props.faceBlock}</p>
            {props.engines?.veo.ready === false ? (
              <p className="mt-2 text-[11px] leading-snug text-white/50">Google Veo (which keeps real people) isn’t switched on yet: {props.engines.veo.reason}</p>
            ) : (
              <button type="button" onClick={props.onUseVeo} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff05a] !px-3 !py-1.5 text-xs font-semibold text-[#1f1c00] hover:bg-white">
                Use Google Veo instead
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/[0.06] bg-[#0b0b0d]/95 p-3 backdrop-blur-xl lg:static">
        {props.blocked && <p className="mb-2 text-center text-[11px] text-white/45">{props.blocked}</p>}
        <button
          type="button"
          onClick={props.onGenerate}
          disabled={Boolean(props.blocked) || props.generating}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#fff05a] text-[15px] font-bold text-[#1f1c00] shadow-[0_0_40px_rgba(255,240,90,0.18)] transition-colors hover:bg-[#fff59a] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {props.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          {props.generating ? 'Starting…' : 'Generate'}
          {!props.generating && <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold tabular-nums">{props.credits} cr</span>}
        </button>
      </div>
    </div>
  );
}
