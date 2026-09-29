'use client';

import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Check, ChevronDown, ImagePlus, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import toast from '@/lib/toast';
import { uploadFileWithSignedUrl } from '@/lib/supabase/storage';
import { playgroundApi } from '@/lib/playground/api';
import { MAX_ENABLED_REFERENCES, playgroundModel, referenceWarnings, ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundReference } from '@/lib/playground/types';
import { cx, Popover, PopoverClose, Toggle } from './ui';

const TOAST = { position: 'top-center' as const };
const ROLES: ReferenceRole[] = ['product', 'person', 'style'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Reads the image's size and, when it's over the 5 MB upload limit, re-encodes it smaller. */
async function prepareUpload(file: File): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (file.size <= MAX_UPLOAD_BYTES && ACCEPTED.includes(file.type)) {
    bitmap.close();
    return { file, width, height };
  }
  const scale = Math.min(1, 3072 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.92, 0.85, 0.78]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      return { file: new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }), width: canvas.width, height: canvas.height };
    }
  }
  throw new Error(`${file.name} is too large even after shrinking.`);
}

function ReferenceTile({ reference }: { reference: PlaygroundReference }) {
  const preview = usePlaygroundStore((state) => state.preview);
  const upsertReference = usePlaygroundStore((state) => state.upsertReference);
  const removeReference = usePlaygroundStore((state) => state.removeReference);
  const [label, setLabel] = useState(reference.label);

  const update = async (patch: Partial<Pick<PlaygroundReference, 'role' | 'label' | 'enabled'>>) => {
    const previous = reference;
    upsertReference({ ...reference, ...patch });
    if (preview) return;
    try {
      upsertReference((await playgroundApi.updateReference(reference.id, patch)).reference);
    } catch (error) {
      upsertReference(previous);
      toast.error(error instanceof Error ? error.message : 'Could not update the reference', TOAST);
    }
  };
  const remove = async () => {
    try {
      if (!preview) await playgroundApi.deleteReference(reference.id);
      removeReference(reference.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the reference', TOAST);
    }
  };

  return (
    <div className={cx('group relative overflow-hidden rounded-xl border bg-white/[0.03] transition-opacity', reference.enabled ? 'border-white/12' : 'border-white/5 opacity-45')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={reference.url} alt={reference.label || ROLE_LABELS[reference.role]} loading="lazy" className="aspect-square w-full object-cover" />
      <div className="absolute right-1.5 top-1.5">
        <Toggle checked={reference.enabled} onCheckedChange={(enabled) => update({ enabled })} label={reference.enabled ? 'Used in every image (click to switch off)' : 'Switched off (click to use it)'} />
      </div>
      <Popover
        side="right"
        align="start"
        className="w-60"
        trigger={
          <button type="button" className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 rounded-lg bg-black/60 px-2 py-1 text-left text-[11px] text-white backdrop-blur-md hover:bg-black/80">
            <span className="truncate">{reference.label || ROLE_LABELS[reference.role]}</span>
            <Pencil className="h-3 w-3 shrink-0 text-white/60" />
          </button>
        }
      >
        <label className="block px-1 pb-1 text-[11px] uppercase tracking-wide text-white/40">Label (sent to Gemini)</label>
        <input
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => label !== reference.label && update({ label })}
          onKeyDown={(event) => event.key === 'Enter' && (event.currentTarget as HTMLInputElement).blur()}
          placeholder="e.g. Front of the box"
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-white/25"
        />
        <p className="px-1 pb-1 pt-3 text-[11px] uppercase tracking-wide text-white/40">Use it as</p>
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => update({ role })}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"
          >
            {ROLE_LABELS[role]}
            {reference.role === role && <Check className="h-4 w-4 text-[#fff05a]" />}
          </button>
        ))}
        <div className="my-2 border-t border-white/8" />
        <PopoverClose asChild>
          <button type="button" onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Remove from project
          </button>
        </PopoverClose>
      </Popover>
    </div>
  );
}

function BriefEditor() {
  const project = usePlaygroundStore((state) => state.project);
  const setProject = usePlaygroundStore((state) => state.setProject);
  const preview = usePlaygroundStore((state) => state.preview);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!project) return null;
  const change = (brief: string) => {
    setProject({ ...project, brief });
    if (preview) return;
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await playgroundApi.updateProject(project.id, { brief });
        setState('saved');
      } catch (error) {
        setState('idle');
        toast.error(error instanceof Error ? error.message : 'Could not save the brief', TOAST);
      }
    }, 800);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">Brief</h3>
        <span className="text-[11px] text-white/35">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : `${project.brief.length}/${MAX_BRIEF_CHARS}`}
        </span>
      </div>
      <textarea
        value={project.brief}
        maxLength={MAX_BRIEF_CHARS}
        onChange={(event) => change(event.target.value)}
        rows={7}
        placeholder={'Added to every prompt. For example:\nBrand: Brew Sage. Product: Night Unwind tea, 30 bags.\nKeep the logo, the purple pill and all text exactly.\nMood: warm, calm, premium. Market: India.'}
        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-white/25"
      />
    </div>
  );
}

