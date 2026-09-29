'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { canvasApi } from '@/lib/playground/api';
import { PREVIEW_PROJECT_ID } from '@/lib/playground/preview';
import { usePreviewFlag } from '../hooks';
import type { CanvasSource } from './CanvasEditor';
import type { CanvasDoc } from './editorTypes';

// Fabric needs the browser; the editor is never rendered on the server.
const CanvasEditor = dynamic(() => import('./CanvasEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-[#08080a] text-white/50">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening the Canvas…
    </div>
  ),
});

function readSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The image couldn't be loaded."));
    image.src = url;
  });
}

export function CanvasPage({ projectId, itemId }: { projectId: string; itemId: string }) {
  const { user, loading: authLoading } = useAuth();
  const previewFlag = usePreviewFlag();
  const preview = previewFlag && projectId === PREVIEW_PROJECT_ID;
  const [loaded, setLoaded] = useState<{ key: string; source?: CanvasSource; error?: string } | null>(null);
  const key = `${projectId}/${itemId}/${preview}`;

  useEffect(() => {
    if (!preview && (authLoading || !user)) return;
    let cancelled = false;
    (async () => {
      try {
        let source: CanvasSource;
        if (preview) {
          const baseUrl = '/Youtube%20Template/Youtube_Generated.png';
          source = { projectId, projectName: 'Night Unwind tea — Diwali set', itemId, sourceItemId: itemId, editItemId: null, baseUrl, doc: null, preview: true, ...(await readSize(baseUrl)) };
        } else {
          const data = await canvasApi.getItem(itemId);
          if (data.item.status !== 'done' || !data.item.imageUrl) throw new Error('Only finished images can be opened in the Canvas.');
          const doc = (data.canvasDoc as CanvasDoc | null) ?? null;
          const baseUrl = doc?.baseUrl ?? data.item.imageUrl;
          const size = doc ? { width: doc.width, height: doc.height } : await readSize(baseUrl);
          source = {
            projectId,
            projectName: data.project.name,
            itemId,
            sourceItemId: data.item.id,
            editItemId: data.item.kind === 'edit' ? data.item.id : null,
            baseUrl,
            doc,
            preview: false,
            ...size,
          };
        }
        if (!cancelled) setLoaded({ key, source });
      } catch (error) {
        if (!cancelled) setLoaded({ key, error: error instanceof Error ? error.message : 'The image could not be opened.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, preview, authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!preview && !authLoading && !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#08080a] p-6 text-center text-white">
        <div>
          <h1 className="text-xl font-light">Sign in to use the Canvas</h1>
          <Link href="/login" className="mt-5 inline-flex rounded-full bg-[#fff05a] px-5 py-2.5 text-sm font-medium text-black hover:bg-white">Sign in</Link>
        </div>
      </div>
    );
  }
  const current = loaded?.key === key ? loaded : null;
  if (current?.error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#08080a] p-6 text-center text-white">
        <div>
          <h1 className="text-xl font-light">The Canvas couldn&apos;t open this image</h1>
          <p className="mt-2 text-sm text-white/55">{current.error}</p>
          <Link href={`/playground/${projectId}`} className="mt-5 inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm hover:bg-white/8">Back to the project</Link>
        </div>
      </div>
    );
  }
  if (!current?.source) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#08080a] text-white/50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening the Canvas…
      </div>
    );
  }
  return <CanvasEditor key={key} source={current.source} />;
}
