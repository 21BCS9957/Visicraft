'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {  Image as ImageIcon, MessageSquare, Zap, Clapperboard, StickyNote, Search, ChevronRight } from 'lucide-react';

interface NodeOption {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  badge?: string;
  hasSubmenu?: boolean;
  type?: string;     // The node type for ReactFlow
  nodeType?: string; // Additional meta for 'import' types
}

const MENU_CATEGORIES: { title: string; options: NodeOption[] }[] = [
  {
    title: 'Add Node',
    options: [
      { id: 'reference', label: 'Reference', icon: ImageIcon, type: 'import', nodeType: 'reference' },
      { id: 'prompt', label: 'Prompt', icon: MessageSquare, type: 'prompt' },
      { id: 'generate', label: 'Generate Image', icon: Zap, type: 'generate' },
      { id: 'video', label: 'Generate Video', icon: Clapperboard, type: 'videoGenerate' },
      { id: 'note', label: 'Note', icon: StickyNote, type: 'note' },
    ]
  }
];

interface NodeSelectorMenuProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onSelect: (type: string, nodeType?: string) => void;
}

export function NodeSelectorMenu({ isOpen, position, onClose, onSelect }: NodeSelectorMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Handle escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  const filteredCategories = MENU_CATEGORIES.map(category => ({
    ...category,
    options: category.options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()))
  })).filter(category => category.options.length > 0);

  // Position logic so it doesn't overflow screen
  const style: React.CSSProperties = {
    left: position.x,
    top: position.y,
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15 }}
        className="font-body fixed z-[200] flex max-h-[450px] w-[320px] flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#151519]/92 shadow-[0_28px_100px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
        style={style}
      >
        {/* Search Header */}
        <div className="p-4 pb-2">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search nodes or models"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-white/10 bg-black/24 py-2 pl-9 pr-4 text-sm text-white !outline-none !ring-0 transition-colors placeholder:text-white/32 focus:border-[#fff05a]/38 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {filteredCategories.map((category, idx) => (
            <div key={category.title} className="mb-2">
              <div className="px-3 py-2 text-xs font-semibold tracking-wide text-white/38">
                {category.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {category.options.map(option => (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (option.type) {
                        onSelect(option.type, option.nodeType);
                        onClose();
                      }
                    }}
                    className="group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/7"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-white/8 bg-white/[0.055] p-1.5 transition-colors group-hover:border-[#fff05a]/24 group-hover:bg-[#fff05a]/10">
                        <option.icon className="h-4 w-4 text-white/72 group-hover:text-[#fff05a]" />
                      </div>
                      <span className="text-[14px] text-white/72 group-hover:text-white">{option.label}</span>
                      {option.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 ml-1">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    {option.shortcut && (
                      <span className="text-xs text-gray-500 group-hover:text-gray-400">
                        {option.shortcut}
                      </span>
                    )}
                    {option.hasSubmenu && !option.shortcut && (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                ))}
              </div>
              {idx < filteredCategories.length - 1 && (
                <div className="h-[1px] bg-white/5 mx-3 mt-2" />
              )}
            </div>
          ))}
          {filteredCategories.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              No nodes found
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
