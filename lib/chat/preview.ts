import { planSize, sizeFromText } from './sizes';
import type { ChatMessage, ChatProject, ChatSendRequest, ChatSidebar, ChatStreamEvent, ChatThread, ChatThreadPage } from './types';

/**
 * Dev-only Chat with sample data (/chat?previewChat=1): projects, chats and replies that
 * stream like the real thing, with no API calls and nothing charged. Changes live in memory.
 */
export function isChatPreview(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewChat');
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const SAMPLES = ['/presets/floating.jpg', '/presets/push-in.jpg', '/presets/fabric-flow.jpg', '/presets/hand-reveal.jpg', '/presets/model-walk.jpg'];

const state = (() => {
  const projects: ChatProject[] = [
    { id: 'p-brew', name: 'Brew Sage', instructions: 'Brand colours: sage green and cream. Calm, premium, Ayurvedic. Never show caffeine claims.', createdAt: ago(9 * DAY), updatedAt: ago(2 * HOUR) },
    { id: 'p-thriller', name: 'Thriller', instructions: '', createdAt: ago(20 * DAY), updatedAt: ago(3 * DAY) },
  ];
  const threads: ChatThread[] = [
    { id: 't-1', projectId: 'p-brew', title: 'Diwali poster for Night Unwind tea', createdAt: ago(3 * HOUR), updatedAt: ago(2 * HOUR) },
    { id: 't-2', projectId: null, title: 'Serum bottle floating on peach', createdAt: ago(5 * HOUR), updatedAt: ago(5 * HOUR) },
    { id: 't-3', projectId: 'p-thriller', title: 'Grip sock banner 1200x628', createdAt: ago(1.2 * DAY), updatedAt: ago(1.2 * DAY) },
    { id: 't-4', projectId: null, title: 'Saree fabric close-up story', createdAt: ago(4 * DAY), updatedAt: ago(4 * DAY) },
    { id: 't-5', projectId: null, title: 'Unboxing flat lay for launch', createdAt: ago(12 * DAY), updatedAt: ago(12 * DAY) },
  ];
  const image = (url: string, width: number, height: number) => ({ url, previewUrl: url, width, height, model: 'gpt-image-2.5-flare', quality: 'high' as const, revisedPrompt: 'A premium amber glass serum bottle floating above a soft peach studio floor with a gentle shadow, soft diffused light, minimal composition.' });
  const messages: Record<string, ChatMessage[]> = {
    't-2': [
      { id: 'm-1', threadId: 't-2', role: 'user', text: 'An amber serum bottle floating on a soft peach background, 1080x1350', attachments: [], images: [], status: 'done', error: null, credits: 0, createdAt: ago(5 * HOUR) },
      { id: 'm-2', threadId: 't-2', role: 'assistant', text: 'Here’s your floating serum shot at 1080 × 1350. Want a version with a soft splash of water around it?', attachments: [], images: [image(SAMPLES[0], 1080, 1350)], status: 'done', error: null, credits: 20, createdAt: ago(5 * HOUR) },
    ],
    't-1': [
      { id: 'm-3', threadId: 't-1', role: 'user', text: 'Diwali poster for Night Unwind tea: diyas, marigolds, warm light. 9:16 story', attachments: [], images: [], status: 'done', error: null, credits: 0, createdAt: ago(3 * HOUR) },
      { id: 'm-4', threadId: 't-1', role: 'assistant', text: 'A warm Diwali story with the tea in sage and cream, diyas and marigolds around it.', attachments: [], images: [image(SAMPLES[1], 1080, 1920)], status: 'done', error: null, credits: 35, createdAt: ago(3 * HOUR) },
      { id: 'm-5', threadId: 't-1', role: 'user', text: 'make the background deep maroon', attachments: [], images: [], status: 'done', error: null, credits: 0, createdAt: ago(2 * HOUR) },
      { id: 'm-6', threadId: 't-1', role: 'assistant', text: 'Done: same poster, now on deep maroon.', attachments: [], images: [image(SAMPLES[3], 1080, 1920)], status: 'done', error: null, credits: 35, createdAt: ago(2 * HOUR) },
    ],
  };
  return { projects, threads, messages };
})();

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Stopped', 'AbortError'));
  }, { once: true });
});

