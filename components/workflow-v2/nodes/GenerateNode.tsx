'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { MoreVertical, Zap, Play, Loader2, Download, Copy, Trash2, RefreshCw, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useCredits } from '@/lib/contexts/CreditsContext';

export function GenerateNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const { deductCredits, refreshCredits } = useCredits();
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
    if (isRunning) return;

    // Flexible validation: Need at least ONE image (reference OR source) AND a prompt
    const hasReferenceImage = !!data.referenceImageUrl;
    const hasSourceImage = !!data.sourceImageUrl;
    const hasPrompt = !!data.promptText;

    console.log('🎯 Generate Node Validation:', {
      nodeId: id,
      hasReferenceImage,
      hasSourceImage,
      hasPrompt,
    });

    // Validation: Need at least one image
    if (!hasReferenceImage && !hasSourceImage) {
      toast.error('Connect at least one image (reference or source)');
      return;
    }

    // Validation: If only one image, must have prompt
    if ((hasReferenceImage && !hasSourceImage) || (!hasReferenceImage && hasSourceImage)) {
      if (!hasPrompt) {
        toast.error('When using only one image, a prompt is required');
        return;
      }
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
    
    console.log('💳 Credit cost for generation:', creditCost);

    // Deduct credits BEFORE generation
    const deducted = await deductCredits(creditCost);
    if (!deducted) {
      toast.error(`Insufficient credits! Need ${creditCost} credits`);
      return;
    }

    console.log('✅ Credits deducted:', creditCost);

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

      // Build request based on available inputs
      const requestBody: any = {
        prompt: data.promptText || 'Create a professional, eye-catching image',
        model: model,
        aspectRatio: data.aspectRatio || '16:9',
        resolution: resolution,
      };

      // Add images if available
      if (hasReferenceImage && hasSourceImage) {
        // Both images available - full transformation
        requestBody.referenceImage = data.referenceImageUrl;
        requestBody.sourceImages = [data.sourceImageUrl];
        console.log('📤 Mode: Full transformation (reference + source + prompt)');
      } else if (hasSourceImage) {
        // Only source image - use it as both reference and source
        requestBody.referenceImage = data.sourceImageUrl;
        requestBody.sourceImages = [data.sourceImageUrl];
        console.log('📤 Mode: Source + Prompt (using source as reference too)');
      } else if (hasReferenceImage) {
        // Only reference image - use it as both
        requestBody.referenceImage = data.referenceImageUrl;
        requestBody.sourceImages = [data.referenceImageUrl];
        console.log('📤 Mode: Reference + Prompt (using reference as source too)');
      }

      console.log('📤 API Request:', requestBody);

      // Call the API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      console.log('📥 API Response:', { status: response.status, result });
      console.log('📥 Generated images:', result.images);
      console.log('📥 First image URL:', result.images?.[0]);

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      const generatedImageUrl = result.images?.[0];
      console.log('✅ Setting generatedImageUrl:', generatedImageUrl);

      if (generatedImageUrl) {
        console.log('📝 Updating node with generated image...');
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
        
        console.log('✅ Node updated successfully');
        
        // Refresh credits to show updated balance
        await refreshCredits();
        
        toast.success('Thumbnail generated!', { id: `generate-${id}` });
      } else {
        throw new Error('No image returned from API');
      }
    } catch (error) {
      console.error('❌ Generation error:', error);
      
      // Refund credits on error
      // Note: You might want to implement a refund function in CreditsContext
      console.log('⚠️ Generation failed, credits were already deducted');
      
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
        group
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-[13px] text-white font-medium">AI Generate</span>
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
      <div className="p-3 relative">
        {result ? (
          <div className="relative">
            <img
              src={result}
              alt="Generated"
              className={`w-full ${previewHeight} object-cover rounded cursor-pointer`}
              onClick={() => setShowFullscreen(true)}
            />
            {/* Fullscreen button overlay */}
            {!isRunning && (
              <button
                onClick={() => setShowFullscreen(true)}
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
      <AnimatePresence>
        {showFullscreen && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black flex items-center justify-center"
            style={{ zIndex: 99999 }}
            onClick={() => setShowFullscreen(false)}
          >
            {/* Close button */}
            <button
              onClick={() => setShowFullscreen(false)}
              className="fixed top-6 right-6 text-white hover:text-gray-300 transition-colors bg-black/50 hover:bg-black/70 rounded-full p-3"
              style={{ zIndex: 100001 }}
            >
              <X className="w-8 h-8" />
            </button>

            {/* Image - fills most of the screen */}
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={result}
              alt="Generated - Fullscreen"
              className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Download button */}
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

      {/* Input Handles - Only 2 handles */}
      {/* Images Handle (accepts both reference and source) */}
      <div className="absolute left-0 top-[35%] -translate-x-full -translate-y-1/2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] text-[#f97316] whitespace-nowrap font-medium">
          Images (Reference/Source) →
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="referenceImage"
        style={{ top: '35%' }}
        className="!w-3 !h-3 !bg-[#f97316] !border-2 !border-black"
      />
      
      {/* Also accept source images on the same handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="sourceImage"
        style={{ top: '35%' }}
        className="!w-3 !h-3 !bg-[#f97316] !border-2 !border-black !opacity-0 pointer-events-none"
      />
      
      {/* Prompt Handle */}
      <div className="absolute left-0 top-[65%] -translate-x-full -translate-y-1/2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] text-[#06b6d4] whitespace-nowrap font-medium">
          Prompt (optional) →
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        style={{ top: '65%' }}
        className="!w-3 !h-3 !bg-[#06b6d4] !border-2 !border-black"
      />

      {/* Output Handle with Label */}
      <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
