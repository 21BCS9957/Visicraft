'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Share, Crown, MessageCircle, Plus, Grid3x3, FolderKanban, Check } from 'lucide-react';
import { BackgroundVariant } from 'reactflow';

interface TopbarProps {
  onNewWorkflow?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  gridVariant?: BackgroundVariant;
  onChangeGridVariant?: (variant: BackgroundVariant) => void;
  onOrganizeNodes?: () => void;
}

export function Topbar({ 
  onNewWorkflow, 
  showGrid = true, 
  onToggleGrid,
  gridVariant = BackgroundVariant.Dots,
  onChangeGridVariant,
  onOrganizeNodes 
}: TopbarProps) {
  const [showGridMenu, setShowGridMenu] = useState(false);

  return (
    <div className="h-14 bg-[#0a0a0a] border-b border-[#1a1a1a] flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded" />
          <ChevronDown className="w-4 h-4" />
        </button>
        
        <input
          type="text"
          defaultValue="YouTube Thumbnail Workflow"
          className="bg-transparent text-white text-sm border-none outline-none w-[220px] focus:w-[280px] transition-all"
        />
        
        <div className="flex items-center gap-2 text-[#666666] text-xs">
          <span>📄</span>
          <span>Page 1</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Grid Toggle with Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowGridMenu(!showGridMenu)}
            className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-2 ${
              showGrid ? 'bg-[#1a1a1a] text-white' : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
            }`}
            title="Grid Settings"
          >
            <Grid3x3 className="w-4 h-4" />
            Grid
          </button>
          
          {showGridMenu && (
            <div className="absolute top-full mt-2 right-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl p-2 w-48 z-50">
              <button
                onClick={() => {
                  onToggleGrid?.();
                  setShowGridMenu(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-white hover:bg-[#2a2a2a] rounded flex items-center justify-between"
              >
                <span>Show Grid</span>
                {showGrid && <Check className="w-4 h-4 text-green-500" />}
              </button>
              
              <div className="border-t border-[#2a2a2a] my-2" />
              
              <div className="px-3 py-1 text-xs text-gray-400">Grid Style</div>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Dots);
                  setShowGridMenu(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-white hover:bg-[#2a2a2a] rounded flex items-center justify-between"
              >
                <span>Dots</span>
                {gridVariant === BackgroundVariant.Dots && <Check className="w-4 h-4 text-green-500" />}
              </button>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Lines);
                  setShowGridMenu(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-white hover:bg-[#2a2a2a] rounded flex items-center justify-between"
              >
                <span>Lines</span>
                {gridVariant === BackgroundVariant.Lines && <Check className="w-4 h-4 text-green-500" />}
              </button>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Cross);
                  setShowGridMenu(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-white hover:bg-[#2a2a2a] rounded flex items-center justify-between"
              >
                <span>Cross</span>
                {gridVariant === BackgroundVariant.Cross && <Check className="w-4 h-4 text-green-500" />}
              </button>
            </div>
          )}
        </div>
        
        {/* Organize Nodes Button */}
        {onOrganizeNodes && (
          <button 
            onClick={onOrganizeNodes}
            className="px-3 py-1.5 text-sm text-white hover:bg-[#1a1a1a] rounded transition-colors flex items-center gap-2"
            title="Auto-organize nodes in a grid"
          >
            <FolderKanban className="w-4 h-4" />
            Organize
          </button>
        )}
        
        {onNewWorkflow && (
          <button 
            onClick={onNewWorkflow}
            className="px-3 py-1.5 text-sm text-white hover:bg-[#1a1a1a] rounded transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        )}
        
        <button className="px-3 py-1.5 text-sm text-white hover:bg-[#1a1a1a] rounded transition-colors flex items-center gap-2">
          <Share className="w-4 h-4" />
          Share
        </button>
        
        <Link 
          href="/pricing"
          className="px-3 py-1.5 text-sm bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded transition-colors flex items-center gap-2"
        >
          <Crown className="w-4 h-4" />
          Upgrade
        </Link>
        
        <button className="px-3 py-1.5 text-sm text-white hover:bg-[#1a1a1a] rounded transition-colors flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          Feedback
        </button>
        
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 cursor-pointer" />
      </div>
    </div>
  );
}
