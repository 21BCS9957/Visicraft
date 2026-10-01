import { Suspense } from 'react';
import type { Metadata } from 'next';
import { VideoStudio } from '@/components/video-studio/VideoStudio';

export const metadata: Metadata = {
  title: 'Video project · Visicraft',
};

export default async function VideoProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // The Studio reads ?url= (a product link handed over from Home).
  return (
    <Suspense fallback={<div className="h-dvh bg-[#08080a]" />}>
      <VideoStudio projectId={projectId} />
    </Suspense>
  );
}
