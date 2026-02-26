'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@/components/workflow-v2/Canvas';

export default function WorkflowPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-white text-sm">Loading workflow editor...</div>
      </div>
    );
  }

  return <Canvas />;
}
