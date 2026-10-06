'use client';

import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import { readNdjson } from '@/lib/ndjson';
import type { FinalQuality } from '@/lib/videoModels';
import { readVideoInfo, type VideoHistoryPage, type VideoInfo } from './shared';

/** The Video Studio's calls to the video API, and the render poller. */

export class VideoApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs, ...rest } = init;
  const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
  const controller = new AbortController();
  const timer = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(path, { ...rest, headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) }, signal: rest.signal ?? controller.signal });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new VideoApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new VideoApiError(408, 'That took too long. Try again.');
    throw error;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export interface ProductCapture {
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  vendor?: string;
  description?: string;
  /** Selling price in major units, when the store exposes it. */
  price?: number;
  currency?: string;
  images: Array<{ url: string; alt?: string; source: string }>;
}

export interface StartedRender {
  operationId: string;
  video: VideoInfo | null;
  notice?: string;
}

function started(body: Record<string, unknown>): StartedRender {
  if (typeof body.operationId !== 'string') throw new VideoApiError(502, 'The video did not start.');
  return { operationId: body.operationId, video: readVideoInfo(body.video), notice: typeof body.notice === 'string' ? body.notice : undefined };
}

export const videoApi = {
  history: (options: { before?: string | null; projectId?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.projectId) params.set('projectId', options.projectId);
    if (options.before) params.set('before', options.before);
    return call<VideoHistoryPage>(`/api/video/history${params.size ? `?${params}` : ''}`);
  },

  capture: async (url: string) =>
    (await call<{ product?: ProductCapture }>('/api/product-images', { method: 'POST', body: JSON.stringify({ url }), timeoutMs: 45_000 })).product ?? null,

  /** Approves a reviewed video: its video credits are charged now and the render starts. */
  approve: async (approvalId: string, edits: { prompt: string; negativePrompt?: string; frames: string[]; durationSeconds?: number }) =>
    started(await call<Record<string, unknown>>('/api/video/render', { method: 'POST', body: JSON.stringify({ approvalId, ...edits }) })),

  cancel: (approvalId: string) =>
    call<{ cancelled: boolean }>('/api/video/render', { method: 'POST', body: JSON.stringify({ approvalId, cancel: true }) }),

  /** A video that didn't render comes back for approval as a new one (no music after a music-check stop). */
  again: (videoId: string) =>
    call<{ reviewId: string; review: unknown }>('/api/video/again', { method: 'POST', body: JSON.stringify({ videoId }) }),

  /** Rewrites the prompt from a short instruction (nothing renders). */
  /**
   * Rewrites the prompt around a short idea, at the video's length (or another one the idea
   * asks for) and with the project's guidelines; `onText` gets the new prompt while it is written.
   */
  rewritePrompt: async (
    request: { prompt: string; instruction: string; images: number; seconds: number; model: string; projectId?: string },
    onText?: (text: string, options: { reset: boolean }) => void,
  ) => {
    const headers = await getAuthenticatedHeaders({ 'Content-Type': 'application/json' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch('/api/video/rewrite-prompt', { method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new VideoApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
      }
      let result: { prompt: string; summary: string; seconds: number; credits: number } | null = null;
      await readNdjson(response.body, (event) => {
        if (typeof event.error === 'string') throw new VideoApiError(Number(event.status) || 500, event.error);
        if (event.done === true && typeof event.prompt === 'string') {
          result = { prompt: event.prompt, summary: typeof event.summary === 'string' ? event.summary : '', seconds: Number(event.seconds) || request.seconds, credits: Number(event.credits) || 0 };
        } else if (typeof event.t === 'string') {
          onText?.(event.t, { reset: event.reset === true });
        }
      });
      if (!result) throw new VideoApiError(502, 'The rewrite stopped before it finished. Try again.');
      return result as { prompt: string; summary: string; seconds: number; credits: number };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new VideoApiError(408, 'That took too long. Try again.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  },

  /** A new draft of a take with the user's changes (prompt and images), as another take of the same video. */
  redraft: async (operationId: string, edits: { prompt: string; negativePrompt?: string; frames: string[]; durationSeconds?: number }) =>
    started(await call<Record<string, unknown>>('/api/video/redraft', { method: 'POST', body: JSON.stringify({ operationId, ...edits }) })),

  /** Re-renders a take (usually a draft) at a higher quality; only the new render is charged. */
  upgrade: async (operationId: string, quality: FinalQuality) =>
    started(await call<Record<string, unknown>>('/api/video/upgrade', { method: 'POST', body: JSON.stringify({ operationId, quality }) })),
};

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Stopped', 'AbortError'));
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface PollReport {
  progress: number;
  message: string;
  /** Set when the server swapped in a retry take (a refused or filtered first take). */
  retry?: { operationId: string; video: VideoInfo | null; message: string };
}

/**
 * Polls a render until it has a file. The server may swap in one retry (a refused or
 * filtered take); its operation id then replaces the original's. A failed render comes
 * back as an error (the server has refunded it by then).
 */
export async function pollVideoOperation(
  initialOperationId: string,
  report: (update: PollReport) => void,
  signal?: AbortSignal
): Promise<{ url: string; operationId: string; video: VideoInfo | null }> {
  let operationId = initialOperationId;
  let video: VideoInfo | null = null;
  let misses = 0;
  report({ progress: 5, message: 'Rendering…' });
  for (;;) {
    await wait(10_000, signal);
    let data: Record<string, unknown>;
    try {
      const response = await fetch('/api/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId }),
        signal,
      });
      data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok && !data.error) throw new Error(`status ${response.status}`);
      if (!response.ok) throw new Error(String(data.error));
    } catch (error) {
      if (signal?.aborted) throw error;
      // A hiccup (network, a restarting server): keep trying for about 10 minutes.
      misses += 1;
      if (misses >= 60) throw new Error('Lost touch with this render. Open the Video Studio again later to check on it.');
      continue;
    }
    misses = 0;
    if (typeof data.retryOperationId === 'string') {
      operationId = data.retryOperationId;
      video = readVideoInfo(data.retryVideo) ?? video;
      const message = typeof data.message === 'string' ? data.message : 'Re-rendering the video…';
      report({ progress: 5, message, retry: { operationId, video, message } });
      continue;
    }
    if (typeof data.error === 'string') throw new Error(data.error);
    if (data.done) {
      if (typeof data.url !== 'string' || !data.url) throw new Error('The video finished without a file.');
      report({ progress: 100, message: 'Done' });
      return { url: data.url, operationId, video };
    }
    const progress = typeof data.progress === 'number' && data.progress > 0 ? Math.min(99, data.progress) : 5;
    report({ progress, message: `Rendering… ${progress}%` });
  }
}
