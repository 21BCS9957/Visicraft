import { Suspense } from 'react';
import type { Metadata } from 'next';
import { VideoHub } from '@/components/video-studio/VideoHub';

export const metadata: Metadata = {
  title: 'Video Studio · Visicraft',
};

export default function PlaygroundVideoPage() {
  // The hub reads ?url= (a product link handed over from Home).
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08080a]" />}>
      <VideoHub />
    </Suspense>
  );
}
