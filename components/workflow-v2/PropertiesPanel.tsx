'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Play, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Icon } from '@iconify/react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useWorkflow } from './WorkflowContext';
import { getCreditCost } from '@/lib/credits/calculator';
import { executeGeneration } from '@/lib/workflow/generateNode';
import { executeVideoGeneration } from '@/lib/workflow/videoGenerateNode';
import { collectReferenceImageUrls } from '@/lib/workflow/collectReferenceUrls';

interface PropertiesPanelProps {
  selectedNode: any;
  onClose: () => void;
}

// AI Models with proper logos
const AI_MODELS = [
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Gemini 3 Pro',
    icon: 'emojione:banana',
    iconType: 'icon',
    color: '#FFD700',
  },
];

const ASPECT_RATIOS = [
  { id: '16:9', name: '16:9 (YouTube)', emoji: '⬜' },
  { id: '1:1', name: '1:1 (Square)', emoji: '🟦' },
  { id: '4:3', name: '4:3 (Classic)', emoji: '📺' },
  { id: '9:16', name: '9:16 (Vertical)', emoji: '📱' },
  { id: '21:9', name: '21:9 (Ultrawide)', emoji: '🖥️' },
];

const RESOLUTIONS = [
  { id: '4K', name: '4K (3840x2160)', emoji: '🎬' },
  { id: '2K', name: '2K (2560x1440)', emoji: '📹' },
  { id: '1080p', name: '1080p (1920x1080)', emoji: '🎥' },
  { id: '720p', name: '720p (1280x720)', emoji: '📷' },
];

const VIDEO_MODELS = [
  {
    id: 'veo-3.1-generate-001',
    name: 'Google Veo 3.1',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon' as const,
    color: '#4285F4',
  },
  {
    id: 'veo-2.0-generate-001',
    name: 'Google Veo 2.0',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon' as const,
    color: '#4285F4',
  },
  {
    id: 'veo-1.0',
    name: 'Google Veo 1.0',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon' as const,
    color: '#4285F4',
  },
  {
    id: 'runway-gen3',
    name: 'Runway Gen-3 Alpha',
    provider: 'Runway AI',
    icon: 'ph:video-camera-fill',
    iconType: 'icon' as const,
    color: '#000000',
  },
];

const VIDEO_ASPECT_RATIOS = [
  { id: '16:9', name: '16:9 (Landscape)', emoji: '⬜' },
  { id: '9:16', name: '9:16 (Portrait)', emoji: '📱' },
  { id: '1:1', name: '1:1 (Square)', emoji: '🟦' },
];

const VIDEO_DURATIONS = [
  { id: '4s', name: '4 Seconds' },
  { id: '6s', name: '6 Seconds' },
  { id: '8s', name: '8 Seconds' },
];

const VIDEO_RESOLUTIONS = [
  { id: '720p', name: '720p HD', emoji: '📷' },
  { id: '1080p', name: '1080p Full HD', emoji: '🎥' },
  { id: '4K', name: '4K Ultra HD', emoji: '🎬' },
];

const VIDEO_CREDIT_COST = 120;

