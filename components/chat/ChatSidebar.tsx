'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { ChevronDown, ChevronRight, Folder, FolderPlus, Home, MessageSquare, MoreHorizontal, Pencil, Search, SquarePen, Trash2, X } from 'lucide-react';
import type { ChatProject, ChatThread } from '@/lib/chat/types';
import { cx } from '@/components/playground/ui';

export type ChatView = { kind: 'new'; projectId: string | null } | { kind: 'thread'; threadId: string } | { kind: 'project'; projectId: string };

const DAY = 24 * 3_600_000;

/** Today, Yesterday, Previous 7 days, Previous 30 days, then by month, like ChatGPT. */
function groupOf(iso: string, now: Date): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = Date.parse(iso);
  if (at >= start) return 'Today';
  if (at >= start - DAY) return 'Yesterday';
  if (at >= start - 7 * DAY) return 'Previous 7 days';
  if (at >= start - 30 * DAY) return 'Previous 30 days';
  return new Date(at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function ThreadRow({ thread, active, projects, onOpen, onRename, onMove, onDelete, indent = false }: {
  thread: ChatThread;
  active: boolean;
  projects: ChatProject[];
  onOpen: () => void;
  onRename: () => void;
  onMove: (projectId: string | null) => void;
  onDelete: () => void;
  indent?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className={cx('group relative flex items-center rounded-xl', active ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]', indent && 'ml-4')}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate !px-2.5 !py-2 text-left text-[13px] text-white/80" title={thread.title}>{thread.title}</button>
      <Popover.Root open={menu} onOpenChange={setMenu}>
        <Popover.Trigger asChild>
          <button type="button" aria-label={`Actions for ${thread.title}`} className={cx('mr-1 rounded-lg !p-1 text-white/45 hover:text-white', menu ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100')}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="start" sideOffset={6} collisionPadding={12} className="z-[95] w-56 rounded-2xl border border-white/10 bg-[#17171b]/95 p-1.5 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <button type="button" onClick={() => { setMenu(false); onRename(); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-white/85 hover:bg-white/[0.06]"><Pencil className="h-4 w-4" /> Rename</button>
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Move to project</p>
            {projects.map((project) => (
              <button key={project.id} type="button" disabled={project.id === thread.projectId} onClick={() => { setMenu(false); onMove(project.id); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-1.5 text-left text-white/80 hover:bg-white/[0.06] disabled:opacity-40">
                <Folder className="h-3.5 w-3.5" /> <span className="truncate">{project.name}</span>
              </button>
            ))}
            {thread.projectId && <button type="button" onClick={() => { setMenu(false); onMove(null); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-1.5 text-left text-white/70 hover:bg-white/[0.06]"><X className="h-3.5 w-3.5" /> Out of the project</button>}
            {!projects.length && <p className="px-2.5 pb-1 text-[11px] text-white/35">No projects yet.</p>}
            <div className="my-1 border-t border-white/8" />
            <button type="button" onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Delete</button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function ChatSidebar({ projects, threads, view, credits, onNew, onOpenThread, onOpenProject, onCreateProject, onRenameThread, onMoveThread, onDeleteThread, onClose }: {
  projects: ChatProject[];
  threads: ChatThread[];
  view: ChatView;
  credits: number | null;
  onNew: () => void;
  onOpenThread: (thread: ChatThread) => void;
  onOpenProject: (project: ChatProject) => void;
  onCreateProject: (name: string) => void;
  onRenameThread: (thread: ChatThread) => void;
  onMoveThread: (thread: ChatThread, projectId: string | null) => void;
  onDeleteThread: (thread: ChatThread) => void;
  /** Closes the drawer on a phone. */
  onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const activeThread = view.kind === 'thread' ? view.threadId : null;
  const activeProject = view.kind === 'project' || view.kind === 'new' ? view.projectId : threads.find((thread) => thread.id === activeThread)?.projectId ?? null;

  const searching = query.trim().toLowerCase();
  // Chats outside a project by date; a search looks through every chat.
  const loose = useMemo(() => {
    const now = new Date();
    const groups: Array<{ title: string; threads: ChatThread[] }> = [];
    const shown = threads.filter((item) => (searching ? item.title.toLowerCase().includes(searching) : !item.projectId));
    for (const thread of shown) {
      const title = groupOf(thread.updatedAt, now);
      const group = groups.at(-1);
      if (group?.title === title) group.threads.push(thread);
      else groups.push({ title, threads: [thread] });
    }
    return groups;
  }, [threads, searching]);

  const row = (thread: ChatThread, indent = false) => (
    <ThreadRow
      key={thread.id}
      thread={thread}
      indent={indent}
      active={thread.id === activeThread}
      projects={projects}
      onOpen={() => onOpenThread(thread)}
      onRename={() => onRenameThread(thread)}
      onMove={(projectId) => onMoveThread(thread, projectId)}
      onDelete={() => onDeleteThread(thread)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/[0.06]" title="Visicraft home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gogrowth-mark.png" alt="GoGrowth" className="h-7 w-7" />
          <span className="text-sm font-semibold text-white">Chat</span>
        </Link>
        {onClose && <button type="button" onClick={onClose} aria-label="Close the menu" className="ml-auto rounded-lg !p-1.5 text-white/55 hover:bg-white/[0.06] lg:hidden"><X className="h-4 w-4" /></button>}
      </div>
      <div className="space-y-1 px-2">
        <button type="button" onClick={onNew} className="flex w-full items-center gap-2 rounded-xl !px-2.5 !py-2 text-left text-sm text-white hover:bg-white/[0.06]"><SquarePen className="h-4 w-4" /> New chat</button>
        <label className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-white/50 focus-within:bg-white/[0.05]">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" className="h-6 min-w-0 flex-1 bg-transparent text-sm text-white !outline-none placeholder:text-white/40" />
        </label>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        {!searching && (
          <section className="mb-3">
            <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
              <p className="text-[11px] font-medium text-white/40">Projects</p>
              <button type="button" onClick={() => setAdding(true)} aria-label="New project" title="New project" className="rounded-md !p-1 text-white/45 hover:bg-white/[0.06] hover:text-white"><FolderPlus className="h-3.5 w-3.5" /></button>
            </div>
            {adding && (
              <form
                className="flex items-center gap-1 px-1 pb-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) onCreateProject(name.trim());
                  setName('');
                  setAdding(false);
                }}
              >
                <input autoFocus value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} onBlur={() => !name.trim() && setAdding(false)} placeholder="Project name (e.g. a client)" className="h-8 min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2 text-sm text-white !outline-none focus:border-white/25" />
                <button type="submit" className="h-8 rounded-lg bg-[#fff05a] !px-2.5 !py-0 text-xs font-semibold text-[#1f1c00]">Add</button>
              </form>
            )}
            {projects.map((project) => {
              const expanded = open.has(project.id) || project.id === activeProject;
              const inside = threads.filter((thread) => thread.projectId === project.id);
              return (
                <div key={project.id}>
                  <div className={cx('flex items-center rounded-xl', view.kind === 'project' && view.projectId === project.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]')}>
                    <button
                      type="button"
                      onClick={() => setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(project.id)) next.delete(project.id);
                        else next.add(project.id);
                        return next;
                      })}
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                      className="rounded-lg !p-1.5 text-white/40 hover:text-white"
                    >
                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => onOpenProject(project)} className="flex min-w-0 flex-1 items-center gap-2 !py-2 !pl-0.5 !pr-2.5 text-left text-[13px] text-white/85">
                      <Folder className="h-4 w-4 shrink-0 text-[#fff05a]/80" /> <span className="truncate">{project.name}</span>
                      <span className="ml-auto text-[11px] tabular-nums text-white/30">{inside.length || ''}</span>
                    </button>
                  </div>
                  {expanded && inside.map((thread) => row(thread, true))}
                </div>
              );
            })}
            {!projects.length && !adding && <p className="px-2.5 text-[12px] leading-snug text-white/35">Group chats by client or campaign, with instructions every chat follows.</p>}
          </section>
        )}

        {loose.map((group) => (
          <section key={group.title} className="mb-2">
            <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-white/40">{group.title}</p>
            {group.threads.map((thread) => row(thread))}
          </section>
        ))}
        {!loose.length && (
          <p className="flex items-center gap-2 px-2.5 py-3 text-[12px] text-white/35"><MessageSquare className="h-3.5 w-3.5" /> {searching ? 'No chat matches.' : 'Your chats show up here.'}</p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
        <Link href="/playground" className="inline-flex items-center gap-1.5 rounded-lg !px-2 !py-1.5 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white"><Home className="h-3.5 w-3.5" /> Visicraft</Link>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/75">
          <span className="text-[#fff05a]">✦</span> {credits === null ? '…' : credits.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  );
}
