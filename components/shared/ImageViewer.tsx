'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { FrameSource } from '@/lib/video/shared';

/** An image full size; `box` outlines the area a close-up was cut from, `children` sit beside it. */
export function ImageViewer({ url, box, onClose, children }: { url: string; box?: FrameSource['box']; onClose: () => void; children?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xl" onClick={onClose} role="dialog" aria-label="Image">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-white/15 p-2 text-white/70 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <div className="flex max-h-full max-w-full flex-col items-center gap-3 overflow-y-auto lg:flex-row lg:items-start" onClick={(event) => event.stopPropagation()}>
        <div className="relative max-w-full shrink-0 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className={children ? 'block max-h-[60vh] max-w-full object-contain lg:max-h-[90vh]' : 'block max-h-[90vh] max-w-full object-contain'} />
          {box && (
            <span
              className="pointer-events-none absolute rounded-md border-2 border-[#fff05a] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${box[2] * 100}%`, height: `${box[3] * 100}%` }}
            />
          )}
        </div>
        {/* Details beside the image (a prompt, a download), when given. */}
        {children && <div className="w-full max-w-md shrink-0 rounded-2xl border border-white/10 bg-[#141418] p-4 text-left lg:w-80">{children}</div>}
      </div>
      {box && <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/85">The close-up was cut from the outlined area</p>}
    </div>
  );
}
