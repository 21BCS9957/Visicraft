'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { MoreVertical, MessageSquare, Copy, Trash2, RefreshCw } from 'lucide-react';
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
    
    // Update node data properly using setNodes
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          // Also update connected Generate nodes
          const edges = getEdges();
          const connectedEdges = edges.filter(edge => edge.source === id);
          
          // Log for debugging
          if (connectedEdges.length > 0) {
            console.log('🔗 Prompt updated, connected to:', connectedEdges.length, 'node(s)');
          }
          
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
            console.log('✅ Updated Generate node prompt:', value.substring(0, 50) + '...');
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

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        bg-[#1a1a2e]
        border border-[#2a2a4a]
        rounded-lg
        shadow-xl
        min-w-[280px]
        ${selected ? 'ring-2 ring-[#8b5cf6] ring-opacity-50' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#2a2a4a]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#8b5cf6]" />
          <span className="text-[13px] text-white font-medium">Prompt</span>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="text-[#666666] hover:text-white transition-colors"
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

      {/* Textarea */}
      <div className="p-3">
        <textarea
          value={prompt}
          onChange={handleChange}
          placeholder="Enter your prompt... (e.g., 'Make it vibrant with dramatic lighting')"
          maxLength={2000}
          className="
            w-full h-[120px]
            bg-[#0f0f1f]
            border border-[#2a2a4a]
            rounded
            px-3 py-2
            text-xs text-white
            placeholder:text-[#666666]
            focus:outline-none focus:border-[#8b5cf6]
            resize-none
          "
        />
        <div className="text-right text-[10px] text-[#666666] mt-1">
          {prompt.length} / 2000 characters
        </div>
      </div>

      {/* Output Handle with Label */}
      <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 pl-2">
        <div className="text-[10px] text-[#8b5cf6] whitespace-nowrap font-medium">
          ← Text
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="!w-3 !h-3 !bg-[#8b5cf6] !border-2 !border-black"
      />
    </motion.div>
  );
}
