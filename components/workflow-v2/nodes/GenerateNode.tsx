'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { MoreVertical, Zap, Play, Loader2, Download, Copy, Trash2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export function GenerateNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = data.status || 'idle';
  const result = data.generatedImage || null;
  const isRunning = status === 'processing';

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
    if (!result) {
      toast.error('No image to download');
      return;
    }

    try {
      // If it's a base64 data URL
      if (result.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = result;
        link.download = `thumbnail-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Image downloaded!');
      } else {
        // If it's a URL, fetch and download
        const response = await fetch(result);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `thumbnail-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Image downloaded!');
      }
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

    // Create new node with offset position
    const newNode = {
      ...currentNode,
      id: `generate-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: {
        ...currentNode.data,
        status: 'idle',
        generatedImage: null,
      },
    };

    // Duplicate incoming connections
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
          ? {
              ...node,
              data: {
                ...node.data,
                status: 'idle',
                generatedImage: null,
              },
            }
          : node
      )
    );
    toast.success('Node reset!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    // Remove node
    setNodes((nds) => nds.filter((node) => node.id !== id));
    
    // Remove connected edges
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    
    toast.success('Node deleted!');
    setShowMenu(false);
  };

  const handleRun = async () => {
    if (isRunning) return;

    // Validate inputs with detailed logging
    console.log('🎯 Generate Node Data:', {
      nodeId: id,
      referenceImageUrl: data.referenceImageUrl,
      sourceImageUrl: data.sourceImageUrl,
      promptText: data.promptText,
    });

    if (!data.referenceImageUrl || !data.sourceImageUrl) {
      toast.error('Connect both reference and source images first');
      return;
    }

    // Update status to processing
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, status: 'processing' } }
          : node
      )
    );

    try {
      toast.loading('Generating thumbnail...', { id: `generate-${id}` });

      const requestBody = {
        referenceImageUrl: data.referenceImageUrl,
        sourceImageUrls: [data.sourceImageUrl],
        prompt: data.promptText || 'Create a professional YouTube thumbnail',
      };

      console.log('📤 API Request:', requestBody);

      // Call the API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      console.log('📥 API Response:', { status: response.status, result });

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      const generatedImageUrl = result.thumbnails?.[0];

      if (generatedImageUrl) {
        // Update node with generated image
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    generatedImage: generatedImageUrl,
                    status: 'complete',
                  },
                }
              : node
          )
        );
        toast.success('Thumbnail generated!', { id: `generate-${id}` });
      } else {
        throw new Error('No image returned from API');
      }
    } catch (error) {
      console.error('❌ Generation error:', error);
      
      // Update status to error
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, status: 'error' } }
            : node
        )
      );
      
      toast.error(
        error instanceof Error ? error.message : 'Generation failed',
        { id: `generate-${id}` }
      );
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        bg-[#2d1b1b]
        border-2 border-[#ef4444]/30
        rounded-lg
        shadow-2xl
        min-w-[300px]
        ${selected ? 'ring-2 ring-[#ef4444] ring-opacity-50' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#ef4444]/20">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#ef4444]/20 rounded flex items-center justify-center">
            <Zap className="w-3 h-3 text-[#ef4444]" />
          </div>
          <span className="text-[13px] text-white font-medium">Gemini Generate</span>
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
                  onClick={handleDownload}
                  disabled={!result}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Download Image
                </button>
                
                <button
                  onClick={handleDuplicate}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate Node
                </button>
                
                <button
                  onClick={handleReset}
                  disabled={!result && status === 'idle'}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset Node
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

      {/* Preview */}
      <div className="p-3">
        {result ? (
          <div className="relative">
            <img
              src={result}
              alt="Generated"
              className="w-full h-[180px] object-cover rounded"
            />
            {isRunning && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Zap className="w-8 h-8 text-[#ef4444]" />
                </motion.div>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-[#ef4444]/30 rounded h-[180px] flex flex-col items-center justify-center">
            <Zap className="w-8 h-8 text-[#ef4444]/50 mb-2" />
            <span className="text-xs text-[#666666]">Result will appear here</span>
          </div>
        )}
      </div>

      {/* Run Button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-2 py-2 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 rounded text-[#ef4444] text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Run Generation
            </>
          )}
        </button>
      </div>

      {/* Status Badge */}
      {status !== 'idle' && status !== 'processing' && (
        <div className="px-3 pb-2">
          <div className={`text-xs text-center py-1 rounded ${
            status === 'complete' ? 'bg-green-500/10 text-green-500' :
            'bg-red-500/10 text-red-500'
          }`}>
            {status === 'complete' && '✓ Complete'}
            {status === 'error' && '✗ Error'}
          </div>
        </div>
      )}

      {/* Input Handles with Labels */}
      <div className="absolute left-0 top-[30%] -translate-x-full -translate-y-1/2 pr-2">
        <div className="text-[10px] text-[#f97316] whitespace-nowrap font-medium">
          Reference Image →
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="referenceImage"
        style={{ top: '30%' }}
        className="!w-3 !h-3 !bg-[#f97316] !border-2 !border-black"
      />
      
      <div className="absolute left-0 top-[50%] -translate-x-full -translate-y-1/2 pr-2">
        <div className="text-[10px] text-[#eab308] whitespace-nowrap font-medium">
          Source Image →
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="sourceImage"
        style={{ top: '50%' }}
        className="!w-3 !h-3 !bg-[#eab308] !border-2 !border-black"
      />
      
      <div className="absolute left-0 top-[70%] -translate-x-full -translate-y-1/2 pr-2">
        <div className="text-[10px] text-[#06b6d4] whitespace-nowrap font-medium">
          Prompt (optional) →
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        style={{ top: '70%' }}
        className="!w-3 !h-3 !bg-[#06b6d4] !border-2 !border-black"
      />

      {/* Output Handle with Label */}
      <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 pl-2">
        <div className="text-[10px] text-[#10b981] whitespace-nowrap font-medium">
          ← Generated
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="generatedImage"
        className="!w-3 !h-3 !bg-[#10b981] !border-2 !border-black"
      />
    </motion.div>
  );
}
