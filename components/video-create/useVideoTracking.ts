'use client';

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { pollVideoOperation, type PollReport } from '@/lib/video/client';
import { PREVIEW_CLIP } from '@/lib/video/preview';
import type { StudioVideo, VideoInfo, VideoTake } from '@/lib/video/shared';

/**
 * Follows every take that is still rendering until it has a file (or fails and is refunded),
 * including a retry take the server swaps in and renders started before this visit. In the dev
 * preview a render "finishes" in a few seconds.
 */

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    }, { once: true });
  });
}

async function simulateRender(signal: AbortSignal, report: (update: PollReport) => void): Promise<{ url: string; video: VideoInfo | null }> {
  for (let progress = 12; progress < 100; progress += 17) {
    await sleep(1300, signal);
    report({ progress, message: `Rendering… ${progress}%` });
  }
  return { url: PREVIEW_CLIP, video: null };
}

export function useVideoTracking({ videos, setVideos, preview, onReady, onFailed }: {
  videos: StudioVideo[] | null;
  setVideos: Dispatch<SetStateAction<StudioVideo[] | null>>;
  preview: boolean;
  onReady?: (videoId: string) => void;
  onFailed?: (message: string) => void;
}) {
  const polling = useRef(new Map<string, AbortController>());
  const callbacks = useRef({ onReady, onFailed });
  useEffect(() => {
    callbacks.current = { onReady, onFailed };
  }, [onReady, onFailed]);

  const patchTake = useCallback((operationId: string, patch: Partial<VideoTake>) => {
    setVideos((current) => current?.map((video) => (video.takes.some((take) => take.operationId === operationId)
      ? { ...video, takes: video.takes.map((take) => (take.operationId === operationId ? { ...take, ...patch } : take)) }
      : video)) ?? current);
  }, [setVideos]);

  const track = useCallback(async (operationId: string, videoId: string, controller: AbortController) => {
    let current = operationId;
    const report = (update: PollReport) => {
      if (update.retry) {
        const next = update.retry.operationId;
        polling.current.set(next, controller);
        patchTake(current, { operationId: next, progress: 5, message: update.retry.message, ...(update.retry.video ?? {}) });
        current = next;
        return;
      }
      patchTake(current, { progress: update.progress, message: update.message });
    };
    try {
      const done = preview ? await simulateRender(controller.signal, report) : await pollVideoOperation(operationId, report, controller.signal);
      patchTake(current, { status: 'ready', url: done.url, progress: 100, message: 'Ready', ...(done.video ?? {}) });
      callbacks.current.onReady?.(videoId);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'The video did not render.';
      patchTake(current, { status: 'failed', error: message });
      callbacks.current.onFailed?.(message);
    } finally {
      for (const [id, owner] of polling.current) if (owner === controller) polling.current.delete(id);
    }
  }, [preview, patchTake]);

  useEffect(() => {
    for (const video of videos ?? []) {
      for (const take of video.takes) {
        if (take.status !== 'rendering' || polling.current.has(take.operationId)) continue;
        const controller = new AbortController();
        polling.current.set(take.operationId, controller);
        void track(take.operationId, video.id, controller);
      }
    }
  }, [videos, track]);

  useEffect(() => {
    const active = polling.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, []);
}
