'use client';

import { useState, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Play, Loader2, Download, Copy, Trash2, RefreshCw, X, Settings } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useCredits } from '@/lib/contexts/CreditsContext';

export function GenerateNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const { deductCredits, refreshCredits, addCredits } = useCredits();
  const [showMenu, setShowMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Reactive to data changes
  const status = data.status || 'idle';
  const result = data.generatedImage || null;
  const isRunning = status === 'processing';
  const aspectRatio = data.aspectRatio || '16:9';
  const resolution = data.resolution || '2K';
  const model = data.model || 'gemini-3-pro';
  
  // Calculate preview height based on aspect ratio
  const getPreviewHeight = (ratio: string) => {
    const heightMap: Record<string, string> = {
      '16:9': 'h-[169px]',
      '1:1': 'h-[300px]',
      '4:3': 'h-[225px]',
      '9:16': 'h-[533px]',
      '21:9': 'h-[129px]',
    };
    return heightMap[ratio] || 'h-[180px]';
  };
  
  const previewHeight = getPreviewHeight(aspectRatio);

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
      if (result.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = result;
        link.download = `thumbnail-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Image downloaded!');
      } else {
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

    const newNode = {
      ...currentNode,
      id: `generate-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data, generatedImage: null, status: 'idle' },
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
          ? { ...node, data: { ...node.data, generatedImage: null, status: 'idle' } }
          : node
      )
    );
    toast.success('Result cleared!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    toast.success('Node deleted!');
    setShowMenu(false);
  };

  const handleRun = async () => {
    if (isRunning) {
      toast.error('Generation already in progress');
      return;
    }

    const hasReferenceImage = !!data.referenceImageUrl;
    const hasSourceImage = !!data.sourceImageUrl;
    const hasPrompt = !!data.promptText;

    if (!hasReferenceImage && !hasSourceImage) {
      toast.error('Connect at least one image to get started');
      return;
    }

    if ((hasReferenceImage && !hasSourceImage) || (!hasReferenceImage && hasSourceImage)) {
      if (!hasPrompt) {
        toast.error('Add a prompt to bring your vision to life');
        return;
      }
    }

    const CREDIT_COSTS: Record<string, Record<string, number>> = {
      'gemini-2-flash': { '720p': 20, '1080p': 30, '2K': 40, '4K': 50 },
      'gemini-3-pro': { '720p': 30, '1080p': 40, '2K': 50, '4K': 60 },
      'banana-pro': { '720p': 35, '1080p': 45, '2K': 50, '4K': 70 },
    };
    
    const creditCost = CREDIT_COSTS[model]?.[resolution] || 50;

    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, status: 'processing' } }
          : node
      )
    );

    const deducted = await deductCredits(creditCost);
    if (!deducted) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, status: 'idle' } }
            : node
        )
      );
      toast.error('Not enough credits. Upgrade to keep creating!');
      return;
    }

    try {
      const requestBody: any = {
        prompt: data.promptText || 'Create a professional, eye-catching image',
        model: model,
        aspectRatio: aspectRatio,
        resolution: resolution,
      };

      if (hasReferenceImage && hasSourceImage) {
        requestBody.referenceImage = data.referenceImageUrl;
        requestBody.sourceImages = [data.sourceImageUrl];
      } else if (hasSourceImage) {
        requestBody.referenceImage = data.sourceImageUrl;
        requestBody.sourceImages = [data.sourceImageUrl];
      } else if (hasReferenceImage) {
        requestBody.referenceImage = data.referenceImageUrl;
        requestBody.sourceImages = [data.referenceImageUrl];
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      const generatedImageUrl = result.images?.[0];

      if (generatedImageUrl) {
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
        
        await refreshCredits();
        toast.success('✨ Amazing! Your image is ready');
      } else {
        throw new Error('No image returned from API');
      }
    } catch (error) {
      console.error('❌ Generation error:', error);
      
      await addCredits(creditCost);
      await refreshCredits();
      
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, status: 'error' } }
            : node
        )
      );
      
      toast.error('Oops! Something went wrong. No worries, try again!');
    }
  };

  // Check which handles are connected
  const edges = getEdges();
  const hasReferenceConnection = edges.some(e => e.target === id && e.targetHandle === 'reference');
  const hasSourceConnection = edges.some(e => e.target === id && e.targetHandle === 'source');
  const hasPromptConnection = edges.some(e => e.target === id && e.targetHandle === 'prompt');
  const hasOutputConnection = edges.some(e => e.source === id);

  return (
    <div className={`min-w-[300px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl transition-all ${selected ? 'ring-2 ring-[#8b7355]' : ''}`}>
      {/* Node Resizer */}
      <NodeResizer
        color="#06b6d4"
        isVisible={selected}
        minWidth={300}
        minHeight={250}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 4,
        }}
      />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-icon bg-gradient-to-br from-orange-500/20 to-red-500/20">
          <Icon icon="ph:magic-wand-fill" className="w-4 h-4 text-orange-400" />
        </div>
        <span className="node-header-title">Generate</span>
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
                {result && (
                  <>
                    <button
                      onClick={handleDownload}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download Image
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
                  disabled={!result}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear Result
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
        {result ? (
          <div className="relative group">
            <img
              src={result}
              alt="Generated"
              className={`w-full ${previewHeight} object-cover rounded-lg cursor-pointer`}
              onClick={() => setShowFullscreen(true)}
            />
            <button
              onClick={() => setShowFullscreen(true)}
              className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Icon icon="ph:arrows-out-fill" className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-2 px-3 bg-[#0f0f0f] rounded-lg">
              <span className="text-gray-400">Reference</span>
              <span className={data.referenceImageUrl ? "text-orange-400" : "text-gray-600"}>
                {data.referenceImageUrl ? "✓ Connected" : "Optional"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-[#0f0f0f] rounded-lg">
              <span className="text-gray-400">Source</span>
              <span className={data.sourceImageUrl ? "text-blue-400" : "text-gray-600"}>
                {data.sourceImageUrl ? "✓ Connected" : "Required"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-[#0f0f0f] rounded-lg">
              <span className="text-gray-400">Prompt</span>
              <span className={data.promptText ? "text-purple-400" : "text-gray-600"}>
                {data.promptText ? "✓ Connected" : "Optional"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="node-footer">
        <span className="text-xs text-gray-600">{aspectRatio} • {resolution}</span>
        <button className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1">
          <Settings className="w-3 h-3" />
          Settings
        </button>
      </div>

      {/* Run Button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 border border-orange-500/30 rounded-lg text-orange-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Generate
            </>
          )}
        </button>
      </div>

      {/* Input Handles - LEFT (3 handles) */}
      <div
        className={`react-flow__handle react-flow__handle-left handle-reference ${hasReferenceConnection ? 'connected' : ''}`}
        style={{ top: '30%', left: '-6px', position: 'absolute' }}
        data-handleid="reference"
        data-nodeid={id}
        data-handlepos="left"
      />
      <div
        className={`react-flow__handle react-flow__handle-left handle-source ${hasSourceConnection ? 'connected' : ''}`}
        style={{ top: '50%', left: '-6px', position: 'absolute' }}
        data-handleid="source"
        data-nodeid={id}
        data-handlepos="left"
      />
      <div
        className={`react-flow__handle react-flow__handle-left handle-prompt ${hasPromptConnection ? 'connected' : ''}`}
        style={{ top: '70%', left: '-6px', position: 'absolute' }}
        data-handleid="prompt"
        data-nodeid={id}
        data-handlepos="left"
      />

      {/* Output Handle - RIGHT */}
      <div
        className={`react-flow__handle react-flow__handle-right handle-output ${hasOutputConnection ? 'connected' : ''}`}
        style={{ top: '50%', right: '-6px', position: 'absolute' }}
        data-handleid="output"
        data-nodeid={id}
        data-handlepos="right"
      />

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {showFullscreen && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center"
            style={{ zIndex: 99999 }}
            onClick={() => setShowFullscreen(false)}
          >
            <button
              onClick={() => setShowFullscreen(false)}
              className="fixed top-6 right-6 text-white hover:text-gray-300 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-3"
              style={{ zIndex: 100001 }}
            >
              <X className="w-8 h-8" />
            </button>

            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={result}
              alt="Generated - Fullscreen"
              className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            
            <button
              onClick={handleDownload}
              className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-all shadow-lg"
              style={{ zIndex: 100001 }}
            >
              <Download className="w-5 h-5" />
              Download Image
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
