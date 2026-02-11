'use client';

import { useState, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Copy, Trash2, RefreshCw } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export function PromptNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const [prompt, setPrompt] = useState(data.text || '');
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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    
    // Update node data
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, text: value } };
        }
        return node;
      })
    );
    
    // Update connected Generate nodes immediately
    const edges = getEdges();
    const connectedEdges = edges.filter(edge => edge.source === id);
    
    if (connectedEdges.length > 0) {
      setNodes((nds) =>
        nds.map((node) => {
          const isConnected = connectedEdges.some(edge => edge.target === node.id);
          if (isConnected && node.type === 'generate') {
            return {
              ...node,
              data: { ...node.data, promptText: value },
            };
          }
          return node;
        })
      );
    }
  };

  const handleDuplicate = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const currentNode = nodes.find(n => n.id === id);
    
    if (!currentNode) return;

    const newNode = {
      ...currentNode,
      id: `prompt-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data },
    };

    const outgoingEdges = edges.filter(e => e.source === id);
    const newEdges = outgoingEdges.map(edge => ({
      ...edge,
      id: `edge-${Date.now()}-${Math.random()}`,
      source: newNode.id,
    }));

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, ...newEdges]);
    toast.success('Node duplicated!');
    setShowMenu(false);
  };

  const handleReset = () => {
    setPrompt('');
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, text: '' } }
          : node
      )
    );
    toast.success('Prompt cleared!');
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
  const isConnected = edges.some(edge => edge.source === id);

  return (
    <div className={`min-w-[280px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl transition-all ${selected ? 'ring-2 ring-[#8b7355]' : ''}`}>
      {/* Node Resizer */}
      <NodeResizer
        color="#8b5cf6"
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
        <div className="node-header-icon bg-purple-500/20">
          <Icon icon="ph:chat-text-fill" className="w-4 h-4 text-purple-400" />
        </div>
        <span className="node-header-title">Prompt</span>
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
                <button
                  onClick={handleDuplicate}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate Node
                </button>
                
                <button
                  onClick={handleReset}
                  disabled={!prompt}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear Prompt
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
      <div className="node-content h-full flex flex-col">
        <textarea
          value={prompt}
          onChange={handleChange}
          placeholder="Describe your desired output..."
          className="w-full flex-1 min-h-[120px] bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none transition-all"
          maxLength={2000}
        />
        <div className="text-right text-xs text-gray-600 mt-1">
          {prompt.length} / 2000
        </div>
      </div>

      {/* Output Handle - RIGHT ONLY */}
      <div
        className={`react-flow__handle react-flow__handle-right handle-prompt ${isConnected ? 'connected' : ''}`}
        style={{ 
          position: 'absolute',
          right: '-6px',
          top: '50%',
          transform: 'translateY(-50%)'
        }}
        data-handleid="prompt"
        data-nodeid={id}
        data-handlepos="right"
      />
    </div>
  );
}
