'use client';

import { useState, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Download, Copy, Trash2, RefreshCw } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export function OutputNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleDownload = async () => {
    const images = data.images || [];
    if (images.length === 0) {
      toast.error('No images to download');
      return;
    }

    try {
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];
        
        if (imageUrl.startsWith('data:')) {
          const link = document.createElement('a');
          link.href = imageUrl;
          link.download = `output-${Date.now()}-${i + 1}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `output-${Date.now()}-${i + 1}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
      
      toast.success(`Downloaded ${images.length} image(s)!`);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed');
    }
    setShowMenu(false);
  };

  const handleDuplicate = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const currentNode = nodes.find(n => n.id === id);
    
    if (!currentNode) return;

    const newNode = {
      ...currentNode,
      id: `output-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data },
    };

    const incomingEdges = edges.filter(e => e.target === id);
    const newEdges = incomingEdges.map(edge => ({
      ...edge,
      id: `edge-${Date.now()}-${Math.random()}`,
      target: newNode.id,
    }));

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, ...newEdges]);
    toast.success('Node duplicated!');
    setShowMenu(false);
  };

  const handleReset = () => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, images: [] } }
          : node
      )
    );
    toast.success('Output cleared!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    toast.success('Node deleted!');
    setShowMenu(false);
  };

  // Check if handle is connected
  const edges = getEdges();
  const isConnected = edges.some(edge => edge.target === id);
  const images = data.images || [];

  return (
    <div className={`min-w-[280px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl transition-all ${selected ? 'ring-2 ring-[#8b7355]' : ''}`}>
      {/* Node Resizer */}
      <NodeResizer
        color="#10b981"
        isVisible={selected}
        minWidth={280}
        minHeight={200}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 4,
        }}
      />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-icon bg-green-500/20">
          <Icon icon="ph:sparkle-fill" className="w-4 h-4 text-green-400" />
        </div>
        <span className="node-header-title">Output</span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="node-header-menu"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          
          {/* Dropdown Menu */}
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
              >
                {images.length > 0 && (
                  <>
                    <button
                      onClick={handleDownload}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download All
                    </button>
                    <div className="border-t border-[#2a2a2a]" />
                  </>
                )}
                
                <button
                  onClick={handleDuplicate}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate Node
                </button>
                
                <button
                  onClick={handleReset}
                  disabled={images.length === 0}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear Output
                </button>
                
                <div className="border-t border-[#2a2a2a]" />
                
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#2a2a2a] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Node
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      <div className="node-content">
        {images.length > 0 ? (
          <div className="space-y-2">
            {images.map((imageUrl: string, index: number) => (
              <div key={index} className="relative group">
                <img
                  src={imageUrl}
                  alt={`Output ${index + 1}`}
                  className="w-full h-40 object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                  <button
                    onClick={async () => {
                      try {
                        if (imageUrl.startsWith('data:')) {
                          const link = document.createElement('a');
                          link.href = imageUrl;
                          link.download = `output-${Date.now()}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        } else {
                          const response = await fetch(imageUrl);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `output-${Date.now()}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }
                        toast.success('Image downloaded!');
                      } catch (error) {
                        toast.error('Download failed');
                      }
                    }}
                    className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-gray-600 text-sm border-2 border-dashed border-[#2a2a2a] rounded-lg">
            <Icon icon="ph:sparkle-duotone" className="w-8 h-8 mb-2 text-gray-700" />
            <span>No output yet</span>
            <span className="text-xs text-gray-700 mt-1">Connect to a Generate node</span>
          </div>
        )}
      </div>

      {/* Handle - LEFT ONLY (input) */}
      <div
        className={`react-flow__handle react-flow__handle-left handle-output ${isConnected ? 'connected' : ''}`}
        style={{ left: '-6px', top: '50%', position: 'absolute' }}
        data-handleid="input"
        data-nodeid={id}
        data-handlepos="left"
      />
    </div>
  );
}
