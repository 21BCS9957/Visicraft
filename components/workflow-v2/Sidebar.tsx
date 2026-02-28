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
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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

export function Sidebar({
  onAddNode,
  showGrid,
  onToggleGrid,
  showFilePanel,
  onToggleFilePanel,
  undo,
  redo,
  canUndo,
  canRedo
}: SidebarProps) {
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
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-colors ${(activePanel === tool.id || (tool.id === 'grid' && showGrid))
              ? 'bg-[#1a1a1a] text-white'
              : 'hover:bg-[#1a1a1a] text-[#666666] hover:text-white'
              }`}
            title={tool.label}
          >
            <tool.icon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
          </button>
        ))}

        <div className="flex-1" />

        <div className="flex flex-col gap-2 mt-auto">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-colors ${canUndo ? 'bg-[#1a1a1a] text-white' : 'text-[#666666] cursor-not-allowed'
              }`}
            title="Undo"
          >
            <svg width={isMobile ? "16" : "20"} height={isMobile ? "16" : "20"} viewBox="4 6 32 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M15.459 10.663C15.858 10.281 15.872 9.649 15.49 9.25C15.108 8.851 14.475 8.837 14.076 9.219L7.779 15.248C7.582 15.436 7.471 15.697 7.471 15.97C7.471 16.243 7.582 16.504 7.779 16.692L14.076 22.721C14.475 23.103 15.108 23.089 15.49 22.69C15.872 22.291 15.858 21.658 15.459 21.276L10.809 16.824H24.53C27.291 16.824 29.53 19.063 29.53 21.824V23.059C29.53 25.821 27.291 28.059 24.53 28.059H22.441C21.889 28.059 21.441 28.507 21.441 29.059C21.441 29.612 21.889 30.059 22.441 30.059H24.53C28.396 30.059 31.53 26.925 31.53 23.059V21.824C31.53 17.958 28.396 14.824 24.53 14.824H11.114L15.459 10.663Z" fill="currentColor" />
            </svg>
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-colors ${canRedo ? 'bg-[#1a1a1a] text-white' : 'text-[#666666] cursor-not-allowed'
              }`}
            title="Redo"
          >
            <svg width={isMobile ? "16" : "20"} height={isMobile ? "16" : "20"} viewBox="4 6 32 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M23.541 10.663C23.142 10.281 23.128 9.649 23.51 9.25C23.892 8.851 24.525 8.837 24.924 9.219L31.221 15.248C31.418 15.436 31.529 15.697 31.529 15.97C31.529 16.243 31.418 16.504 31.221 16.692L24.924 22.721C24.525 23.103 23.892 23.089 23.51 22.69C23.128 22.291 23.142 21.658 23.541 21.276L28.191 16.824H14.47C11.709 16.824 9.47 19.063 9.47 21.824V23.059C9.47 25.821 11.709 28.059 14.47 28.059H16.559C17.111 28.059 17.559 28.507 17.559 29.059C17.559 29.612 17.111 30.059 16.559 30.059H14.47C10.604 30.059 7.47 26.925 7.47 23.059V21.824C7.47 17.958 10.604 14.824 14.47 14.824H27.886L23.541 10.663Z" fill="currentColor" />
            </svg>
          </button>
        </div>
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
