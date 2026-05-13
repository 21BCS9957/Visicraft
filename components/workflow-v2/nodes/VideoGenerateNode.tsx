'use client';

import { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Play, Loader2, Download, Copy, Trash2, RefreshCw, Maximize2, X, Clapperboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { executeVideoGeneration } from '@/lib/workflow/videoGenerateNode';
import { collectReferenceImageUrls } from '@/lib/workflow/collectReferenceUrls';
import { SmartHandle } from '../SmartHandle';
import { useWorkflow } from '../WorkflowContext';

export function VideoGenerateNode({ data, selected, id }: NodeProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { getNodes, getEdges } = useReactFlow();
  const { updateNodeData, setNodes, setEdges, getLatestNodes, getLatestEdges, isGenerationRunning } = useWorkflow();
  const { credits, deductCredits, refreshCredits, addCredits } = useCredits();
  const [showMenu, setShowMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const status = data.status || 'idle';
  const result = data.generatedVideo || null;
  const isThisNodeProcessing = status === 'processing';
  const videoProgress = data.videoProgress || 0;

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
      toast.error('No video to download');
      return;
    }
    try {
      if (result.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = result;
        link.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const response = await fetch(result);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      toast.success('Video downloaded!');
    } catch {
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
      id: `videoGenerate-${Date.now()}`,
      position: { x: currentNode.position.x + 50, y: currentNode.position.y + 50 },
      data: { ...currentNode.data, status: 'idle', generatedVideo: null, videoProgress: 0 },
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
          ? { ...node, data: { ...node.data, status: 'idle', generatedVideo: null, videoProgress: 0 } }
          : node
      )
    );
    toast.success('Node reset!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
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
    const referenceImageUrls = collectReferenceImageUrls(currentEdges, currentNodes, id);

    let actualPromptText: string | null = null;
    currentEdges.forEach((edge) => {
      if (edge.target !== id || edge.targetHandle !== 'prompt') return;
      const sourceNode = currentNodes.find((n) => n.id === edge.source);
      if (sourceNode?.data && 'text' in sourceNode.data) {
        actualPromptText = (sourceNode.data as { text?: string }).text ?? null;
      }
    });

    try {
      await executeVideoGeneration({
        nodeId: id,
        referenceImageUrls,
        promptText: actualPromptText,
        model: data.model || 'veo-2.0-generate-001',
        aspectRatio: data.aspectRatio || '16:9',
        duration: data.duration || '5s',
        resolution: data.resolution || '720p',
        updateNodeData,
        credits,
        deductCredits,
        addCredits,
        refreshCredits,
      });
      toast.success('Video generated!', { id: `videogen-${id}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Video generation failed';
      toast.error(msg, { id: `videogen-${id}` });
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        workflow-node-card workflow-node-video
        group bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl shadow-xl
        w-full h-full min-w-[320px] min-h-[300px] flex flex-col overflow-hidden transition-all
        ${selected ? 'ring-2 ring-purple-500/50 border-purple-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      <NodeResizer
        color="#a855f7"
        isVisible={selected}
        minWidth={320}
        minHeight={300}
        handleStyle={{ width: 8, height: 8, borderRadius: 4 }}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Clapperboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Video Generate</h3>
              <p className="text-gray-500 text-xs">AI Video Generation</p>
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-[#666666] hover:text-white transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

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
                    Download Video
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
            <video
              src={result}
              controls
              className="absolute inset-0 w-full h-full object-cover cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setShowFullscreen(true); }}
            />
            {!isThisNodeProcessing && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowFullscreen(true); }}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-2 rounded-lg opacity-0 hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-purple-500/30 rounded flex-1 w-full h-full flex flex-col items-center justify-center min-h-[150px]">
            <Clapperboard className="w-8 h-8 text-purple-500/50 mb-2" />
            <span className="text-xs text-[#666666]">Video will appear here</span>
          </div>
        )}

        {isThisNodeProcessing && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Clapperboard className="w-8 h-8 text-purple-400" />
            </motion.div>
            {videoProgress > 0 && (
              <div className="w-3/4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-500"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <p className="text-center text-[10px] text-purple-300 mt-1">{videoProgress}%</p>
              </div>
            )}
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
            <button
              onClick={() => setShowFullscreen(false)}
              className="fixed top-8 right-8 text-white hover:text-gray-300 transition-colors bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full p-3 border border-white/20"
              style={{ zIndex: 100000001 }}
            >
              <X className="w-6 h-6" />
            </button>
            <motion.video
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={result}
              controls
              autoPlay
              className="max-w-[85vw] max-h-[85vh] w-auto h-auto rounded-lg shadow-2xl"
              style={{ zIndex: 100000000 }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={handleDownload}
              className="fixed bottom-8 right-8 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-2xl border border-white/20"
              style={{ zIndex: 100000001 }}
            >
              <Download className="w-5 h-5" />
              Download Video
            </button>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Run Button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleRun}
          disabled={isGenerationRunning}
          className="w-full flex items-center justify-center gap-2 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isThisNodeProcessing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Create Video
            </>
          )}
        </button>
      </div>

      {/* Status Badge */}
      {status !== 'idle' && status !== 'processing' && (
        <div className="px-3 pb-2">
          <div className={`text-xs text-center py-1 rounded ${
            status === 'complete' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          }`}>
            {status === 'complete' && '✓ Complete'}
            {status === 'error' && '✗ Error'}
          </div>
        </div>
      )}

      {/* Input Handles */}
      <SmartHandle nodeId={id} handleId="referenceImage" handleType="reference" type="target" position={Position.Left} style={{ top: '35%' }} />
      <SmartHandle nodeId={id} handleId="prompt" handleType="prompt" type="target" position={Position.Left} style={{ top: '65%' }} />

      {/* Output Handle */}
      <SmartHandle nodeId={id} handleId="generatedVideo" handleType="output" type="source" position={Position.Right} style={{ top: '50%' }} />
    </motion.div>
  );
}
