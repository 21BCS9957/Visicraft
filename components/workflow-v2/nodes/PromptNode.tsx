'use client';

import { useState, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, MessageSquare, Copy, Trash2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { SmartHandle } from '../SmartHandle';
import { useWorkflow } from '../WorkflowContext';

export function PromptNode({ data, selected, id }: NodeProps) {
  const { getNodes, getEdges } = useReactFlow();
  const { updateNodeData, setNodes, setEdges } = useWorkflow();
  const [prompt, setPrompt] = useState(data.text || '');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync when data.text changes from outside (e.g. restore from localStorage)
  useEffect(() => {
    const external = data.text || '';
    if (external !== prompt) setPrompt(external);
  }, [data.text]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Update this node's data via Canvas's React state (NOT useReactFlow)
    updateNodeData(id, { text: value });

    // Update connected Generate nodes
    const edges = getEdges();
    const connectedEdges = edges.filter(edge => edge.source === id);

    if (connectedEdges.length > 0) {
      console.log('🔗 Prompt updated, connected to:', connectedEdges.length, 'node(s)');
      connectedEdges.forEach(edge => {
        if (edge.target) {
          console.log('✅ Updated Generate node prompt:', value.substring(0, 50) + '...');
          updateNodeData(edge.target, { promptText: value });
        }
      });
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
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        group
        bg-[#1a1a1a]
        border-2 border-[#2a2a2a]
        rounded-2xl
        shadow-xl
        min-w-[320px]
        min-h-[400px]
        transition-all
        ${selected ? 'ring-2 ring-purple-500/50 border-purple-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      {/* Node Resizer - allows dragging bottom edge to resize */}
      <NodeResizer
        color="#8b5cf6"
        isVisible={selected}
        minWidth={320}
        minHeight={400}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 4,
        }}
      />
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 12H16M8 8H16M8 16H12M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Prompt</h3>
              <p className="text-gray-500 text-xs">Text Input</p>
            </div>
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
      </div>

      {/* Textarea */}
      <div className="p-4 h-full flex flex-col" style={{ minHeight: '300px' }}>
        <textarea
          value={prompt}
          onChange={handleChange}
          placeholder={data.placeholder || "Describe the style, mood, and composition you want.\nE.g. 'Professional product shot, soft studio lighting, clean white background, high detail, 8K resolution'"}
          className="
            w-full flex-1
            bg-[#0f0f0f]
            border-2 border-[#2a2a2a]
            rounded-lg
            px-3 py-2
            text-sm text-white
            placeholder:text-gray-600
            focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/30
            resize-none
            transition-all
            nodrag
          "
          maxLength={5000}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div className="text-right text-xs text-gray-600 mt-2">
          {prompt.length} / 5000 characters
        </div>
      </div>

      {/* Output Handle */}
      <SmartHandle
        nodeId={id}
        handleId="prompt"
        handleType="prompt"
        type="source"
        position={Position.Right}
        style={{ top: '50%' }}
      />
    </motion.div>
  );
}
