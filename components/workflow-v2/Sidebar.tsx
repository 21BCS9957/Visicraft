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
  Upload,
  FileImage,
} from 'lucide-react';
import toast from '@/lib/toast';

interface SidebarProps {
  onAddNode: (type: string, position: { x: number; y: number }, nodeType?: string) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showFilePanel: boolean;
  onToggleFilePanel: () => void;
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
  { icon: StickyNote, label: 'Note', type: 'note', color: '#fbbf24' },
];

export function Sidebar({ onAddNode, showGrid, onToggleGrid, showFilePanel, onToggleFilePanel }: SidebarProps) {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; type: string }>>([]);

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

  // Handle drag start for nodes
  const onDragStart = (event: React.DragEvent, nodeType: string, type: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-nodetype', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Handle grid button click
  const handleGridClick = () => {
    onToggleGrid();
    toast.success(showGrid ? 'Grid hidden' : 'Grid visible');
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    
    setUploadedFiles(prev => [...prev, {
      name: file.name,
      url,
      type: file.type
    }]);
    
    toast.success(`${file.name} uploaded!`);
  };

  return (
    <div className="flex h-full">
      {/* Icon Bar */}
      <div className={`${isMobile ? 'w-[50px]' : 'w-[60px]'} bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col items-center py-4 gap-2`}>
        <button 
          onClick={() => handleAddNode('note')}
          className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-[#1a1a1a] hover:bg-[#222222] flex items-center justify-center mb-4 transition-colors group`}
          title="Add Note"
        >
          <StickyNote className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-[#fbbf24] group-hover:scale-110 transition-transform`} />
        </button>

        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              if (tool.id === 'grid') {
                handleGridClick();
              } else if (tool.id === 'files') {
                setActivePanel(activePanel === 'files' ? null : 'files');
              } else {
                setActivePanel(activePanel === tool.id ? null : tool.id);
              }
            }}
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-colors ${
              (activePanel === tool.id || (tool.id === 'grid' && showGrid))
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
          <p className="text-xs text-gray-500 mb-3">Drag nodes to canvas or click to add</p>
          <div className="space-y-2">
            {nodeTypes.map((node) => (
              <div
                key={`${node.type}-${node.nodeType || 'default'}`}
                draggable
                onDragStart={(e) => onDragStart(e, node.type, node.nodeType || '')}
                onClick={() => handleAddNode(node.type, node.nodeType)}
                className="w-full flex items-center gap-3 p-3 bg-[#1a1a1a] hover:bg-[#222222] rounded-lg transition-colors group cursor-move"
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
              </div>
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

      {activePanel === 'files' && (
        <div className={`${isMobile ? 'w-[240px] absolute left-[50px] top-0 bottom-0 z-50 shadow-2xl' : 'w-[280px]'} bg-[#0f0f0f] border-r border-[#1a1a1a] p-4 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-sm font-medium">File Manager</h3>
            <FolderOpen className="w-4 h-4 text-blue-400" />
          </div>
          
          {/* Upload Button */}
          <label className="w-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 border border-blue-500/30 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-all mb-4">
            <Upload className="w-8 h-8 text-blue-400 mb-2" />
            <span className="text-sm text-white font-medium">Upload Image</span>
            <span className="text-xs text-gray-400 mt-1">Click to browse</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Uploaded Files List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8">
                <FileImage className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files uploaded yet</p>
                <p className="text-xs text-gray-600 mt-1">Upload images to use in your workflow</p>
              </div>
            ) : (
              uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="bg-[#1a1a1a] hover:bg-[#222222] rounded-lg p-3 flex items-center gap-3 transition-colors"
                >
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{file.type}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-gray-500 text-center">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
