'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Play, Loader2 } from 'lucide-react';
import { useReactFlow } from 'reactflow';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';

interface PropertiesPanelProps {
  selectedNode: any;
  onClose: () => void;
}

const MODELS = [
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro Image', icon: '🍌' },
  { id: 'gemini-2-flash', name: 'Gemini 2 Flash', icon: '⚡' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', icon: '🔷' },
];

const ASPECT_RATIOS = [
  { id: '16:9', name: '16:9 (YouTube)', icon: '⬜' },
  { id: '1:1', name: '1:1 (Square)', icon: '🟦' },
  { id: '4:3', name: '4:3 (Classic)', icon: '📺' },
  { id: '9:16', name: '9:16 (Vertical)', icon: '📱' },
  { id: '21:9', name: '21:9 (Ultrawide)', icon: '🖥️' },
];

const RESOLUTIONS = [
  { id: '4k', name: '4K (3840x2160)', icon: '🎬' },
  { id: '2k', name: '2K (2560x1440)', icon: '📹' },
  { id: '1080p', name: '1080p (1920x1080)', icon: '🎥' },
  { id: '720p', name: '720p (1280x720)', icon: '📷' },
];

export function PropertiesPanel({ selectedNode, onClose }: PropertiesPanelProps) {
  const { setNodes } = useReactFlow();
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  
  const modelRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef<HTMLDivElement>(null);
  
  if (!selectedNode) return null;

  const isGenerateNode = selectedNode.type === 'generate';
  const isRunning = selectedNode.data?.status === 'processing';
  
  // Get current settings or defaults
  const currentModel = selectedNode.data?.model || 'gemini-3-pro';
  const currentAspect = selectedNode.data?.aspectRatio || '16:9';
  const currentResolution = selectedNode.data?.resolution || '2k';

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
      if (aspectRef.current && !aspectRef.current.contains(event.target as Node)) {
        setShowAspectMenu(false);
      }
      if (resolutionRef.current && !resolutionRef.current.contains(event.target as Node)) {
        setShowResolutionMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModelChange = (modelId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, model: modelId } }
          : node
      )
    );
    setShowModelMenu(false);
    toast.success(`Model changed to ${MODELS.find(m => m.id === modelId)?.name}`);
  };

  const handleAspectChange = (aspectId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, aspectRatio: aspectId } }
          : node
      )
    );
    setShowAspectMenu(false);
    toast.success(`Aspect ratio changed to ${aspectId}`);
  };

  const handleResolutionChange = (resolutionId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, resolution: resolutionId } }
          : node
      )
    );
    setShowResolutionMenu(false);
    toast.success(`Resolution changed to ${RESOLUTIONS.find(r => r.id === resolutionId)?.name}`);
  };

  const handleRunNode = async () => {
    if (!isGenerateNode || isRunning) return;

    console.log('🎯 Properties Panel - Node Data:', {
      nodeId: selectedNode.id,
      referenceImageUrl: selectedNode.data?.referenceImageUrl,
      sourceImageUrl: selectedNode.data?.sourceImageUrl,
      promptText: selectedNode.data?.promptText,
      model: currentModel,
      aspectRatio: currentAspect,
      resolution: currentResolution,
    });

    if (!selectedNode.data?.referenceImageUrl || !selectedNode.data?.sourceImageUrl) {
      toast.error('Connect both reference and source images first');
      return;
    }

    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, status: 'processing' } }
          : node
      )
    );

    try {
      toast.loading('Generating thumbnail...', { id: `generate-${selectedNode.id}` });

      const requestBody = {
        referenceImageUrl: selectedNode.data.referenceImageUrl,
        sourceImageUrls: [selectedNode.data.sourceImageUrl],
        prompt: selectedNode.data.promptText || 'Create a professional YouTube thumbnail',
      };

      console.log('📤 API Request:', requestBody);

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
        setNodes((nds) =>
          nds.map((node) =>
            node.id === selectedNode.id
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
        toast.success('Thumbnail generated!', { id: `generate-${selectedNode.id}` });
      } else {
        throw new Error('No image returned from API');
      }
    } catch (error) {
      console.error('❌ Generation error:', error);
      
      setNodes((nds) =>
        nds.map((node) =>
          node.id === selectedNode.id
            ? { ...node, data: { ...node.data, status: 'error' } }
            : node
        )
      );
      
      toast.error(
        error instanceof Error ? error.message : 'Generation failed',
        { id: `generate-${selectedNode.id}` }
      );
    }
  };

  const selectedModel = MODELS.find(m => m.id === currentModel) || MODELS[0];
  const selectedAspect = ASPECT_RATIOS.find(a => a.id === currentAspect) || ASPECT_RATIOS[0];
  const selectedResolution = RESOLUTIONS.find(r => r.id === currentResolution) || RESOLUTIONS[1];

  return (
    <div className="w-[280px] bg-[#0f0f0f] border-l border-[#1a1a1a] flex flex-col">
      <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
        <h2 className="text-white font-medium text-sm">Properties</h2>
        <button
          onClick={onClose}
          className="text-[#666666] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Type Header */}
        <div>
          <div className="flex items-center justify-between mb-2 text-[#a0a0a0] text-xs">
            <span>
              {selectedNode.type === 'generate' && '🍌 Gemini Pro'}
              {selectedNode.type === 'import' && '📷 Image Import'}
              {selectedNode.type === 'prompt' && '💬 Text Prompt'}
              {selectedNode.type === 'output' && '🖥️ Output Display'}
            </span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {/* Generate Node Settings */}
        {selectedNode.type === 'generate' && (
          <>
            {/* Model Dropdown */}
            <div>
              <label className="block text-[#a0a0a0] text-xs mb-2">Model</label>
              <div className="relative" ref={modelRef}>
                <button
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-left text-white text-sm flex items-center justify-between hover:border-[#3a3a3a] transition-colors"
                >
                  <span>{selectedModel.icon} {selectedModel.name}</span>
                  <ChevronDown className="w-4 h-4 text-[#666666]" />
                </button>
                
                <AnimatePresence>
                  {showModelMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelChange(model.id)}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[#2a2a2a] transition-colors ${
                            model.id === currentModel ? 'bg-[#2a2a2a] text-white' : 'text-[#a0a0a0]'
                          }`}
                        >
                          <span>{model.icon}</span>
                          <span>{model.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Aspect Ratio Dropdown */}
            <div>
              <label className="block text-[#a0a0a0] text-xs mb-2">Aspect Ratio</label>
              <div className="relative" ref={aspectRef}>
                <button
                  onClick={() => setShowAspectMenu(!showAspectMenu)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-left text-white text-sm flex items-center justify-between hover:border-[#3a3a3a] transition-colors"
                >
                  <span>{selectedAspect.icon} {selectedAspect.name}</span>
                  <ChevronDown className="w-4 h-4 text-[#666666]" />
                </button>
                
                <AnimatePresence>
                  {showAspectMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      {ASPECT_RATIOS.map((aspect) => (
                        <button
                          key={aspect.id}
                          onClick={() => handleAspectChange(aspect.id)}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[#2a2a2a] transition-colors ${
                            aspect.id === currentAspect ? 'bg-[#2a2a2a] text-white' : 'text-[#a0a0a0]'
                          }`}
                        >
                          <span>{aspect.icon}</span>
                          <span>{aspect.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Resolution Dropdown */}
            <div>
              <label className="block text-[#a0a0a0] text-xs mb-2">Resolution</label>
              <div className="relative" ref={resolutionRef}>
                <button
                  onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-left text-white text-sm flex items-center justify-between hover:border-[#3a3a3a] transition-colors"
                >
                  <span>{selectedResolution.icon} {selectedResolution.name}</span>
                  <ChevronDown className="w-4 h-4 text-[#666666]" />
                </button>
                
                <AnimatePresence>
                  {showResolutionMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      {RESOLUTIONS.map((resolution) => (
                        <button
                          key={resolution.id}
                          onClick={() => handleResolutionChange(resolution.id)}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[#2a2a2a] transition-colors ${
                            resolution.id === currentResolution ? 'bg-[#2a2a2a] text-white' : 'text-[#a0a0a0]'
                          }`}
                        >
                          <span>{resolution.icon}</span>
                          <span>{resolution.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Status */}
            {selectedNode.data?.status && selectedNode.data.status !== 'idle' && (
              <div>
                <label className="block text-[#a0a0a0] text-xs mb-2">Status</label>
                <div className={`text-xs px-3 py-2 rounded ${
                  selectedNode.data.status === 'processing' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                  selectedNode.data.status === 'complete' ? 'bg-green-500/10 text-green-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  {selectedNode.data.status === 'processing' && 'Generating...'}
                  {selectedNode.data.status === 'complete' && '✓ Complete'}
                  {selectedNode.data.status === 'error' && '✗ Error'}
                </div>
              </div>
            )}

            {/* Run Button */}
            <div className="pt-2">
              <button
                onClick={handleRunNode}
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" fill="currentColor" />
                    Run This Node
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* Import Node Settings */}
        {selectedNode.type === 'import' && (
          <div>
            <label className="block text-[#a0a0a0] text-xs mb-2">Image Source</label>
            <div className="text-xs text-[#666666]">
              {selectedNode.data?.imageUrl ? 'Image uploaded' : 'No image selected'}
            </div>
          </div>
        )}

        {/* Prompt Node Settings */}
        {selectedNode.type === 'prompt' && (
          <div>
            <label className="block text-[#a0a0a0] text-xs mb-2">Prompt Text</label>
            <div className="text-xs text-[#666666]">
              {selectedNode.data?.text?.length || 0} characters
            </div>
          </div>
        )}

        {/* Output Node Settings */}
        {selectedNode.type === 'output' && (
          <div>
            <label className="block text-[#a0a0a0] text-xs mb-2">Results</label>
            <div className="text-xs text-[#666666]">
              {selectedNode.data?.images?.length || 0} image(s)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
