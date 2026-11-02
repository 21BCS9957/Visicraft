'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Folder, Loader2, Menu, Pencil, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { ChatApiError, chatApi } from '@/lib/chat/client';
import { isChatPreview } from '@/lib/chat/preview';
import { readSizeChoice, sizeFromText, type SizeChoice } from '@/lib/chat/sizes';
import type { ChatAttachment, ChatImage, ChatMessage, ChatProject, ChatSidebar as SidebarData, ChatStreamEvent, ChatThread } from '@/lib/chat/types';
import { DEFAULT_QUALITY, type ImageQuality } from '@/lib/playground/models';
import { cx, timeAgo } from '@/components/playground/ui';
import { ChatComposer } from './ChatComposer';
import { ChatMessages, type LiveReply } from './ChatMessages';
import { ChatSidebar, type ChatView } from './ChatSidebar';

const TOAST = { position: 'top-center' as const };
const SETTINGS_KEY = 'visicraft:chatSettings';
const noSubscribe = () => () => {};

const IDEAS = [
  'A Diwali sale poster for a skincare brand, warm diyas and marigolds, 1080x1350',
  'A flat lay of a saree with gold zari on a wooden table, soft daylight, square',
  'A 9:16 story: cold-pressed juice bottle with fresh fruit splashing, bright summer colours',
  'A website banner 1920x600 for a tea brand, misty Darjeeling hills at sunrise',
];

function pathOf(view: ChatView): string {
  if (view.kind === 'thread') return `/chat/${view.threadId}`;
  if (view.kind === 'project') return `/chat/p/${view.projectId}`;
  return view.projectId ? `/chat/p/${view.projectId}` : '/chat';
}

function viewOfPath(pathname: string): ChatView {
  const project = /^\/chat\/p\/([^/]+)/.exec(pathname);
  if (project) return { kind: 'project', projectId: project[1] };
  const thread = /^\/chat\/([^/]+)/.exec(pathname);
  return thread ? { kind: 'thread', threadId: thread[1] } : { kind: 'new', projectId: null };
}

/** The object without one key. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function readSettings(): { size: SizeChoice; quality: ImageQuality } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as { size?: SizeChoice; quality?: ImageQuality };
    return { size: saved.size ?? { kind: 'auto' }, quality: saved.quality ?? DEFAULT_QUALITY };
  } catch {
    return { size: { kind: 'auto' }, quality: DEFAULT_QUALITY };
  }
}

/**
 * Chat (/chat): ChatGPT-style image chats. A sidebar of projects and chats; a thread of
 * messages where replies stream in with their images; a composer with images, size and
 * quality. Moving between chats keeps every running reply going (the page never reloads).
 */
