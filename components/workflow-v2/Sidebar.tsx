'use client';

import React, { useState } from 'react';
import {
  MousePointer2,
  StickyNote,
  Square,
  Grid3x3,
  FolderOpen,
  Image,
  MessageSquare,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  onAddNode: (type: string, position: { x: number; y: number }, nodeType?: string) => void;
}

const tools = [
  { icon: MousePointer2, label: 'Select', id: 'select' },
  { icon: StickyNote, label: 'Notes', id: 'notes' },
  { icon: Square, label: 'Nodes', id: 'nodes' },
  { icon: Grid3x3, label: 'Grid', id: 'grid' },
  { icon: FolderOpen, label: 'Files', id: 'files' },
];

const nodeTypes = [
  { icon: Image, label: 'Reference', type: 'import', nodeType: 'reference', color: '#f97316' },
  { icon: Image, label: 'Source', type: 'import', nodeType: 'source', color: '#3b82f6' },
  { icon: MessageSquare, label: 'Prompt', type: 'prompt', color: '#8b5cf6' },
  { icon: Zap, label: 'Generate', type: 'generate', color: '#ef4444' },
];

export function Sidebar({ onAddNode }: SidebarProps) {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAddNode = (type: string, nodeType?: string) => {
    const position = {
      x: Math.random() * 300 + 200,
      y: Math.random() * 300 + 100,
    };
    onAddNode(type, position, nodeType);
    // Close panel on mobile after adding node
    if (isMobile) {
      setActivePanel(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Icon Bar */}
      <div className={`${isMobile ? 'w-[50px]' : 'w-[60px]'} bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col items-center py-4 gap-2`}>
        <button className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-[#1a1a1a] hover:bg-[#222222] flex items-center justify-center mb-4 transition-colors`}>
          <div className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} bg-gradient-to-br from-purple-500 to-pink-500 rounded`} />
        </button>

        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActivePanel(activePanel === tool.id ? null : tool.id)}
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-colors ${
              activePanel === tool.id
                ? 'bg-[#1a1a1a] text-white'
                : 'hover:bg-[#1a1a1a] text-[#666666] hover:text-white'
            }`}
            title={tool.label}
          >
            <tool.icon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
          </button>
        ))}
      </div>

      {/* Expandable Panel */}
      {activePanel === 'nodes' && (
        <div className={`${isMobile ? 'w-[200px]' : 'w-[240px]'} bg-[#0f0f0f] border-r border-[#1a1a1a] p-4 ${isMobile ? 'absolute left-[50px] top-0 bottom-0 z-50 shadow-2xl' : ''}`}>
          <h3 className="text-white text-sm font-medium mb-4">Add Nodes</h3>
          <div className="space-y-2">
            {nodeTypes.map((node) => (
              <button
                key={`${node.type}-${node.nodeType || 'default'}`}
                onClick={() => handleAddNode(node.type, node.nodeType)}
                className="w-full flex items-center gap-3 p-3 bg-[#1a1a1a] hover:bg-[#222222] rounded-lg transition-colors group"
              >
                <div
                  className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} rounded flex items-center justify-center`}
                  style={{ backgroundColor: `${node.color}20` }}
                >
                  <node.icon className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} style={{ color: node.color }} />
                </div>
                <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-[#a0a0a0] group-hover:text-white transition-colors`}>
                  {node.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activePanel === 'notes' && (
        <div className={`${isMobile ? 'w-[240px] absolute left-[50px] top-0 bottom-0 z-50 shadow-2xl' : 'w-[280px]'} bg-[#0f0f0f] border-r border-[#1a1a1a] p-4 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-sm font-medium">Workflow Notes</h3>
            <StickyNote className="w-4 h-4 text-[#8b7355]" />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about your workflow...&#10;&#10;• Ideas&#10;• Settings&#10;• Reminders"
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#8b7355] resize-none"
          />
          <div className="mt-2 text-xs text-[#666666] text-right">
            {notes.length} characters
          </div>
        </div>
      )}
    </div>
  );
}
