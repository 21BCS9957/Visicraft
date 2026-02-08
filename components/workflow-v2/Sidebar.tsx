'use client';

import React, { useState } from 'react';
import {
  MousePointer2,
  Search,
  Square,
  Grid3x3,
  FolderOpen,
  Image,
  MessageSquare,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  onAddNode: (type: string, position: { x: number; y: number }) => void;
}

const tools = [
  { icon: MousePointer2, label: 'Select', id: 'select' },
  { icon: Search, label: 'Search', id: 'search' },
  { icon: Square, label: 'Nodes', id: 'nodes' },
  { icon: Grid3x3, label: 'Grid', id: 'grid' },
  { icon: FolderOpen, label: 'Files', id: 'files' },
];

const nodeTypes = [
  { icon: Image, label: 'Import', type: 'import', color: '#3b82f6' },
  { icon: MessageSquare, label: 'Prompt', type: 'prompt', color: '#8b5cf6' },
  { icon: Zap, label: 'Generate', type: 'generate', color: '#ef4444' },
];

export function Sidebar({ onAddNode }: SidebarProps) {
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const handleAddNode = (type: string) => {
    const position = {
      x: Math.random() * 300 + 200,
      y: Math.random() * 300 + 100,
    };
    onAddNode(type, position);
  };

  return (
    <div className="flex h-full">
      {/* Icon Bar */}
      <div className="w-[60px] bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col items-center py-4 gap-2">
        <button className="w-10 h-10 rounded-lg bg-[#1a1a1a] hover:bg-[#222222] flex items-center justify-center mb-4 transition-colors">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded" />
        </button>

        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActivePanel(activePanel === tool.id ? null : tool.id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              activePanel === tool.id
                ? 'bg-[#1a1a1a] text-white'
                : 'hover:bg-[#1a1a1a] text-[#666666] hover:text-white'
            }`}
            title={tool.label}
          >
            <tool.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      {/* Expandable Panel */}
      {activePanel === 'nodes' && (
        <div className="w-[240px] bg-[#0f0f0f] border-r border-[#1a1a1a] p-4">
          <h3 className="text-white text-sm font-medium mb-4">Add Nodes</h3>
          <div className="space-y-2">
            {nodeTypes.map((node) => (
              <button
                key={node.type}
                onClick={() => handleAddNode(node.type)}
                className="w-full flex items-center gap-3 p-3 bg-[#1a1a1a] hover:bg-[#222222] rounded-lg transition-colors group"
              >
                <div
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ backgroundColor: `${node.color}20` }}
                >
                  <node.icon className="w-4 h-4" style={{ color: node.color }} />
                </div>
                <span className="text-sm text-[#a0a0a0] group-hover:text-white transition-colors">
                  {node.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
