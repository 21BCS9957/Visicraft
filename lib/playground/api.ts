'use client';

import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import type { ReferenceRole, ThinkingLevel } from './models';
import type {
  GenerateResponse,
  PlaygroundBundle,
  PlaygroundItem,
  PlaygroundProject,
  PlaygroundProjectSummary,
  PlaygroundReference,
  PlaygroundRun,
  PlaygroundSettings,
} from './types';

export class PlaygroundApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public body?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new PlaygroundApiError(
      response.status,
      typeof body.error === 'string' ? body.error : `Request failed (${response.status})`,
      typeof body.code === 'string' ? body.code : undefined,
      body
    );
  }
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export interface NewReferenceImage {
  url: string;
  role: ReferenceRole;
  label?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface NewRunRequest {
  clientKey: string;
  prompts: string[];
  model: string;
  size: string;
  aspectRatios: string[];
  variations: number;
  thinking?: ThinkingLevel;
  brief: string;
  referenceIds: string[];
}

export const playgroundApi = {
  listProjects: () => call<{ projects: PlaygroundProjectSummary[] }>('/api/playground/projects'),
  createProject: (name: string) =>
    call<{ project: PlaygroundProject }>('/api/playground/projects', { method: 'POST', body: json({ name }) }),
  getProject: (id: string, before?: string | null) =>
    call<PlaygroundBundle>(`/api/playground/projects/${id}${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  updateProject: (id: string, patch: { name?: string; brief?: string; settings?: Partial<PlaygroundSettings> }) =>
    call<{ project: PlaygroundProject }>(`/api/playground/projects/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteProject: (id: string) => call<{ deleted: boolean }>(`/api/playground/projects/${id}`, { method: 'DELETE' }),

  addReferences: (projectId: string, images: NewReferenceImage[]) =>
    call<{ references: PlaygroundReference[] }>(`/api/playground/projects/${projectId}/references`, { method: 'POST', body: json({ images }) }),
  addReferenceFromItem: (projectId: string, sourceItemId: string, role: ReferenceRole) =>
    call<{ references: PlaygroundReference[] }>(`/api/playground/projects/${projectId}/references`, { method: 'POST', body: json({ sourceItemId, role }) }),
  updateReference: (id: string, patch: { role?: ReferenceRole; label?: string; enabled?: boolean }) =>
    call<{ reference: PlaygroundReference }>(`/api/playground/references/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteReference: (id: string) => call<{ deleted: boolean }>(`/api/playground/references/${id}`, { method: 'DELETE' }),

  createRun: (projectId: string, run: NewRunRequest) =>
    call<{ run: PlaygroundRun; items: PlaygroundItem[] }>(`/api/playground/projects/${projectId}/runs`, { method: 'POST', body: json(run) }),
  cancelRun: (runId: string) => call<{ cancelledIds: string[] }>(`/api/playground/runs/${runId}/cancel`, { method: 'POST' }),

  getItem: (id: string) => call<{ item: PlaygroundItem }>(`/api/playground/items/${id}`),
  updateItem: (id: string, patch: { favorite?: boolean; requeue?: boolean }) =>
    call<{ item: PlaygroundItem }>(`/api/playground/items/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteItem: (id: string) => call<{ deleted: boolean }>(`/api/playground/items/${id}`, { method: 'DELETE' }),

  /** Never throws for the answers the runner handles (402, 409, 429, 503); throws on network errors. */
  generateItem: async (id: string): Promise<{ status: number; body: GenerateResponse }> => {
    const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(`/api/playground/items/${id}/generate`, { method: 'POST', headers });
    const body = (await response.json().catch(() => ({}))) as GenerateResponse & { error?: string };
    if (!body.outcome) {
      throw new PlaygroundApiError(response.status, body.error ?? `Request failed (${response.status})`);
    }
    return { status: response.status, body };
  },
};

export interface CanvasItemData {
  item: PlaygroundItem;
  canvasDoc: unknown;
  project: { id: string; name: string };
  model: string | null;
  size: string | null;
  prompt: string | null;
}

export const canvasApi = {
  getItem: (id: string) => call<CanvasItemData>(`/api/playground/items/${id}?full=1`),
  aiEdit: (id: string, request: { baseUrl: string; mask: string; mode: 'remove' | 'replace'; instruction?: string; model: string; width: number; height: number }) =>
    call<{ imageUrl: string; width: number; height: number; credits: number }>(`/api/playground/items/${id}/ai-edit`, { method: 'POST', body: json(request) }),
  saveEdit: (projectId: string, request: { sourceItemId: string; editItemId?: string; imageUrl: string; canvasDoc: unknown }) =>
    call<{ item: PlaygroundItem }>(`/api/playground/projects/${projectId}/edits`, { method: 'POST', body: json(request) }),
  /** Uploads a full-resolution export straight to storage and returns its public URL. */
  upload: async (blob: Blob): Promise<string> => {
    const target = await call<{ bucket: string; path: string; token: string; publicUrl: string }>('/api/playground/uploads/sign', {
      method: 'POST',
      body: json({ contentType: blob.type, size: blob.size }),
    });
    const { supabase } = await import('@/lib/supabase/client');
    const { error } = await supabase.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return target.publicUrl;
  },
};

/** A public storage URL that downloads as a file instead of opening. */
export function downloadUrl(url: string, fileName: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;
}
