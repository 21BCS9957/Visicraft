import type { ImageQuality } from '@/lib/playground/models';
import type { SizeChoice } from './sizes';

/** The Chat section (/chat): ChatGPT-style image chats, saved in projects. Shared by the browser and the server. */

export interface ChatProject {
  id: string;
  name: string;
  /** Sent with every chat in the project (brand, colours, tone). */
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  projectId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** An image the user attached to a message. */
export interface ChatAttachment {
  url: string;
  name: string;
  width: number | null;
  height: number | null;
}

/** An image a reply made. */
export interface ChatImage {
  url: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  model: string;
  quality: ImageQuality;
  /** The prompt the image model actually got (the chat model writes it). */
  revisedPrompt: string | null;
  /** Made bigger than the image model renders (above 2K). */
  upscaled?: boolean;
}

export type ChatMessageStatus = 'done' | 'generating' | 'failed' | 'stopped';

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  attachments: ChatAttachment[];
  images: ChatImage[];
  status: ChatMessageStatus;
  error: string | null;
  /** Credits kept for this reply (0 when no image was made). */
  credits: number;
  createdAt: string;
}

export interface ChatSidebar {
  projects: ChatProject[];
  threads: ChatThread[];
  /** Set when the chat migration hasn't run. */
  setup?: string;
}

export interface ChatThreadPage {
  thread: ChatThread;
  messages: ChatMessage[];
  /** The size and quality of the chat's last message. */
  settings?: { size?: unknown; quality?: unknown };
}

export interface ChatSendRequest {
  threadId?: string | null;
  projectId?: string | null;
  text: string;
  attachments: ChatAttachment[];
  size: SizeChoice;
  quality: ImageQuality;
}

/** What the send route streams, one JSON object per line. */
export type ChatStreamEvent =
  | { type: 'thread'; thread: ChatThread }
  | { type: 'user'; message: ChatMessage }
  | { type: 'assistant'; message: ChatMessage; credits: number; size: string }
  | { type: 'text'; delta: string }
  | { type: 'creating' }
  | { type: 'partial'; image: string; index: number }
  | { type: 'image'; image: ChatImage }
  | { type: 'done'; message: ChatMessage }
  | { type: 'error'; message: string; code?: string; status?: number };