export function PropertiesPanel({ selectedNode, onClose }: PropertiesPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const {
    updateNodeData: contextUpdateNodeData,
    getLatestNodes,
    getLatestEdges,
    isGenerationRunning,
  } = useWorkflow();
  const { credits, deductCredits, refreshCredits, addCredits } = useCredits();
  
  const isVideoNode = selectedNode?.type === 'videoGenerate';

  const defaultModel = isVideoNode ? 'veo-2.0-generate-001' : 'nano-banana-pro';
  const defaultResolution = isVideoNode ? '720p' : '1080p';

  const [selectedModel, setSelectedModel] = useState(selectedNode?.data?.model || defaultModel);
  const [selectedAspect, setSelectedAspect] = useState(selectedNode?.data?.aspectRatio || '16:9');
  const [selectedResolution, setSelectedResolution] = useState(selectedNode?.data?.resolution || defaultResolution);
  const [selectedDuration, setSelectedDuration] = useState(selectedNode?.data?.duration || '5s');
  
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const [showDurationMenu, setShowDurationMenu] = useState(false);
  
  const modelRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedNode?.data) {
      const isVideo = selectedNode.type === 'videoGenerate';
      const models = isVideo ? VIDEO_MODELS : AI_MODELS;
      const fallbackModel = isVideo ? 'veo-2.0-generate-001' : 'nano-banana-pro';
      const nextModel = models.some((model) => model.id === selectedNode.data.model)
        ? selectedNode.data.model
        : fallbackModel;
      setSelectedModel(nextModel);
      if (selectedNode.data.model && selectedNode.data.model !== nextModel) {
        contextUpdateNodeData(selectedNode.id, { model: nextModel });
      }
      setSelectedAspect(selectedNode.data.aspectRatio || '16:9');
      setSelectedResolution(selectedNode.data.resolution || (isVideo ? '720p' : '1080p'));
      setSelectedDuration(selectedNode.data.duration || '5s');
    }
  }, [selectedNode?.id, selectedNode?.type, selectedNode?.data?.model, selectedNode?.data?.aspectRatio, selectedNode?.data?.resolution, selectedNode?.data?.duration, contextUpdateNodeData]);

  const creditCost = isVideoNode ? VIDEO_CREDIT_COST : getCreditCost(selectedModel, selectedResolution);
  const hasEnoughCredits = credits >= creditCost;
  const isGenerating = selectedNode?.data?.status === 'processing';
  const runDisabled = !user ? false : (!hasEnoughCredits || isGenerationRunning);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) setShowModelMenu(false);
      if (aspectRef.current && !aspectRef.current.contains(event.target as Node)) setShowAspectMenu(false);
      if (resolutionRef.current && !resolutionRef.current.contains(event.target as Node)) setShowResolutionMenu(false);
      if (durationRef.current && !durationRef.current.contains(event.target as Node)) setShowDurationMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedNode || (selectedNode.type !== 'generate' && selectedNode.type !== 'videoGenerate')) {
    return null;
  }

  // Use context updateNodeData so Canvas state + ref stay in sync; Run Selected then sees latest model/resolution/aspectRatio
  const updateNodeData = (key: string, value: any) => {
    if (selectedNode?.id) {
      contextUpdateNodeData(selectedNode.id, { [key]: value });
    }
  };

  const activeModels = isVideoNode ? VIDEO_MODELS : AI_MODELS;

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    updateNodeData('model', modelId);
    setShowModelMenu(false);
    const modelData = activeModels.find(m => m.id === modelId);
    toast.success(`Model: ${modelData?.name}`);
  };

  const handleDurationSelect = (durationId: string) => {
    setSelectedDuration(durationId);
    updateNodeData('duration', durationId);
    setShowDurationMenu(false);
    toast.success(`Duration: ${durationId}`);
  };

  const handleAspectSelect = (aspectId: string) => {
    setSelectedAspect(aspectId);
    updateNodeData('aspectRatio', aspectId);
    setShowAspectMenu(false);
    toast.success(`Aspect: ${aspectId}`);
  };

  const handleResolutionSelect = (resolutionId: string) => {
    setSelectedResolution(resolutionId);
    updateNodeData('resolution', resolutionId);
    setShowResolutionMenu(false);
    toast.success(`Resolution: ${resolutionId}`);
  };

  const handleRunNode = async () => {
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
    const referenceImageUrls = collectReferenceImageUrls(currentEdges, currentNodes, selectedNode.id);

    let actualPromptText: string | null = null;
    currentEdges.forEach((edge) => {
      if (edge.target !== selectedNode.id || edge.targetHandle !== 'prompt') return;
      const sourceNode = currentNodes.find((n) => n.id === edge.source);
      if (sourceNode?.data && 'text' in sourceNode.data) {
        actualPromptText = (sourceNode.data as { text?: string }).text ?? null;
      }
    });

    try {
      if (isVideoNode) {
        await executeVideoGeneration({
          nodeId: selectedNode.id,
          referenceImageUrls,
          promptText: actualPromptText,
          model: selectedModel,
          aspectRatio: selectedAspect,
          duration: selectedDuration,
          resolution: selectedResolution,
          updateNodeData: (nodeId, data) => contextUpdateNodeData(nodeId, data),
          credits,
          deductCredits,
          addCredits,
          refreshCredits,
        });
        toast.success('Video generated!', { id: `generate-${selectedNode.id}` });
      } else {
        await executeGeneration({
          nodeId: selectedNode.id,
          referenceImageUrls,
          promptText: actualPromptText,
          model: selectedModel,
          aspectRatio: selectedAspect,
          resolution: selectedResolution,
          updateNodeData: (nodeId, data) => contextUpdateNodeData(nodeId, data),
          credits,
          deductCredits,
          addCredits,
          refreshCredits,
        });
        toast.success('Amazing! Your image is ready', { id: `generate-${selectedNode.id}` });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Generation failed';
      toast.error(msg, { id: `generate-${selectedNode.id}` });
    }
  };

  const currentModelData = activeModels.find(m => m.id === selectedModel);
  const activeAspectRatios = isVideoNode ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS;
  const activeResolutions = isVideoNode ? VIDEO_RESOLUTIONS : RESOLUTIONS;
  const currentAspectData = activeAspectRatios.find(a => a.id === selectedAspect);
  const currentResolutionData = activeResolutions.find(r => r.id === selectedResolution);
  const currentDurationData = VIDEO_DURATIONS.find(d => d.id === selectedDuration);

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="fixed right-0 top-0 h-full w-80 bg-[#0a0a0a] border-l border-white/10 shadow-2xl z-50 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15C13.657 15 15 13.657 15 12C15 10.343 13.657 9 12 9C10.343 9 9 10.343 9 12C9 13.657 10.343 15 12 15Z" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h3 className="text-white font-semibold">Properties</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Node Type */}
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Node Type</p>
          <p className="text-white font-medium">{isVideoNode ? 'Video Generate Node' : 'Generate Node'}</p>
        </div>

        {/* Model Dropdown */}
        <div ref={modelRef} className="relative">
          <label className="text-sm text-gray-400 mb-2 block">AI Model</label>
          <button
            onClick={() => setShowModelMenu(!showModelMenu)}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${currentModelData?.color}15` }}
              >
                {currentModelData?.iconType === 'image' ? (
                  <img 
                    src={currentModelData.icon} 
                    alt={currentModelData.name}
                    className="w-5 h-5 object-contain rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Icon 
                    icon={currentModelData?.icon || 'ph:lightning-fill'} 
                    className="w-5 h-5" 
                    style={{ color: currentModelData?.color }}
                  />
                )}
              </div>
              <div className="text-left">
                <div className="text-white text-sm">{currentModelData?.name}</div>
                <div className="text-gray-400 text-xs">{currentModelData?.provider}</div>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showModelMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20"
              >
                {activeModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-3 border-b border-white/5 last:border-b-0 ${
                      selectedModel === model.id ? 'bg-white/5' : ''
                    }`}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${model.color}15` }}
                    >
                      {model.iconType === 'image' ? (
                        <img 
                          src={model.icon} 
                          alt={model.name}
                          className="w-5 h-5 object-contain rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Icon 
                          icon={model.icon} 
                          className="w-5 h-5" 
                          style={{ color: model.color }}
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm ${selectedModel === model.id ? 'text-purple-400' : 'text-white'}`}>
                        {model.name}
                      </div>
                      <div className="text-xs text-gray-400">{model.provider}</div>
                    </div>
                    {selectedModel === model.id && (
                      <Icon icon="ph:check-circle-fill" className="w-5 h-5 text-purple-400" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Aspect Ratio Dropdown */}
        <div ref={aspectRef} className="relative">
          <label className="text-sm text-gray-400 mb-2 block">Aspect Ratio</label>
          <button
            onClick={() => setShowAspectMenu(!showAspectMenu)}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
          >
            <span className="text-white flex items-center gap-2">
              <span>{currentAspectData?.emoji}</span>
              <span>{currentAspectData?.name}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAspectMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showAspectMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20"
              >
                {activeAspectRatios.map((aspect) => (
                  <button
                    key={aspect.id}
                    onClick={() => handleAspectSelect(aspect.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      selectedAspect === aspect.id ? 'bg-white/5 text-purple-400' : 'text-white'
                    }`}
                  >
                    <span>{aspect.emoji}</span>
                    <span>{aspect.name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Resolution Dropdown */}
        <div ref={resolutionRef} className="relative">
          <label className="text-sm text-gray-400 mb-2 block">Resolution</label>
          <button
            onClick={() => setShowResolutionMenu(!showResolutionMenu)}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
          >
            <span className="text-white flex items-center gap-2">
              <span>{currentResolutionData?.emoji}</span>
              <span>{currentResolutionData?.name}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showResolutionMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showResolutionMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20"
              >
                {activeResolutions.map((resolution) => (
                  <button
                    key={resolution.id}
                    onClick={() => handleResolutionSelect(resolution.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      selectedResolution === resolution.id ? 'bg-white/5 text-purple-400' : 'text-white'
                    }`}
                  >
                    <span>{resolution.emoji}</span>
                    <span>{resolution.name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Duration Dropdown — video nodes only */}
        {isVideoNode && (
          <div ref={durationRef} className="relative">
            <label className="text-sm text-gray-400 mb-2 block">Duration</label>
            <button
              onClick={() => setShowDurationMenu(!showDurationMenu)}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
            >
              <span className="text-white flex items-center gap-2">
                <span>⏱</span>
                <span>{currentDurationData?.name || selectedDuration}</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDurationMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showDurationMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20"
                >
                  {VIDEO_DURATIONS.map((dur) => (
                    <button
                      key={dur.id}
                      onClick={() => handleDurationSelect(dur.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 ${
                        selectedDuration === dur.id ? 'bg-white/5 text-purple-400' : 'text-white'
                      }`}
                    >
                      <span>⏱</span>
                      <span>{dur.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Spacer to push credit cost and button to bottom */}
        <div className="flex-1 min-h-[100px]" />

        {/* When not signed in: show sign-in prompt */}
        {!user ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">Sign in required</p>
              <p className="text-xs text-amber-300/90 mt-1">
                Sign in to run this node and start generating images.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Credit Cost Display - Above Run Button (only when signed in) */}
            <div className={`rounded-lg p-4 border ${
              hasEnoughCredits 
                ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30' 
                : 'bg-red-500/20 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${hasEnoughCredits ? 'text-purple-400' : 'text-red-400'}`} />
                  <span className="text-sm text-gray-300">Cost to execute</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-white">{creditCost}</span>
                <span className="text-gray-400">credits</span>
              </div>
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Your balance:</span>
                  <span className={`font-semibold ${hasEnoughCredits ? 'text-green-400' : 'text-red-400'}`}>
                    {credits} credits
                  </span>
                </div>
              </div>
            </div>

            {/* Insufficient Credits Warning (only when signed in and insufficient) */}
            {!hasEnoughCredits && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-400 font-medium">Insufficient Credits</p>
                  <p className="text-xs text-red-300 mt-1">
                    You need {creditCost - credits} more credits. Upgrade your plan to continue.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Run Button - At Bottom */}
        <button
          onClick={handleRunNode}
          disabled={runDisabled}
          className={`w-full font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
            !runDisabled
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
              : 'bg-gray-600 cursor-not-allowed text-gray-400'
          } disabled:opacity-50`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : !user ? (
            <>
              <Play className="w-5 h-5" />
              Sign in to Run
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Run This Node
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
