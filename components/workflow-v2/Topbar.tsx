'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronDown, Share, Crown, MessageCircle } from 'lucide-react';

export function Topbar() {
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
