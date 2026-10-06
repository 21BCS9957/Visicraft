'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { BookOpen, Download, FileText, FolderInput, FolderOutput, MoreHorizontal, Pencil, Trash2, Upload, X } from 'lucide-react';
import toast from '@/lib/toast';
import { libraryApi, playgroundApi } from '@/lib/playground/api';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import { usePlaygroundStore } from '@/lib/playground/store';
import { LibraryPicker } from './library/LibraryPicker';
import { Markdown } from './Markdown';
import { cx, Popover, PopoverClose } from './ui';

const TOAST = { position: 'top-center' as const };

/**
 * The project's Guidelines: a Markdown document (uploaded or written here) that goes with
 * every image and into every written prompt. `emptyHint` replaces the text shown before any
 * are written; `compact` shows one row (name, size, actions) instead of the preview card.
 */
export function GuidelinesEditor({ emptyHint, compact = false }: { emptyHint?: string; compact?: boolean } = {}) {
  const project = usePlaygroundStore((state) => state.project);
  const setProject = usePlaygroundStore((state) => state.setProject);
  const preview = usePlaygroundStore((state) => state.preview);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!project) return null;
  const brief = project.brief;

  const save = (patch: { brief?: string; briefName?: string | null }, immediate = false) => {
    const next = { ...usePlaygroundStore.getState().project!, ...patch };
    setProject(next);
    if (preview) return;
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    const run = async () => {
      try {
        await playgroundApi.updateProject(next.id, { brief: next.brief, briefName: next.briefName });
        setSaveState('saved');
      } catch (error) {
        setSaveState('idle');
        toast.error(error instanceof Error ? error.message : 'Could not save the guidelines', TOAST);
      }
    };
    if (immediate) void run();
    else timer.current = setTimeout(run, 800);
  };

  const upload = async (file: File) => {
    const text = await file.text();
    if (text.length > MAX_BRIEF_CHARS) {
      toast.error(`That file has ${text.length.toLocaleString('en-IN')} characters; guidelines can be up to ${MAX_BRIEF_CHARS.toLocaleString('en-IN')}.`, TOAST);
      return;
    }
    if (brief.trim() && !window.confirm(`Replace the current guidelines with ${file.name}?`)) return;
    save({ brief: text, briefName: file.name }, true);
    toast.success(`${file.name} is now the project's guidelines`, TOAST);
  };

  const download = () => {
    const blob = new Blob([brief], { type: 'text/markdown' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = project.briefName || `${project.name.replace(/[^\w-]+/g, '-').toLowerCase()}-guidelines.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  const saveToLibrary = async () => {
    if (!brief.trim()) return;
    try {
      if (!preview) await libraryApi.addDocument({ name: project.briefName || `${project.name} guidelines.md`, content: brief, source: 'project' });
      toast.success('Saved to your Library', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save to the Library', TOAST);
    }
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".md,.markdown,.txt,text/markdown,text/plain"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
        event.target.value = '';
      }}
    />
  );

  const more = (
    <Popover
      side="right"
      align="start"
      className="w-56"
      trigger={<button type="button" aria-label="More guideline actions" className="rounded-full border border-white/10 p-1 text-white/60 hover:bg-white/8 hover:text-white"><MoreHorizontal className="h-3.5 w-3.5" /></button>}
    >
      <PopoverClose asChild>
        <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"><FolderInput className="h-4 w-4" /> Load from Library</button>
      </PopoverClose>
      <PopoverClose asChild>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"><Upload className="h-4 w-4" /> Upload .md</button>
      </PopoverClose>
      <PopoverClose asChild>
        <button type="button" disabled={!brief.trim()} onClick={() => void saveToLibrary()} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8 disabled:opacity-40"><FolderOutput className="h-4 w-4" /> Save to Library</button>
      </PopoverClose>
      <PopoverClose asChild>
        <button type="button" disabled={!brief.trim()} onClick={download} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8 disabled:opacity-40"><Download className="h-4 w-4" /> Download .md</button>
      </PopoverClose>
      <div className="my-1 border-t border-white/8" />
      <PopoverClose asChild>
        <button type="button" disabled={!brief.trim()} onClick={() => window.confirm('Clear the guidelines?') && save({ brief: '', briefName: null }, true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Clear</button>
      </PopoverClose>
    </Popover>
  );

  const dialogs = (
    <>
      {fileInput}
      <Dialog.Root open={editorOpen} onOpenChange={setEditorOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-3 z-[81] flex flex-col rounded-3xl border border-white/12 bg-[#121216] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none sm:inset-8">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3">
              <Dialog.Title className="flex items-center gap-2 text-base font-medium"><BookOpen className="h-4 w-4 text-[#fff05a]" /> Guidelines</Dialog.Title>
              <Dialog.Description className="text-xs text-white/45">Markdown · every image and prompt follows them</Dialog.Description>
              <span className="ml-auto text-[11px] text-white/40">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''} · {brief.length.toLocaleString('en-IN')} / {MAX_BRIEF_CHARS.toLocaleString('en-IN')}
              </span>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 hover:bg-white/8"><Upload className="h-3.5 w-3.5" /> Upload .md</button>
              <button type="button" disabled={!brief.trim()} onClick={download} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/80 hover:bg-white/8 disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Download</button>
              <Dialog.Close className="rounded-full p-1.5 text-white/50 hover:bg-white/8 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="grid min-h-0 flex-1 md:grid-cols-2">
              <textarea
                value={brief}
                onChange={(event) => save({ brief: event.target.value })}
                maxLength={MAX_BRIEF_CHARS}
                spellCheck
                placeholder={'# Brand\nWho you are, tone, audience.\n\n## Product\nExact facts: name, colours, what must never change.\n\n## Always\n- One hero product per image\n\n## Never\n- Competitor logos'}
                className="min-h-0 resize-none border-b border-white/8 bg-transparent p-5 font-mono text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25 md:border-b-0 md:border-r"
              />
              <div className={cx('min-h-0 overflow-y-auto p-5', !brief.trim() && 'flex items-center justify-center')}>
                {brief.trim() ? <Markdown>{brief}</Markdown> : <p className="text-sm text-white/30">The preview shows here.</p>}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <LibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="document"
        title="Load guidelines from your Library"
        preview={preview}
        multiple={false}
        confirmLabel={() => 'Use these guidelines'}
        onPick={(items, _role, content) => {
          if (content === null) return;
          if (brief.trim() && !window.confirm('Replace the current guidelines?')) return;
          save({ brief: content, briefName: items[0]?.name ?? null }, true);
          toast.success('Guidelines loaded', TOAST);
        }}
      />
    </>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left"
          title={brief.trim() ? 'Edit the guidelines' : 'Write the guidelines'}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60"><BookOpen className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm text-white">Guidelines</span>
            <span className="block truncate text-[11px] text-white/40">
              {saveState === 'saving'
                ? 'Saving…'
                : brief.trim()
                  ? `${project.briefName ?? 'Written here'} · ${brief.length.toLocaleString('en-IN')} chars`
                  : emptyHint ?? 'Brand, product facts, tone'}
            </span>
          </span>
        </button>
        <button type="button" onClick={() => setEditorOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/8">
          <Pencil className="h-3 w-3" /> {brief.trim() ? 'Edit' : 'Add'}
        </button>
        {more}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/50">
          <BookOpen className="h-3.5 w-3.5" /> Guidelines
        </h3>
        <span className="text-[11px] text-white/35">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : brief ? `${brief.length.toLocaleString('en-IN')} chars` : ''}
        </span>
      </div>
      {project.briefName && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <FileText className="h-3 w-3" /> <span className="truncate">{project.briefName}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="group relative block max-h-44 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left hover:border-white/20"
      >
        {brief.trim() ? (
          <>
            <Markdown className="pointer-events-none text-[12px]">{brief.slice(0, 1200)}</Markdown>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0f0f12] to-transparent" />
          </>
        ) : (
          <span className="block py-3 text-xs leading-relaxed text-white/35">
            {emptyHint ?? 'Upload a .md file or write your guidelines: brand, product facts, what to always or never show. Every image and prompt follows them.'}
          </span>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setEditorOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/8">
          <Pencil className="h-3 w-3" /> {brief.trim() ? 'Edit' : 'Write'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/8">
          <Upload className="h-3 w-3" /> Upload .md
        </button>
        <Popover
          side="right"
          align="start"
          className="w-56"
          trigger={<button type="button" aria-label="More guideline actions" className="rounded-full border border-white/10 p-1 text-white/60 hover:bg-white/8 hover:text-white"><MoreHorizontal className="h-3.5 w-3.5" /></button>}
        >
          <PopoverClose asChild>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8"><FolderInput className="h-4 w-4" /> Load from Library</button>
          </PopoverClose>
          <PopoverClose asChild>
            <button type="button" disabled={!brief.trim()} onClick={() => void saveToLibrary()} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8 disabled:opacity-40"><FolderOutput className="h-4 w-4" /> Save to Library</button>
          </PopoverClose>
          <PopoverClose asChild>
            <button type="button" disabled={!brief.trim()} onClick={download} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/8 disabled:opacity-40"><Download className="h-4 w-4" /> Download .md</button>
          </PopoverClose>
          <div className="my-1 border-t border-white/8" />
          <PopoverClose asChild>
            <button type="button" disabled={!brief.trim()} onClick={() => window.confirm('Clear the guidelines?') && save({ brief: '', briefName: null }, true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Clear</button>
          </PopoverClose>
        </Popover>
      </div>
      {dialogs}
    </div>
  );
}