export const previewChat = {
  sidebar: async (): Promise<ChatSidebar> => {
    await wait(250);
    return { projects: [...state.projects], threads: [...state.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  },
  thread: async (threadId: string): Promise<ChatThreadPage> => {
    await wait(200);
    const thread = state.threads.find((known) => known.id === threadId);
    if (!thread) throw new Error('This chat was not found.');
    return { thread, messages: [...(state.messages[threadId] ?? [])] };
  },
  updateThread: async (threadId: string, patch: { title?: string; projectId?: string | null }) => {
    const thread = state.threads.find((known) => known.id === threadId)!;
    if (patch.title !== undefined) thread.title = patch.title;
    if (patch.projectId !== undefined) thread.projectId = patch.projectId;
    return { thread: { ...thread } };
  },
  deleteThread: async (threadId: string) => {
    state.threads = state.threads.filter((known) => known.id !== threadId);
    return { deleted: true };
  },
  createProject: async (name: string) => {
    const project: ChatProject = { id: `p-${Date.now()}`, name, instructions: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.projects.unshift(project);
    return { project };
  },
  updateProject: async (projectId: string, patch: { name?: string; instructions?: string }) => {
    const project = state.projects.find((known) => known.id === projectId)!;
    Object.assign(project, patch, { updatedAt: new Date().toISOString() });
    return { project: { ...project } };
  },
  deleteProject: async (projectId: string) => {
    state.projects = state.projects.filter((known) => known.id !== projectId);
    state.threads = state.threads.filter((known) => known.projectId !== projectId);
    return { deleted: true };
  },
  /** A reply that streams like the real one: text, "creating", two previews, the image. */
  send: async (request: ChatSendRequest, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal) => {
    const now = () => new Date().toISOString();
    let threadId = request.threadId ?? null;
    if (!threadId) {
      const thread: ChatThread = { id: `t-${Date.now()}`, projectId: request.projectId ?? null, title: request.text.split(/\s+/).slice(0, 7).join(' ') || 'Image chat', createdAt: now(), updatedAt: now() };
      state.threads.unshift(thread);
      state.messages[thread.id] = [];
      threadId = thread.id;
      onEvent({ type: 'thread', thread });
    }
    const user: ChatMessage = { id: `m-${Date.now()}`, threadId, role: 'user', text: request.text, attachments: request.attachments, images: [], status: 'done', error: null, credits: 0, createdAt: now() };
    const plan = planSize(sizeFromText(request.text) ?? request.size);
    const assistant: ChatMessage = { id: `m-${Date.now() + 1}`, threadId, role: 'assistant', text: '', attachments: [], images: [], status: 'generating', error: null, credits: 0, createdAt: now() };
    (state.messages[threadId] ??= []).push(user);
    onEvent({ type: 'user', message: user });
    onEvent({ type: 'assistant', message: assistant, credits: plan.tier === '2K' ? 35 : 20, size: plan.label });
    try {
      const question = /\?\s*$/.test(request.text) && !/\b(make|create|draw|generate|design|poster|image|photo|banner)\b/i.test(request.text);
      const reply = question
        ? 'Warm golds, deep maroon and marigold orange read as festive in India; pair them with your brand colour so the post still looks like you.'
        : `Here’s your image${plan.width ? ` at ${plan.label}` : ''}. Want another take or a change?`;
      await wait(500, signal);
      for (const word of reply.split(' ')) {
        await wait(45, signal);
        onEvent({ type: 'text', delta: `${word} ` });
      }
      const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
      let images: ChatMessage['images'] = [];
      if (!question) {
        onEvent({ type: 'creating' });
        await wait(1400, signal);
        onEvent({ type: 'partial', image: sample, index: 0 });
        await wait(1400, signal);
        onEvent({ type: 'partial', image: sample, index: 1 });
        await wait(1200, signal);
        images = [{ url: sample, previewUrl: sample, width: plan.width ?? 1024, height: plan.height ?? 1024, model: request.attachments.length ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare', quality: request.quality, revisedPrompt: `${request.text} — premium, well lit, Indian D2C ad style.` }];
        onEvent({ type: 'image', image: images[0] });
      }
      const done: ChatMessage = { ...assistant, text: reply, images, status: 'done', credits: images.length ? (plan.tier === '2K' ? 35 : 20) : 0 };
      state.messages[threadId].push(done);
      const thread = state.threads.find((known) => known.id === threadId);
      if (thread) thread.updatedAt = now();
      onEvent({ type: 'done', message: done });
    } catch {
      onEvent({ type: 'error', message: 'Stopped. Nothing was charged.', code: 'stopped' });
    }
  },
};