export function ReferencePanel() {
  const projectId = usePlaygroundStore((state) => state.projectId);
  const preview = usePlaygroundStore((state) => state.preview);
  const references = usePlaygroundStore((state) => state.references);
  const upsertReference = usePlaygroundStore((state) => state.upsertReference);
  const modelId = usePlaygroundStore((state) => state.settings.model);
  const [addAs, setAddAs] = useState<ReferenceRole>('product');
  const [uploading, setUploading] = useState(0);

  const model = playgroundModel(modelId);
  const enabled = references.filter((reference) => reference.enabled);
  const counts = { product: 0, person: 0, style: 0 } as Record<ReferenceRole, number>;
  enabled.forEach((reference) => { counts[reference.role] += 1; });
  const warnings = referenceWarnings(model.id, counts);

  const upload = async (files: File[]) => {
    if (!projectId || !files.length) return;
    setUploading((count) => count + files.length);
    const added: Array<{ url: string; width: number; height: number; mimeType: string; label: string }> = [];
    await Promise.all(files.map(async (original) => {
      try {
        const { file, width, height } = await prepareUpload(original);
        const url = preview ? URL.createObjectURL(file) : await uploadFileWithSignedUrl(file, 'source-images');
        added.push({ url, width, height, mimeType: file.type, label: original.name.replace(/\.\w+$/, '').slice(0, 80) });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not upload ${original.name}`, TOAST);
      } finally {
        setUploading((count) => count - 1);
      }
    }));
    if (!added.length) return;
    try {
      if (preview) {
        added.forEach((image, index) => upsertReference({ id: `local-${Date.now()}-${index}`, role: addAs, enabled: true, sourceItemId: null, createdAt: new Date().toISOString(), ...image }));
      } else {
        const { references: saved } = await playgroundApi.addReferences(projectId, added.map((image) => ({ ...image, role: addAs })));
        saved.forEach(upsertReference);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the references', TOAST);
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] },
    multiple: true,
    noClick: true,
    onDrop: (accepted, rejected) => {
      if (rejected.length) toast.error('Only JPG, PNG and WebP images can be references.', TOAST);
      void upload(accepted);
    },
  });

  return (
    <aside
      {...getRootProps()}
      className={cx(
        'relative flex h-full w-full flex-col gap-5 overflow-y-auto border-r border-white/8 bg-[#0c0c0f]/80 p-4',
        isDragActive && 'bg-[#fff05a]/[0.04]'
      )}
    >
      <input {...getInputProps()} />
      <div>
        <h2 className="text-sm font-medium text-white">Project context</h2>
        <p className="mt-0.5 text-xs text-white/45">Saved with the project and used for every image.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">References</h3>
          <span className={cx('text-[11px]', enabled.length > MAX_ENABLED_REFERENCES ? 'text-red-300' : 'text-white/40')}>
            {enabled.length}/{MAX_ENABLED_REFERENCES} on
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40">Add as</span>
          <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setAddAs(role)}
                className={cx('rounded-full px-2.5 py-1 text-[11px] transition-colors', addAs === role ? 'bg-white/12 text-white' : 'text-white/50 hover:text-white')}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={open}
          className={cx(
            'flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center transition-colors',
            isDragActive ? 'border-[#fff05a]/60 bg-[#fff05a]/[0.06]' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
          )}
        >
          {uploading > 0 ? <Loader2 className="h-5 w-5 animate-spin text-[#fff05a]" /> : <Upload className="h-5 w-5 text-white/55" />}
          <span className="text-sm text-white/80">{uploading > 0 ? `Uploading ${uploading}…` : 'Drop images or click to add'}</span>
          <span className="text-[11px] text-white/35">JPG, PNG or WebP · added as {ROLE_LABELS[addAs].toLowerCase()}</span>
        </button>

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-[#fff05a]/20 bg-[#fff05a]/[0.05] px-3 py-2 text-[11px] leading-relaxed text-[#fff6a8]/90">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        {ROLES.map((role) => {
          const group = references.filter((reference) => reference.role === role);
          const guide = model.referenceGuide[role];
          return (
            <div key={role} className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/70">{ROLE_LABELS[role]}</span>
                <span className="text-white/35">
                  {counts[role]} on{guide !== null ? ` · ${model.name} keeps ${guide}` : ` · not used by ${model.name}`}
                </span>
              </div>
              {group.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {group.map((reference) => <ReferenceTile key={reference.id} reference={reference} />)}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddAs(role); open(); }}
                  className="flex w-full items-center gap-2 rounded-xl border border-white/6 px-3 py-2 text-left text-[11px] text-white/35 hover:border-white/15 hover:text-white/60"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {role === 'product' ? 'Product photos: kept exactly' : role === 'person' ? 'A model or face to keep' : 'A look to match (not copied)'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <BriefEditor />

      <details className="group rounded-xl border border-white/6 px-3 py-2 text-[11px] text-white/45">
        <summary className="flex cursor-pointer list-none items-center justify-between text-white/60">
          How references are used <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 leading-relaxed">
          Every switched-on reference is sent with every prompt, numbered and labelled. Products are reproduced exactly,
          people keep their face, and styles set the look without being copied. Gemini takes up to {MAX_ENABLED_REFERENCES} images per request.
        </p>
      </details>
    </aside>
  );
}

