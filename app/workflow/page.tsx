'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
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

  return (
    <>
      <Canvas />
      
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 1000,
          className: 'mobile-toast',
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #2a2a2a',
            maxWidth: '90vw',
            pointerEvents: 'none',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </>
  );
}
