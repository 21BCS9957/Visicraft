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
    <div className="h-[80px] bg-[#0a0a0a] border-t border-[#1a1a1a] flex items-center justify-between px-6">
      <div className="text-[#666666] text-sm">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Running workflow...</span>
          </div>
        ) : (
          'No Active Runs'
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Number of runs */}
        <div className="flex items-center gap-3">
          <span className="text-[#a0a0a0] text-xs">Number of runs</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRuns(Math.max(1, runs - 1))}
              disabled={isRunning}
              className="w-6 h-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded flex items-center justify-center hover:bg-[#222222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className="w-3 h-3 text-white" />
            </button>
            <span className="w-8 text-center text-white text-sm">{runs}</span>
            <button
              onClick={() => setRuns(runs + 1)}
              disabled={isRunning}
              className="w-6 h-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded flex items-center justify-center hover:bg-[#222222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>

        {/* Run Selected Button */}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="px-6 py-2.5 bg-white hover:bg-gray-100 text-black text-sm font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
