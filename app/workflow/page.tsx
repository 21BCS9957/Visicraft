'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@/components/workflow-v2/Canvas';
import { WorkflowLoader } from '@/components/workflow-v2/WorkflowLoader';

export default function WorkflowPage() {
  const [mounted, setMounted] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Keep loader for at least 3 seconds to show the awesome animation
    const timer = setTimeout(() => {
      setShowLoader(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted || showLoader) {
    return <WorkflowLoader />;
  }

  return <Canvas />;
}
