'use client';

import React, { useState } from 'react';
import { Play, Minus, Plus, Loader2 } from 'lucide-react';

interface RunControlsProps {
  onRun: () => void;
  isRunning: boolean;
}

export function RunControls({ onRun, isRunning }: RunControlsProps) {
  const [runs, setRuns] = useState(1);

  return (
    <div className="pointer-events-auto mx-3 mb-3 flex h-[72px] items-center justify-between rounded-[28px] border border-white/10 bg-[#151519]/82 px-5 shadow-[0_24px_90px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
      <div className="text-sm text-white/46">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#fff05a]" />
            <span>Running workflow...</span>
          </div>
        ) : (
          <span className="hidden sm:inline">No active runs</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Number of runs */}
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-xs text-white/48">Runs</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRuns(Math.max(1, runs - 1))}
              disabled={isRunning}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Minus className="w-3 h-3 text-white" />
            </button>
            <span className="w-8 text-center text-white text-sm">{runs}</span>
            <button
              onClick={() => setRuns(runs + 1)}
              disabled={isRunning}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>

        {/* Run Selected Button */}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex h-12 items-center gap-2 rounded-full bg-[#fff05a] px-6 text-sm font-medium text-black shadow-[0_18px_44px_rgba(255,240,90,0.16)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running
            </>
          ) : (
            <>
              <Play className="w-4 h-4" fill="currentColor" />
              Run Selected
            </>
          )}
        </button>
      </div>
    </div>
  );
}
