'use client';

import { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Zap, Play, Loader2, Download, Copy, Trash2, RefreshCw, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { SmartHandle } from '../SmartHandle';

export function GenerateNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const { deductCredits, refreshCredits, addCredits } = useCredits();
  const [showMenu, setShowMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // These need to be reactive to data changes
  const status = data.status || 'idle';
  const result = data.generatedImage || null;
  const isRunning = status === 'processing';
  const aspectRatio = data.aspectRatio || '16:9';
  
  // Calculate preview height based on aspect ratio
  const getPreviewHeight = (ratio: string) => {
    const heightMap: Record<string, string> = {
      '16:9': 'h-[169px]',   // 300px width * 9/16 = 169px
      '1:1': 'h-[300px]',    // Square
      '4:3': 'h-[225px]',    // 300px * 3/4 = 225px
      '9:16': 'h-[533px]',   // 300px * 16/9 = 533px (vertical)
      '21:9': 'h-[129px]',   // 300px * 9/21 = 129px (ultrawide)
    };
    return heightMap[ratio] || 'h-[180px]';
  };
  
  const previewHeight = getPreviewHeight(aspectRatio);
  
  // Debug log to see when data changes
  useEffect(() => {
    console.log('🔄 GenerateNode data updated:', {
      nodeId: id,
      status,
      hasResult: !!result,
      resultPreview: result ? result.substring(0, 50) + '...' : 'none'
    });
  }, [id, status, result]);

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
    // Prevent running if already processing
    if (isRunning) {
      toast.error('Generation already in progress');
      return;
    }

    // Get current edges to verify connections
    const currentEdges = getEdges();
    const connectedToThis = currentEdges.filter(e => e.target === id);
    
    // Verify actual connections and get data only from connected nodes
    let actualReferenceUrl: string | null = null;
    let actualSourceUrl: string | null = null;
    let actualPromptText: string | null = null;
    
    connectedToThis.forEach(edge => {
      const sourceNode = getNodes().find(n => n.id === edge.source);
      if (!sourceNode) return;
      
      if (edge.targetHandle === 'referenceImage') {
        // Only use uploaded images (supabaseUrl), not template examples
        actualReferenceUrl = sourceNode.data.supabaseUrl || null;
      } else if (edge.targetHandle === 'sourceImage') {
        actualSourceUrl = sourceNode.data.supabaseUrl || null;
      } else if (edge.targetHandle === 'prompt') {
        actualPromptText = sourceNode.data.text || null;
      }
    });

    // Fallback: Also check the node's own data (set by ImportNode on upload)
    if (!actualReferenceUrl && data.referenceImageUrl) {
      actualReferenceUrl = data.referenceImageUrl;
    }
    if (!actualSourceUrl && data.sourceImageUrl) {
      actualSourceUrl = data.sourceImageUrl;
    }
    if (!actualPromptText && data.promptText) {
      actualPromptText = data.promptText;
    }

    // PRODUCTION VALIDATION LOGIC
    // Rule 1: Must have at least one image
    if (!actualReferenceUrl && !actualSourceUrl) {
      toast.error('Connect at least one image (reference or source)');
      return;
    }

    // Rule 2: If no prompt provided, use a default one (don't block generation)
    if (!actualPromptText) {
      actualPromptText = 'Create a professional, eye-catching image with vibrant colors and sharp details';
    }

    // Calculate credit cost (default values if not set)
    const model = data.model || 'gemini-3-pro';
    const resolution = data.resolution || '2K';
    
    const CREDIT_COSTS: Record<string, Record<string, number>> = {
      'gemini-2-flash': { '720p': 20, '1080p': 30, '2K': 40, '4K': 50 },
      'gemini-3-pro': { '720p': 30, '1080p': 40, '2K': 50, '4K': 60 },
      'banana-pro': { '720p': 35, '1080p': 45, '2K': 50, '4K': 70 },
    };
    
    const creditCost = CREDIT_COSTS[model]?.[resolution] || 50;

    // Update status to processing FIRST (prevents double-clicks)
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, status: 'processing' } }
          : node
      )
    );

    // Deduct credits AFTER validation passes
    const deducted = await deductCredits(creditCost);
    if (!deducted) {
      // Revert status if credit deduction fails
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
      // Build request based on available inputs
      const requestBody: any = {
        prompt: actualPromptText,
        model: model,
        aspectRatio: data.aspectRatio || '16:9',
        resolution: resolution,
      };

      // Add images if available
      if (actualReferenceUrl && actualSourceUrl) {
        // Both images available - full transformation
        requestBody.referenceImage = actualReferenceUrl;
        requestBody.sourceImages = [actualSourceUrl];
      } else if (actualSourceUrl) {
        // Only source image - use it as both reference and source
        requestBody.referenceImage = actualSourceUrl;
        requestBody.sourceImages = [actualSourceUrl];
      } else if (actualReferenceUrl) {
        // Only reference image - use it as both
        requestBody.referenceImage = actualReferenceUrl;
        requestBody.sourceImages = [actualReferenceUrl];
      }

      // Call the API
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
        
        // Refresh credits to show updated balance
        await refreshCredits();
        
        toast.success('✨ Amazing! Your image is ready', { id: `generate-${id}` });
      } else {
        throw new Error('No image returned from API');
      }
    } catch (error) {
      console.error('❌ Generation error:', error);
      
      // Refund credits on error
      console.log('💰 Refunding credits due to generation failure:', creditCost);
      await addCredits(creditCost);
      await refreshCredits();
      
      // Update status to error
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, status: 'error' } }
            : node
        )
      );
      
      toast.error(
        'Oops! Something went wrong. No worries, try again!',
        { id: `generate-${id}` }
      );
    }
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
        transition-all
        ${selected ? 'ring-2 ring-cyan-500/50 border-cyan-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      {/* Node Resizer */}
      <NodeResizer
        color="#06b6d4"
        isVisible={selected}
        minWidth={320}
        minHeight={300}
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Generate</h3>
              <p className="text-gray-500 text-xs">AI Image Generation</p>
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
      </div>

      {/* Preview */}
      <div className="p-3 relative">
        {result ? (
          <div className="relative">
            <img
              src={result}
              alt="Generated"
              className={`w-full ${previewHeight} object-cover rounded cursor-pointer`}
              loading="lazy"
              decoding="async"
              onClick={(e) => {
                e.stopPropagation();
                setShowFullscreen(true);
              }}
            />
            {/* Fullscreen button overlay */}
            {!isRunning && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullscreen(true);
                }}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-2 rounded-lg opacity-0 hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className={`border border-dashed border-[#ef4444]/30 rounded ${previewHeight} flex flex-col items-center justify-center`}>
            <Zap className="w-8 h-8 text-[#ef4444]/50 mb-2" />
            <span className="text-xs text-[#666666]">Result will appear here</span>
            <span className="text-[10px] text-[#444444] mt-1">{aspectRatio}</span>
          </div>
        )}
        
        {/* Loading overlay - shows on top of image or placeholder */}
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

      {/* Fullscreen Modal */}
      {showFullscreen && result && ReactDOM.createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-8"
            style={{ zIndex: 99999999 }}
            onClick={() => setShowFullscreen(false)}
          >
            {/* Close button */}
            <button
              onClick={() => setShowFullscreen(false)}
              className="fixed top-8 right-8 text-white hover:text-gray-300 transition-colors bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full p-3 border border-white/20"
              style={{ zIndex: 100000001 }}
            >
              <X className="w-6 h-6" />
            </button>

            {/* Image - centered with padding */}
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={result}
              alt="Generated - Fullscreen"
              className="max-w-[85vw] max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
              style={{ zIndex: 100000000 }}
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Download button */}
            <button
              onClick={handleDownload}
              className="fixed bottom-8 right-8 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-2xl border border-white/20"
              style={{ zIndex: 100000001 }}
            >
              <Download className="w-5 h-5" />
              Download Image
            </button>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

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
              Creating...
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Create
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

      {/* Input Handles */}
      <SmartHandle
        nodeId={id}
        handleId="referenceImage"
        handleType="reference"
        type="target"
        position={Position.Left}
        style={{ top: '35%' }}
      />
      
      <SmartHandle
        nodeId={id}
        handleId="sourceImage"
        handleType="source"
        type="target"
        position={Position.Left}
        style={{ top: '35%', opacity: 0, pointerEvents: 'none' }}
      />
      
      <SmartHandle
        nodeId={id}
        handleId="prompt"
        handleType="prompt"
        type="target"
        position={Position.Left}
        style={{ top: '65%' }}
      />

      {/* Output Handle */}
      <SmartHandle
        nodeId={id}
        handleId="generatedImage"
        handleType="output"
        type="source"
        position={Position.Right}
        style={{ top: '50%' }}
      />
    </motion.div>
  );
}
