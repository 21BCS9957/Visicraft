'use client';

import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import { readNdjson } from '@/lib/ndjson';
import { isChatPreview, previewChat } from './preview';
import type { ChatProject, ChatSendRequest, ChatSidebar, ChatStreamEvent, ChatThread, ChatThreadPage } from './types';

/** Chat's calls to the server (every route checks the signed-in account), and the reply stream. */

export class ChatApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ChatApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`, typeof body.code === 'string' ? body.code : undefined);
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export const chatApi = {
  sidebar: () => (isChatPreview() ? previewChat.sidebar() : call<ChatSidebar>('/api/chat/sidebar')),
  thread: (threadId: string) => (isChatPreview() ? previewChat.thread(threadId) : call<ChatThreadPage>(`/api/chat/threads/${threadId}`)),
  renameThread: (threadId: string, title: string) => (isChatPreview() ? previewChat.updateThread(threadId, { title }) : call<{ thread: ChatThread }>(`/api/chat/threads/${threadId}`, { method: 'PATCH', body: json({ title }) })),
  moveThread: (threadId: string, projectId: string | null) => (isChatPreview() ? previewChat.updateThread(threadId, { projectId }) : call<{ thread: ChatThread }>(`/api/chat/threads/${threadId}`, { method: 'PATCH', body: json({ projectId }) })),
  deleteThread: (threadId: string) => (isChatPreview() ? previewChat.deleteThread(threadId) : call<{ deleted: boolean }>(`/api/chat/threads/${threadId}`, { method: 'DELETE' })),
  createProject: (name: string) => (isChatPreview() ? previewChat.createProject(name) : call<{ project: ChatProject }>('/api/chat/projects', { method: 'POST', body: json({ name }) })),
  updateProject: (projectId: string, patch: { name?: string; instructions?: string }) => (isChatPreview() ? previewChat.updateProject(projectId, patch) : call<{ project: ChatProject }>(`/api/chat/projects/${projectId}`, { method: 'PATCH', body: json(patch) })),
  deleteProject: (projectId: string) => (isChatPreview() ? previewChat.deleteProject(projectId) : call<{ deleted: boolean }>(`/api/chat/projects/${projectId}`, { method: 'DELETE' })),

  /** Sends a message; `onEvent` gets the reply as it streams. Aborting stops it (nothing is charged). */
  send: async (request: ChatSendRequest, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<void> => {
    if (isChatPreview()) return previewChat.send(request, onEvent, signal);
    const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
    let response: Response;
    try {
      response = await fetch('/api/chat/send', { method: 'POST', headers, body: json(request), signal });
    } catch (error) {
      if (signal.aborted) throw new ChatApiError(499, 'Stopped.', 'stopped');
      throw new ChatApiError(0, error instanceof Error ? error.message : 'Network error');
    }
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ChatApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`, typeof body.code === 'string' ? body.code : undefined);
    }
    try {
      await readNdjson(response.body, (event) => onEvent(event as unknown as ChatStreamEvent));
    } catch (error) {
      if (signal.aborted) throw new ChatApiError(499, 'Stopped.', 'stopped');
      throw error;
    }
  },
};
