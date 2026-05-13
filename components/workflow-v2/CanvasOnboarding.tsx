'use client';

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cable, MousePointer2, Play, Plus, X } from 'lucide-react';

interface CanvasOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateExample: () => void;
}

export function CanvasOnboarding({ isOpen, onClose, onCreateExample }: CanvasOnboardingProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute left-1/2 top-20 z-30 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-white/10 bg-[#101010]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-medium text-white">Quick canvas tour</h2>
              <p className="mt-0.5 text-xs text-gray-400">Build a flow in three moves.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close canvas tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
            <div className="relative min-h-[250px] overflow-hidden border-b border-white/10 bg-black md:border-b-0 md:border-r">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />

              <div className="absolute left-[13%] top-[30%] h-20 w-28 rounded-lg border border-blue-400/60 bg-[#151515] p-3 shadow-lg shadow-blue-500/10">
                <div className="mb-2 h-3 w-16 rounded bg-blue-400/70" />
                <div className="h-2 w-20 rounded bg-white/12" />
                <div className="mt-2 h-2 w-14 rounded bg-white/10" />
                <div className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-blue-400 bg-[#151515] shadow-[0_0_0_3px_#151515]" />
              </div>

              <div className="absolute right-[12%] top-[30%] h-20 w-28 rounded-lg border border-cyan-400/60 bg-[#151515] p-3 shadow-lg shadow-cyan-500/10">
                <div className="mb-2 h-3 w-16 rounded bg-cyan-400/70" />
                <div className="h-2 w-20 rounded bg-white/12" />
                <div className="mt-2 h-2 w-14 rounded bg-white/10" />
                <div className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-[#151515] shadow-[0_0_0_3px_#151515]" />
              </div>

              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 440 250">
                <defs>
                  <linearGradient id="tour-wire" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <motion.path
                  d="M 150 86 C 205 86, 235 86, 290 86"
                  fill="none"
                  stroke="rgba(0,0,0,0.8)"
                  strokeLinecap="round"
                  strokeWidth="7"
                />
                <motion.path
                  d="M 150 86 C 205 86, 235 86, 290 86"
                  fill="none"
                  stroke="url(#tour-wire)"
                  strokeLinecap="round"
                  strokeWidth="3"
                  strokeDasharray="140"
                  initial={{ strokeDashoffset: 140 }}
                  animate={{ strokeDashoffset: [140, 0, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}
                />
              </svg>

              <motion.div
                className="absolute left-[31%] top-[58%] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white text-black shadow-lg"
                animate={{
                  x: [0, 118, 118, 0],
                  y: [0, -62, -62, 0],
                  scale: [1, 0.95, 1, 1],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <MousePointer2 className="h-4 w-4" />
              </motion.div>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <div className="grid gap-3">
                <TourStep icon={<Plus className="h-4 w-4" />} title="Add" detail="Double-click the canvas or pick a preset." />
                <TourStep icon={<Cable className="h-4 w-4" />} title="Connect" detail="Drag from one socket to another." />
                <TourStep icon={<Play className="h-4 w-4" />} title="Run" detail="Press Run when every input is connected." />
              </div>

              <div className="mt-auto flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={onCreateExample}
                  className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-gray-200"
                >
                  Create starter flow
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TourStep({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-gray-400">{detail}</div>
      </div>
    </div>
  );
}
