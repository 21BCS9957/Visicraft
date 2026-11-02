import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, isUuid } from '@/lib/server/playground/http';
import type { ChatAttachment, ChatImage, ChatMessage, ChatProject, ChatThread } from '@/lib/chat/types';

/**
 * Chat's tables (supabase/migrations/202611010001_chat.sql). Every read and write is the
 * server's, scoped to the signed-in account; the browser never touches the tables.
 */

export type Db = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

export const CHAT_SETUP_MESSAGE = "Chat isn't set up yet. Run supabase/migrations/202611010001_chat.sql in the Supabase SQL Editor.";

export function chatDb(): Db {
  return createServiceClient();
}

/** The chat tables aren't there yet (the migration hasn't run). */
export function isChatMissing(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error.code ?? ''));
}

function check(error: { code?: string; message?: string } | null, what: string): void {
  if (!error) return;
  if (isChatMissing(error)) throw new ApiError(503, CHAT_SETUP_MESSAGE, 'setup');
  console.error(`Chat: could not ${what}:`, error);
  throw new ApiError(500, `Could not ${what}.`, 'db');
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function toProject(row: Row): ChatProject {
  return { id: String(row.id), name: text(row.name), instructions: text(row.instructions), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}

export function toThread(row: Row): ChatThread {
  return { id: String(row.id), projectId: typeof row.project_id === 'string' ? row.project_id : null, title: text(row.title) || 'New chat', createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}

export function toMessage(row: Row): ChatMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    text: text(row.content),
    attachments: list<ChatAttachment>(row.attachments),
    images: list<ChatImage>(row.images),
    status: (['done', 'generating', 'failed', 'stopped'].includes(text(row.status)) ? row.status : 'done') as ChatMessage['status'],
    error: typeof row.error === 'string' ? row.error : null,
    credits: Number(row.credits) || 0,
    createdAt: text(row.created_at),
  };
}

/** Every project and the newest 200 chats, for the sidebar; `setup` before the migration. */
export async function loadSidebar(db: Db, userId: string): Promise<{ projects: ChatProject[]; threads: ChatThread[]; setup?: string }> {
  const [projects, threads] = await Promise.all([
    db.from('chat_projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200),
    db.from('chat_threads').select('id, project_id, title, created_at, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200),
  ]);
  if (isChatMissing(projects.error) || isChatMissing(threads.error)) return { projects: [], threads: [], setup: CHAT_SETUP_MESSAGE };
  check(projects.error, 'load your projects');
  check(threads.error, 'load your chats');
  return { projects: (projects.data ?? []).map(toProject), threads: (threads.data ?? []).map(toThread) };
}

export async function requireProject(db: Db, userId: string, projectId: unknown): Promise<ChatProject> {
  if (!isUuid(projectId)) throw new ApiError(404, 'This project was not found.', 'not_found');
  const { data, error } = await db.from('chat_projects').select('*').eq('id', projectId).eq('user_id', userId).maybeSingle();
  check(error, 'load the project');
  if (!data) throw new ApiError(404, 'This project was not found.', 'not_found');
  return toProject(data as Row);
}

export async function requireThread(db: Db, userId: string, threadId: unknown): Promise<ChatThread & { lastResponseId: string | null; settings: Row }> {
  if (!isUuid(threadId)) throw new ApiError(404, 'This chat was not found.', 'not_found');
  const { data, error } = await db.from('chat_threads').select('*').eq('id', threadId).eq('user_id', userId).maybeSingle();
  check(error, 'load the chat');
  if (!data) throw new ApiError(404, 'This chat was not found.', 'not_found');
  const row = data as Row;
  return { ...toThread(row), lastResponseId: typeof row.last_response_id === 'string' ? row.last_response_id : null, settings: (row.settings as Row) ?? {} };
}

export async function loadMessages(db: Db, threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await db.from('chat_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(500);
  check(error, 'load the messages');
  return (data ?? []).map((row) => toMessage(row as Row));
}

export async function createProject(db: Db, userId: string, name: string): Promise<ChatProject> {
  const { data, error } = await db.from('chat_projects').insert({ user_id: userId, name }).select('*').single();
  check(error, 'create the project');
  return toProject(data as Row);
}

export async function updateProject(db: Db, userId: string, projectId: string, patch: { name?: string; instructions?: string }): Promise<ChatProject> {
  const { data, error } = await db.from('chat_projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', projectId).eq('user_id', userId).select('*').maybeSingle();
  check(error, 'save the project');
  if (!data) throw new ApiError(404, 'This project was not found.', 'not_found');
  return toProject(data as Row);
}

export async function deleteProject(db: Db, userId: string, projectId: string): Promise<void> {
  const { error } = await db.from('chat_projects').delete().eq('id', projectId).eq('user_id', userId);
  check(error, 'delete the project');
}

export async function createThread(db: Db, userId: string, options: { projectId: string | null; title: string }): Promise<ChatThread & { lastResponseId: string | null; settings: Row }> {
  const { data, error } = await db.from('chat_threads').insert({ user_id: userId, project_id: options.projectId, title: options.title }).select('*').single();
  check(error, 'start the chat');
  return { ...toThread(data as Row), lastResponseId: null, settings: {} };
}

export async function updateThread(db: Db, userId: string, threadId: string, patch: Record<string, unknown>): Promise<ChatThread> {
  const { data, error } = await db.from('chat_threads').update(patch).eq('id', threadId).eq('user_id', userId).select('*').maybeSingle();
  check(error, 'save the chat');
  if (!data) throw new ApiError(404, 'This chat was not found.', 'not_found');
  return toThread(data as Row);
}

export async function deleteThread(db: Db, userId: string, threadId: string): Promise<void> {
  const { error } = await db.from('chat_threads').delete().eq('id', threadId).eq('user_id', userId);
  check(error, 'delete the chat');
}

export async function insertMessage(db: Db, row: { thread_id: string; user_id: string; role: 'user' | 'assistant'; content: string; attachments?: ChatAttachment[]; status?: ChatMessage['status'] }): Promise<ChatMessage> {
  const { data, error } = await db.from('chat_messages').insert({ attachments: [], status: 'done', ...row }).select('*').single();
  check(error, 'save the message');
  return toMessage(data as Row);
}

export async function finishMessage(db: Db, messageId: string, patch: { content: string; images: ChatImage[]; status: ChatMessage['status']; error: string | null; response_id: string | null; credits: number }): Promise<ChatMessage> {
  const { data, error } = await db.from('chat_messages').update(patch).eq('id', messageId).select('*').single();
  check(error, 'save the reply');
  return toMessage(data as Row);
}

/** A short title from the first message ("Diwali poster for Brew Sage…"). */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'New chat';
  const words = flat.split(' ');
  const short = words.slice(0, 7).join(' ');
  return (words.length > 7 ? `${short}…` : short).slice(0, 120);
}
