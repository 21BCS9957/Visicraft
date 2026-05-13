'use client';

import { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Zap, Play, Loader2, Download, Copy, Trash2, RefreshCw, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { executeGeneration } from '@/lib/workflow/generateNode';
import { collectReferenceImageUrls } from '@/lib/workflow/collectReferenceUrls';
import { SmartHandle } from '../SmartHandle';
import { useWorkflow } from '../WorkflowContext';

export function GenerateNode({ data, selected, id }: NodeProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { getNodes, getEdges } = useReactFlow();
  const { updateNodeData, setNodes, setEdges, getLatestNodes, getLatestEdges, isGenerationRunning } = useWorkflow();
  const { credits, deductCredits, refreshCredits, addCredits } = useCredits();
  const [showMenu, setShowMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const status = data.status || 'idle';
  const result = data.generatedImage || null;
  const isThisNodeProcessing = status === 'processing';
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
    if (!user) {
      router.push('/login?redirectTo=/workflow');
      return;
    }
    if (isGenerationRunning) {
      toast.error('A generation is already in progress');
      return;
    }

    const currentNodes = getLatestNodes();
    const currentEdges = getLatestEdges();
    let referenceImageUrls: string[];
    try {
      referenceImageUrls = collectReferenceImageUrls(currentEdges, currentNodes, id);
    } catch (collectErr) {
      const msg = collectErr instanceof Error ? collectErr.message : 'Reference collection failed';
      toast.error(msg, { id: `generate-${id}` });
      return;
    }

    toast.success(
      `Generating with ${referenceImageUrls.length} reference image(s)`,
      { id: `generate-info-${id}` }
    );

    let actualPromptText: string | null = null;
    currentEdges.forEach((edge) => {
      if (edge.target !== id || edge.targetHandle !== 'prompt') return;
      const sourceNode = currentNodes.find((n) => n.id === edge.source);
      if (sourceNode?.data && 'text' in sourceNode.data) {
        actualPromptText = (sourceNode.data as { text?: string }).text ?? null;
      }
    });

    try {
      await executeGeneration({
        nodeId: id,
        referenceImageUrls,
        promptText: actualPromptText,
        model: data.model || 'nano-banana-pro',
        aspectRatio: data.aspectRatio || '16:9',
        resolution: data.resolution || '2K',
        updateNodeData,
        credits,
        deductCredits,
        addCredits,
        refreshCredits,
      });
      toast.success('Amazing! Your image is ready', { id: `generate-${id}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Generation failed';
      toast.error(msg, { id: `generate-${id}` });
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        workflow-node-card workflow-node-generate
        group
        bg-[#1a1a1a]
        border-2 border-[#2a2a2a]
        rounded-2xl
        shadow-xl
        w-full
        h-full
        min-w-[320px]
        min-h-[300px]
        flex flex-col
        overflow-hidden
        transition-all
        ${selected ? 'ring-2 ring-cyan-500/50 border-cyan-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      {/* Node Resizer */}
      <NodeResizer
        color="#06b6d4"
        isVisible={false}
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
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Generate</h3>
              <p className="text-gray-500 text-xs">AI Image Generation</p>
            </div>
          </div>
          <div className="relative nodrag nopan" ref={menuRef}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="workflow-node-menu-button nodrag nopan text-[#666666] hover:text-white transition-colors"
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  transition={{ duration: 0.1 }}
                  className="workflow-node-menu nodrag nopan absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
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
      <div className="p-3 relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {result ? (
          <div className="relative flex-1 min-h-0 w-full rounded overflow-hidden">
            <img
              src={result}
              alt="Generated"
              className="absolute inset-0 w-full h-full object-cover cursor-pointer"
              loading="lazy"
              decoding="async"
              onClick={(e) => {
                e.stopPropagation();
                setShowFullscreen(true);
              }}
            />
            {/* Fullscreen button overlay */}
            {!isThisNodeProcessing && (
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
          <div className="border border-dashed border-[#ef4444]/30 rounded flex-1 w-full h-full flex flex-col items-center justify-center min-h-[150px]">
            <Zap className="w-8 h-8 text-[#ef4444]/50 mb-2" />
            <span className="text-xs text-[#666666]">Result will appear here</span>
            <span className="text-[10px] text-[#444444] mt-1">{aspectRatio}</span>
          </div>
        )}

        {/* Loading overlay when this node is generating */}
        {isThisNodeProcessing && (
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

      {/* Run Button — disabled when any generation is running (Create or Run Selected) */}
      <div className="px-3 pb-3">
        <button
          onClick={handleRun}
          disabled={isGenerationRunning}
          className="w-full flex items-center justify-center gap-2 py-2 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 rounded text-[#ef4444] text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isThisNodeProcessing ? (
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
          <div className={`text-xs text-center py-1 rounded ${status === 'complete' ? 'bg-green-500/10 text-green-500' :
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
