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
        className="fixed z-[200] w-[300px] max-h-[450px] bg-[#1a1a1a] rounded-[24px] border border-white/10 shadow-2xl overflow-hidden flex flex-col font-body"
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
              className="w-full bg-[#111111] border border-white/10 text-white rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus-visible:outline-none !ring-0 !outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-white transition-colors placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {filteredCategories.map((category, idx) => (
            <div key={category.title} className="mb-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 tracking-wide">
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
                    className="flex justify-between items-center px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left w-full"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-[#2a2a2a] group-hover:bg-[#333333] transition-colors">
                        <option.icon className="w-4 h-4 text-gray-300" />
                      </div>
                      <span className="text-[14px] text-gray-200 group-hover:text-white">{option.label}</span>
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