export function ChatApp({ initialThreadId, initialProjectId }: { initialThreadId?: string; initialProjectId?: string }) {
  const preview = useSyncExternalStore(noSubscribe, isChatPreview, () => false);
  const { user, loading: authLoading } = useAuth();
  const { credits, loading: creditsLoading, refreshCredits } = useCredits();
  const balance = preview ? 9999 : creditsLoading ? null : credits;
  const signedOut = !preview && !authLoading && !user;

  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [view, setView] = useState<ChatView>(() => (initialThreadId ? { kind: 'thread', threadId: initialThreadId } : initialProjectId ? { kind: 'project', projectId: initialProjectId } : { kind: 'new', projectId: null }));
  const [pages, setPages] = useState<Record<string, ChatMessage[]>>({});
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState<Record<string, LiveReply>>({});
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const controllers = useRef(new Map<string, AbortController>());
  /** The size each chat was last made at, so a follow-up keeps the shape. */
  const threadSizes = useRef(new Map<string, SizeChoice>());
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [size, setSize] = useState<SizeChoice>({ kind: 'auto' });
  const [quality, setQuality] = useState<ImageQuality>(DEFAULT_QUALITY);
  const [focusKey, setFocusKey] = useState('start');
  const [editing, setEditing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSettings();
      setSize(saved.size);
      setQuality(saved.quality);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const remember = (next: { size?: SizeChoice; quality?: ImageQuality }) => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ size: next.size ?? size, quality: next.quality ?? quality }));
    } catch {
      // Private mode: the settings last for this visit.
    }
  };

  /* ------------------------------------------------------------- navigation */

  // A chat brings back the size it was made at; a new chat starts from the saved choice.
  const followSize = useCallback((next: ChatView) => {
    if (next.kind === 'new') setSize(readSettings().size);
    const known = next.kind === 'thread' ? threadSizes.current.get(next.threadId) : undefined;
    if (known) setSize(known);
  }, []);

  const go = useCallback((next: ChatView, replace = false) => {
    // Known at once, before the next render: a streaming reply may ask where the reader is right away.
    viewRef.current = next;
    setView(next);
    followSize(next);
    setDrawer(false);
    const url = `${pathOf(next)}${preview ? '?previewChat=1' : ''}`;
    if (replace) window.history.replaceState(null, '', url);
    else if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState(null, '', url);
  }, [preview, followSize]);

  useEffect(() => {
    const onPop = () => {
      const next = viewOfPath(window.location.pathname);
      setView(next);
      followSize(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [followSize]);

  /* ------------------------------------------------------------------ data */

  useEffect(() => {
    if (!preview && (authLoading || !user)) return;
    let active = true;
    chatApi.sidebar()
      .then((data) => active && setSidebar(data))
      .catch((error) => active && toast.error(error instanceof Error ? error.message : 'Could not load your chats', TOAST));
    return () => {
      active = false;
    };
  }, [preview, authLoading, user]);

  const threadId = view.kind === 'thread' ? view.threadId : null;
  useEffect(() => {
    if (!threadId || threadId.startsWith('tmp-') || pages[threadId] || missing.has(threadId) || (!preview && !user)) return;
    let active = true;
    chatApi.thread(threadId)
      .then((page) => {
        if (!active) return;
        setPages((current) => ({ ...current, [threadId]: page.messages }));
        const saved = readSizeChoice(page.settings?.size);
        if (saved && !threadSizes.current.has(threadId)) {
          threadSizes.current.set(threadId, saved);
          if (viewRef.current.kind === 'thread' && viewRef.current.threadId === threadId) setSize(saved);
        }
      })
      .catch(() => active && setMissing((current) => new Set(current).add(threadId)));
    return () => {
      active = false;
    };
  }, [threadId, pages, missing, preview, user]);

  const messages = threadId ? pages[threadId] ?? null : null;

  // A reply still being made when the chat was opened (the page was reloaded mid-reply): the
  // server finishes and saves it, so the chat is read again every few seconds until it has.
  const waitingOn = threadId && !busy.has(threadId) && messages?.some((message) => message.status === 'generating') ? threadId : null;
  useEffect(() => {
    if (!waitingOn) return;
    const timer = window.setTimeout(() => {
      chatApi.thread(waitingOn).then((page) => setPages((current) => ({ ...current, [waitingOn]: page.messages }))).catch(() => undefined);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [waitingOn, messages]);
  const liveReply = threadId ? live[threadId] ?? null : null;

  // Follows the newest message while the reader is at the bottom (scrolling up stops it).
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages, liveReply]);

  const threads = sidebar?.threads ?? [];
  const projects = sidebar?.projects ?? [];
  const currentThread = threads.find((thread) => thread.id === threadId) ?? null;
  const currentProject = projects.find((project) => project.id === (view.kind === 'thread' ? currentThread?.projectId : view.projectId)) ?? null;

  const patchSidebar = (update: (data: SidebarData) => SidebarData) => setSidebar((current) => (current ? update(current) : current));
  const touchThread = (thread: ChatThread) => patchSidebar((data) => ({ ...data, threads: [thread, ...data.threads.filter((known) => known.id !== thread.id)] }));

  /* ------------------------------------------------------------------ send */

  const send = async (override?: { text: string; attachments: ChatAttachment[] }) => {
    const body = (override?.text ?? text).trim();
    const files = override?.attachments ?? attachments;
    const key = threadId ?? 'new';
    if ((!body && !files.length) || controllers.current.has(key) || sidebar?.setup) return;
    const projectId = view.kind === 'thread' ? currentThread?.projectId ?? null : view.projectId;
    const now = new Date().toISOString();
    let tid = threadId ?? `tmp-${Date.now()}`;
    // A size typed in the message becomes the chat's size, so "make it blue" keeps the shape.
    const chosen = sizeFromText(body) ?? size;
    threadSizes.current.set(tid, chosen);
    if (chosen !== size) setSize(chosen);
    const tempUser: ChatMessage = { id: `tmp-u-${Date.now()}`, threadId: tid, role: 'user', text: body, attachments: files, images: [], status: 'done', error: null, credits: 0, createdAt: now };
    let assistantId = `tmp-a-${Date.now()}`;
    const tempAssistant: ChatMessage = { ...tempUser, id: assistantId, role: 'assistant', text: '', attachments: [], status: 'generating' };
    // The key is fixed here: the update may run after `tid` already names the real chat.
    const startKey = tid;
    setPages((current) => ({ ...current, [startKey]: [...(current[startKey] ?? []), tempUser, tempAssistant] }));
    if (!threadId) go({ kind: 'thread', threadId: tid });
    stick.current = true;
    if (!override) {
      setText('');
      setAttachments([]);
      setEditing(false);
    }
    const controller = new AbortController();
    controllers.current.set(tid, controller);
    setBusy((current) => new Set(current).add(tid));

    const patchAssistant = (patch: (message: ChatMessage) => ChatMessage) => setPages((current) => ({
      ...current,
      [tid]: (current[tid] ?? []).map((message) => (message.id === assistantId ? patch(message) : message)),
    }));
    const onEvent = (event: ChatStreamEvent) => {
      switch (event.type) {
        case 'thread': {
          const from = tid;
          tid = event.thread.id;
          threadSizes.current.set(tid, chosen);
          controllers.current.delete(from);
          controllers.current.set(tid, controller);
          setPages((current) => ({ ...without(current, from), [tid]: (current[from] ?? []).map((message) => ({ ...message, threadId: tid })) }));
          setBusy((current) => {
            const next = new Set(current);
            next.delete(from);
            next.add(tid);
            return next;
          });
          // Still looking at the new chat: it takes its real address (outside a state update, which Next forbids).
          if (viewRef.current.kind === 'thread' && viewRef.current.threadId === from) go({ kind: 'thread', threadId: tid }, true);
          touchThread(event.thread);
          break;
        }
        case 'user':
          setPages((current) => ({ ...current, [tid]: (current[tid] ?? []).map((message) => (message.id === tempUser.id ? event.message : message)) }));
          break;
        case 'assistant': {
          const from = assistantId;
          assistantId = event.message.id;
          setPages((current) => ({ ...current, [tid]: (current[tid] ?? []).map((message) => (message.id === from ? { ...event.message, status: 'generating' } : message)) }));
          setLive((current) => ({ ...current, [tid]: { creating: false, partial: null, partialIndex: 0, size: event.size, credits: event.credits } }));
          break;
        }
        case 'text':
          patchAssistant((message) => ({ ...message, text: message.text + event.delta }));
          break;
        case 'creating':
          setLive((current) => (current[tid] ? { ...current, [tid]: { ...current[tid], creating: true } } : current));
          break;
        case 'partial':
          setLive((current) => (current[tid] ? { ...current, [tid]: { ...current[tid], creating: true, partial: event.image, partialIndex: event.index } } : current));
          break;
        case 'image':
          patchAssistant((message) => ({ ...message, images: [...message.images, event.image] }));
          break;
        case 'done':
          patchAssistant(() => event.message);
          setLive((current) => without(current, tid));
          patchSidebar((data) => {
            const thread = data.threads.find((known) => known.id === tid);
            return thread ? { ...data, threads: [{ ...thread, updatedAt: new Date().toISOString() }, ...data.threads.filter((known) => known.id !== tid)] } : data;
          });
          break;
        case 'error':
          patchAssistant((message) => ({ ...message, status: event.code === 'stopped' ? 'stopped' : 'failed', error: event.code === 'stopped' ? null : event.message.replace(/\s*Nothing was charged\.?$/, '') }));
          setLive((current) => without(current, tid));
          if (event.code !== 'stopped') toast.error(event.message, { ...TOAST, duration: 7000 });
          break;
      }
    };

    try {
      await chatApi.send({ threadId: threadId ?? null, projectId, text: body, attachments: files, size, quality }, onEvent, controller.signal);
    } catch (error) {
      const stopped = error instanceof ChatApiError && error.code === 'stopped';
      const message = error instanceof Error ? error.message : 'The message could not be sent.';
      // Nothing started on the server (credits, setup, sign-in): take the message back into the box.
      setPages((current) => {
        const list = (current[tid] ?? []).filter((item) => item.id !== tempUser.id && item.id !== assistantId);
        return { ...current, [tid]: list };
      });
      if (!stopped) {
        if (!override) {
          setText(body);
          setAttachments(files);
        }
        toast.error(message, { ...TOAST, duration: 8000 });
      }
      setLive((current) => without(current, tid));
      if (!threadId && tid.startsWith('tmp-')) go({ kind: 'new', projectId }, true);
    } finally {
      controllers.current.delete(tid);
      setBusy((current) => {
        const next = new Set(current);
        next.delete(tid);
        return next;
      });
      if (!preview) void refreshCredits();
    }
  };

  const stop = () => {
    const key = threadId ?? 'new';
    controllers.current.get(key)?.abort();
  };

  const editImage = (image: ChatImage) => {
    setAttachments((current) => (current.some((item) => item.url === image.url) ? current : [{ url: image.url, name: 'Image to edit', width: image.width, height: image.height }, ...current].slice(0, 6)));
    setEditing(true);
    setFocusKey(`edit-${image.url}-${Date.now()}`);
  };

  /* --------------------------------------------------------- chats, projects */

  const renameThread = async (thread: ChatThread) => {
    const title = window.prompt('Chat name', thread.title)?.trim();
    if (!title || title === thread.title) return;
    patchSidebar((data) => ({ ...data, threads: data.threads.map((known) => (known.id === thread.id ? { ...known, title } : known)) }));
    await chatApi.renameThread(thread.id, title).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not rename the chat', TOAST));
  };
  const moveThread = async (thread: ChatThread, projectId: string | null) => {
    patchSidebar((data) => ({ ...data, threads: data.threads.map((known) => (known.id === thread.id ? { ...known, projectId } : known)) }));
    await chatApi.moveThread(thread.id, projectId)
      .then(() => toast.success(projectId ? `Moved to ${projects.find((project) => project.id === projectId)?.name ?? 'the project'}` : 'Moved out of the project', TOAST))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not move the chat', TOAST));
  };
  const deleteThread = async (thread: ChatThread) => {
    if (!window.confirm(`Delete “${thread.title}”? Its messages go; images you saved to the Library stay.`)) return;
    try {
      await chatApi.deleteThread(thread.id);
      patchSidebar((data) => ({ ...data, threads: data.threads.filter((known) => known.id !== thread.id) }));
      if (threadId === thread.id) go({ kind: 'new', projectId: thread.projectId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the chat', TOAST);
    }
  };
  const createProject = async (name: string) => {
    try {
      const { project } = await chatApi.createProject(name);
      patchSidebar((data) => ({ ...data, projects: [project, ...data.projects] }));
      go({ kind: 'project', projectId: project.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the project', TOAST);
    }
  };

  /* ------------------------------------------------------------------ view */

  const sending = busy.has(threadId ?? 'new') || (threadId ? busy.has(threadId) : false);
  const blocked = signedOut ? 'Sign in to start chatting.' : sidebar?.setup ?? null;
  const composer = (placeholder: string) => (
    <ChatComposer
      text={text}
      onText={setText}
      attachments={attachments}
      onAttachments={(next) => {
        setAttachments(next);
        if (!next.length) setEditing(false);
      }}
      size={size}
      onSize={(next) => {
        setSize(next);
        remember({ size: next });
        if (threadId) threadSizes.current.set(threadId, next);
      }}
      quality={quality}
      onQuality={(next) => {
        setQuality(next);
        remember({ quality: next });
      }}
      sending={sending}
      blocked={blocked}
      preview={preview}
      placeholder={editing ? 'Describe the change to this image…' : placeholder}
      focusKey={`${pathOf(view)}:${focusKey}`}
      onSend={() => void send()}
      onStop={stop}
    />
  );

  const title = view.kind === 'thread' ? currentThread?.title ?? (threadId?.startsWith('tmp-') ? 'New chat' : 'Chat') : view.kind === 'project' ? currentProject?.name ?? 'Project' : 'New chat';

  return (
    <div className="flex h-dvh bg-[#0d0d10] text-white">
      <aside className="hidden w-[272px] shrink-0 border-r border-white/[0.06] bg-[#09090b] lg:block">
        <ChatSidebar
          projects={projects}
          threads={threads}
          view={view}
          credits={balance}
          onNew={() => go({ kind: 'new', projectId: null })}
          onOpenThread={(thread) => go({ kind: 'thread', threadId: thread.id })}
          onOpenProject={(project) => go({ kind: 'project', projectId: project.id })}
          onCreateProject={(name) => void createProject(name)}
          onRenameThread={(thread) => void renameThread(thread)}
          onMoveThread={(thread, projectId) => void moveThread(thread, projectId)}
          onDeleteThread={(thread) => void deleteThread(thread)}
        />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Chats">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] max-w-[85vw] border-r border-white/[0.06] bg-[#09090b]">
            <ChatSidebar
              projects={projects}
              threads={threads}
              view={view}
              credits={balance}
              onClose={() => setDrawer(false)}
              onNew={() => go({ kind: 'new', projectId: null })}
              onOpenThread={(thread) => go({ kind: 'thread', threadId: thread.id })}
              onOpenProject={(project) => go({ kind: 'project', projectId: project.id })}
              onCreateProject={(name) => void createProject(name)}
              onRenameThread={(thread) => void renameThread(thread)}
              onMoveThread={(thread, projectId) => void moveThread(thread, projectId)}
              onDeleteThread={(thread) => void deleteThread(thread)}
            />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 sm:px-4">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open chats" className="rounded-lg !p-1.5 text-white/70 hover:bg-white/[0.06] lg:hidden"><Menu className="h-5 w-5" /></button>
          {currentProject && view.kind !== 'project' && (
            <button type="button" onClick={() => go({ kind: 'project', projectId: currentProject.id })} className="inline-flex min-w-0 items-center gap-1 rounded-full !px-2 !py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white">
              <Folder className="h-3.5 w-3.5 text-[#fff05a]/80" /> <span className="truncate">{currentProject.name}</span> <span className="text-white/25">/</span>
            </button>
          )}
          <p className="min-w-0 truncate text-sm font-medium text-white/90">{title}</p>
          {preview && <span className="ml-auto rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">Preview · sample data</span>}
        </header>

        {sidebar?.setup && <p className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-[#fff05a]/25 bg-[#fff05a]/[0.05] p-3 text-sm text-[#fbf2a0]">{sidebar.setup}</p>}

        {view.kind === 'thread' ? (
          <>
            <div
              ref={scroller}
              onScroll={(event) => {
                const node = event.currentTarget;
                stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
              }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {missing.has(view.threadId) ? (
                <div className="mx-auto max-w-md px-6 py-20 text-center">
                  <p className="text-lg text-white">This chat wasn’t found</p>
                  <p className="mt-2 text-sm text-white/50">It may have been deleted.</p>
                  <button type="button" onClick={() => go({ kind: 'new', projectId: null })} className="mt-5 rounded-full border border-white/15 !px-4 !py-2 text-sm text-white hover:bg-white/[0.06]">Start a new chat</button>
                </div>
              ) : messages === null ? (
                <div className="flex justify-center py-20 text-white/45"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <ChatMessages
                  messages={messages}
                  live={liveReply}
                  preview={preview}
                  onEdit={editImage}
                  onRetry={(message) => void send({ text: message.text, attachments: message.attachments })}
                />
              )}
            </div>
            {composer('Ask for an image, or a change to the last one…')}
          </>
        ) : view.kind === 'project' ? (
          <ProjectPage
            project={currentProject}
            threads={threads.filter((thread) => thread.projectId === view.projectId)}
            loading={sidebar === null}
            onOpen={(thread) => go({ kind: 'thread', threadId: thread.id })}
            onSaved={(project) => patchSidebar((data) => ({ ...data, projects: data.projects.map((known) => (known.id === project.id ? project : known)) }))}
            onDeleted={(project) => {
              patchSidebar((data) => ({ ...data, projects: data.projects.filter((known) => known.id !== project.id), threads: data.threads.filter((known) => known.projectId !== project.id) }));
              go({ kind: 'new', projectId: null });
            }}
          >
            {composer(currentProject ? `New chat in ${currentProject.name}…` : 'New chat…')}
          </ProjectPage>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-2 pt-10 sm:px-6">
              <h1 className="text-center text-[28px] font-semibold tracking-tight sm:text-[34px]">What should we create?</h1>
              <p className="mt-2 text-center text-sm text-white/45">Describe an image in your words, any size. Then ask for changes, like in ChatGPT.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" onClick={() => { setText(idea); setFocusKey(`idea-${Date.now()}`); }} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] !px-3.5 !py-3 text-left text-[13px] leading-snug text-white/70 transition-colors hover:border-white/15 hover:text-white">
                    {idea}
                  </button>
                ))}
              </div>
            </div>
            <div className="pb-2">{composer('Describe the image you want…')}</div>
            {signedOut && (
              <p className="pb-6 text-center text-sm text-white/50"><Link href="/login?redirectTo=/chat" className="text-[#fff05a] underline underline-offset-2">Sign in</Link> to start chatting.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectPage({ project, threads, loading, onOpen, onSaved, onDeleted, children }: {
  project: ChatProject | null;
  threads: ChatThread[];
  loading: boolean;
  onOpen: (thread: ChatThread) => void;
  onSaved: (project: ChatProject) => void;
  onDeleted: (project: ChatProject) => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (loading) return <div className="flex flex-1 justify-center py-20 text-white/45"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!project) return <div className="mx-auto max-w-md px-6 py-20 text-center text-white/60">This project wasn’t found.</div>;
  const instructions = draft ?? project.instructions;
  const save = async () => {
    setSaving(true);
    try {
      const { project: saved } = await chatApi.updateProject(project.id, { instructions });
      onSaved(saved);
      setDraft(null);
      toast.success('Instructions saved: every chat in this project follows them', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the instructions', TOAST);
    } finally {
      setSaving(false);
    }
  };
  const rename = async () => {
    const name = window.prompt('Project name', project.name)?.trim();
    if (!name || name === project.name) return;
    try {
      onSaved((await chatApi.updateProject(project.id, { name })).project);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename the project', TOAST);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${project.name}” and its ${threads.length} chat${threads.length === 1 ? '' : 's'}? Images saved to the Library stay.`)) return;
    try {
      await chatApi.deleteProject(project.id);
      onDeleted(project);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the project', TOAST);
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff05a]/10 text-[#fff05a]"><Folder className="h-5 w-5" /></span>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          <button type="button" onClick={() => void rename()} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 !px-3 !py-1.5 text-xs text-white/75 hover:bg-white/[0.06]"><Pencil className="h-3.5 w-3.5" /> Rename</button>
          <button type="button" onClick={() => void remove()} aria-label="Delete project" className="rounded-full border border-white/12 !p-2 text-white/55 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <section className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-white">Instructions</p>
          <p className="mt-0.5 text-xs text-white/45">Sent with every chat in this project: the brand, colours, tone, what to avoid.</p>
          <textarea
            value={instructions}
            onChange={(event) => setDraft(event.target.value.slice(0, 8000))}
            rows={4}
            placeholder="e.g. Brand: Brew Sage. Colours sage green and cream. Calm, premium, Ayurvedic. Never show caffeine claims."
            className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-relaxed text-white !outline-none placeholder:text-white/30 focus:border-white/25"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {draft !== null && draft !== project.instructions && <button type="button" onClick={() => setDraft(null)} className="rounded-full !px-3 !py-1.5 text-xs text-white/55 hover:text-white">Cancel</button>}
            <button type="button" onClick={() => void save()} disabled={saving || draft === null || draft === project.instructions} className="inline-flex items-center gap-1.5 rounded-full bg-[#fff05a] !px-4 !py-1.5 text-xs font-semibold text-[#1f1c00] disabled:opacity-40">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
        </section>
      </div>
      <div className="mt-6">{children}</div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6">
        <p className="px-1 pb-2 text-xs font-medium text-white/40">{threads.length ? `Chats in ${project.name}` : 'No chats here yet: start one above.'}</p>
        <div className={cx('divide-y divide-white/[0.05] overflow-hidden rounded-2xl', threads.length > 0 && 'border border-white/[0.06]')}>
          {threads.map((thread) => (
            <button key={thread.id} type="button" onClick={() => onOpen(thread)} className={cx('flex w-full items-center gap-3 !px-4 !py-3 text-left transition-colors hover:bg-white/[0.04]')}>
              <span className="min-w-0 flex-1 truncate text-sm text-white/85">{thread.title}</span>
              <span className="shrink-0 text-[11px] text-white/35">{timeAgo(thread.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
