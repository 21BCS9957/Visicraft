'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Check, ChevronDown, FolderInput, FolderOutput, ImagePlus, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import toast from '@/lib/toast';
import { libraryApi, playgroundApi } from '@/lib/playground/api';
import { MAX_ENABLED_REFERENCES, playgroundModel, referenceWarnings, ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import { usePlaygroundStore } from '@/lib/playground/store';
import type { PlaygroundReference } from '@/lib/playground/types';
import { IMAGE_ACCEPT, uploadImages } from '@/lib/playground/upload';
import { GuidelinesEditor } from './GuidelinesEditor';
import { LibraryPicker } from './library/LibraryPicker';
import { cx, Popover, PopoverClose, Toggle } from './ui';

const TOAST = { position: 'top-center' as const };
const ROLES: ReferenceRole[] = ['product', 'person', 'style'];
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
  const saveToLibrary = async () => {
    try {
      if (!preview) await libraryApi.addImages([{ url: reference.url, name: reference.label, width: reference.width, height: reference.height, source: 'project' }]);
      toast.success('Saved to your Library', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save to the Library', TOAST);
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
          <button type="button" onClick={saveToLibrary} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8">
            <FolderOutput className="h-4 w-4" /> Save to Library
          </button>
        </PopoverClose>
        <PopoverClose asChild>
          <button type="button" onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Remove from project
          </button>
        </PopoverClose>
      </Popover>
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  const model = playgroundModel(modelId);
  const enabled = references.filter((reference) => reference.enabled);
  const counts = { product: 0, person: 0, style: 0 } as Record<ReferenceRole, number>;
  enabled.forEach((reference) => { counts[reference.role] += 1; });
  const warnings = referenceWarnings(model.id, counts);

  const addImages = async (images: Array<{ url: string; width: number | null; height: number | null; mimeType: string | null; label: string }>, role: ReferenceRole) => {
    if (!projectId || !images.length) return;
    try {
      if (preview) {
        images.forEach((image, index) => upsertReference({ id: `local-${Date.now()}-${index}`, role, enabled: true, sourceItemId: null, createdAt: new Date().toISOString(), ...image }));
      } else {
        const { references: saved } = await playgroundApi.addReferences(projectId, images.map((image) => ({
          url: image.url, role, label: image.label, width: image.width ?? undefined, height: image.height ?? undefined, mimeType: image.mimeType ?? undefined,
        })));
        saved.forEach(upsertReference);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the references', TOAST);
    }
  };

  const upload = async (files: File[]) => {
    if (!projectId || !files.length) return;
    setUploading((count) => count + files.length);
    try {
      const uploaded = await uploadImages(files, { preview, onError: (message) => toast.error(message, TOAST) });
      await addImages(uploaded.map((image) => ({ url: image.url, width: image.width, height: image.height, mimeType: image.mimeType, label: image.name.slice(0, 80) })), addAs);
    } finally {
      setUploading((count) => Math.max(0, count - files.length));
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: IMAGE_ACCEPT,
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
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
        >
          <FolderInput className="h-3.5 w-3.5" /> Add from Library
        </button>
        <LibraryPicker
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          kind="image"
          title="Add references from your Library"
          preview={preview}
          showRole
          max={MAX_ENABLED_REFERENCES}
          confirmLabel={(count, role) => (count ? `Add ${count} as ${ROLE_LABELS[role].toLowerCase()}` : 'Add')}
          onPick={(items, role) => addImages(
            items.filter((item) => item.url).map((item) => ({ url: item.url!, width: item.width, height: item.height, mimeType: item.mimeType, label: item.name.slice(0, 80) })),
            role
          )}
        />

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

      <GuidelinesEditor />

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

