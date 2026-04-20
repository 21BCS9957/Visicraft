'use client';

import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronDown, Clapperboard, Image as ImageIcon, Mic, Plus, Upload, X, Zap, Download } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import toast from '@/lib/toast';
import { useSpeechDictation } from '@/lib/useSpeechDictation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { getCreditCost } from '@/lib/credits/calculator';
import { cn } from '@/lib/utils';

const IMAGE_CREDIT_COST = 65;
const VIDEO_CREDIT_COST = 120;

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
}

const MarqueeContent = memo(() => (
  <div className="relative bg-gradient-to-r from-[#8b7355] via-[#a08968] to-[#8b7355] py-3 overflow-hidden border-y border-[#c8b4a0]/30 rounded-lg mt-12">
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
    <div 
      className="relative flex whitespace-nowrap gap-16"
      style={{
        animation: 'marquee 25s linear infinite',
        width: 'max-content',
        willChange: 'transform'
      }}
    >
      {[...Array(6)].map((_, i) => (
        <span key={i} className="text-white font-light text-sm tracking-widest flex items-center gap-16">
          INDIA&apos;S FASTEST GROWING AI PLATFORM
          <span className="text-white/60">&bull;</span>
          10,000+ CREATORS TRUST VISICRAFT
          <span className="text-white/60">&bull;</span>
          GENERATE STUNNING VISUALS IN SECONDS
          <span className="text-white/60">&bull;</span>
        </span>
      ))}
    </div>
  </div>
));

MarqueeContent.displayName = 'MarqueeContent';

const FeatureCard = memo(({ icon: Icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: number }) => (
  <div
    className="p-6 sm:p-8 rounded-lg border border-white/10 bg-[#1a1a1a] hover:border-[#8b7355]/30 transition-all opacity-0 animate-word-appear group"
    style={{
      animationDelay: `${delay}s`,
      animationFillMode: 'forwards',
    }}
  >
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 flex items-center justify-center mb-3 sm:mb-4 border border-[#8b7355]/30">
      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#c8b4a0]" />
    </div>
    <h3 className="text-white font-light text-lg sm:text-xl mb-2 tracking-wide">
      {title}
    </h3>
    <p className="text-gray-400 text-sm font-light">
      {desc}
    </p>
  </div>
));

FeatureCard.displayName = 'FeatureCard';

const IMAGE_MODELS = [
  { id: 'gpt-image', name: 'GPT-4o Image' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro' },
  { id: 'midjourney', name: 'Midjourney' },
  { id: 'google-imagen', name: 'Google Imagen 4' },
  { id: 'flux-2-max', name: 'Flux 2 Max' },
];

const VIDEO_MODELS = [
  { id: 'veo-3.1-generate-001', name: 'Google Veo 3.1' },
  { id: 'veo-2.0-generate-001', name: 'Google Veo 2.0' },
  { id: 'veo-1.0', name: 'Google Veo 1.0' },
  { id: 'runway-gen3', name: 'Runway Gen-3 Alpha' },
];

const MODEL_MENU_STAGGER_MS = 28;
const MODEL_MENU_ANIM_MS = 150;
const MODEL_MENU_CLOSE_STAGGER_MS = 12;
const MODEL_MENU_CLOSE_ANIM_MS = 85;

const modelMenuItemAnimStyle = (
  name: 'heroModelOptionIn' | 'heroModelOptionOut',
  delayMs: number,
  durationMs: number = MODEL_MENU_ANIM_MS
): CSSProperties => ({
  animationName: name,
  animationDuration: `${durationMs}ms`,
  animationTimingFunction: 'ease',
  animationFillMode: 'forwards',
  animationDelay: `${delayMs}ms`,
});

function getModelMenuCloseDurationMs(count: number) {
  return Math.max(0, count - 1) * MODEL_MENU_CLOSE_STAGGER_MS + MODEL_MENU_CLOSE_ANIM_MS;
}

let imageIdCounter = 0;

export function HeroSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { credits, deductCredits, addCredits, refreshCredits } = useCredits();

  const typingTargets = [
    'Welcome to Visicraft',
    "Let's dive into the experience of creating stunning visuals",
  ];
  const [promptValue, setPromptValue] = useState('');
  const [typingText, setTypingText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image');
  const [selectedModel, setSelectedModel] = useState('nano-banana-pro');
  const currentModels = generationMode === 'video' ? VIDEO_MODELS : IMAGE_MODELS;
  const [modelMenuPhase, setModelMenuPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [modelMenuKey, setModelMenuKey] = useState(0);
  const modelMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<string[]>([]);
  const [generatedType, setGeneratedType] = useState<'image' | 'video'>('image');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechDictation(setPromptValue, {
    onError: (code) => {
      if (code === 'not-allowed') {
        toast.error('Microphone access denied. Allow the microphone in your browser settings.');
      } else if (code === 'service-not-allowed') {
        toast.error('Voice input is not available. Check your browser permissions.');
      } else if (code === 'network') {
        toast.error('Voice recognition failed (network). Check your connection.');
      }
    },
  });

  useEffect(() => {
    return () => {
      uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, []);

  useEffect(() => {
    const currentTarget = typingTargets[typingIndex];
    const nextDelay = isDeleting ? 40 : 85;
    const pauseAtEdge = isDeleting ? 250 : 1000;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        const next = currentTarget.slice(0, typingText.length + 1);
        setTypingText(next);
        if (next === currentTarget) {
          setTimeout(() => setIsDeleting(true), pauseAtEdge);
        }
      } else {
        const next = currentTarget.slice(0, Math.max(0, typingText.length - 1));
        setTypingText(next);
        if (next.length === 0) {
          setIsDeleting(false);
          setTypingIndex((prev) => (prev + 1) % typingTargets.length);
        }
      }
    }, nextDelay);

    return () => clearTimeout(timer);
  }, [isDeleting, typingText, typingIndex, typingTargets]);

  const closeModelMenuAnimated = (onFullyClosed?: () => void) => {
    if (modelMenuPhase !== 'open') return;
    if (modelMenuCloseTimerRef.current) {
      clearTimeout(modelMenuCloseTimerRef.current);
    }
    setModelMenuPhase('closing');
    const duration = getModelMenuCloseDurationMs(currentModels.length);
    modelMenuCloseTimerRef.current = setTimeout(() => {
      modelMenuCloseTimerRef.current = null;
      setModelMenuPhase('closed');
      onFullyClosed?.();
    }, duration);
  };

  const openModelMenu = () => {
    if (modelMenuCloseTimerRef.current) {
      clearTimeout(modelMenuCloseTimerRef.current);
      modelMenuCloseTimerRef.current = null;
    }
    setModelMenuKey((k) => k + 1);
    setModelMenuPhase('open');
  };

  useEffect(() => {
    return () => {
      if (modelMenuCloseTimerRef.current) clearTimeout(modelMenuCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        if (modelMenuPhase === 'open') {
          closeModelMenuAnimated();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modelMenuPhase]);

  useEffect(() => {
    if (!currentModels.find((m) => m.id === selectedModel)) {
      setSelectedModel(currentModels[0].id);
    }
  }, [generationMode]);

  const selectedModelName =
    currentModels.find((model) => model.id === selectedModel)?.name ?? currentModels[0].name;

  const creditCost = generationMode === 'image'
    ? getCreditCost(selectedModel, '2K')
    : VIDEO_CREDIT_COST;

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const newImages: UploadedImage[] = Array.from(files).map((file) => ({
      id: `img-${++imageIdCounter}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setUploadedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setUploadedImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    setError('');
    setProgress(0);
    setStatusMessage('');

    if (!user) {
      toast.error('Sign up to get free credits and start creating!');
      setTimeout(() => router.push('/login?redirectTo=/'), 1500);
      return;
    }

    if (uploadedImages.length === 0) {
      toast.error('Upload at least one image to get started');
      return;
    }

    if (generationMode === 'image' && uploadedImages.length === 1 && !promptValue.trim()) {
      toast.error('Add a prompt when using a single image');
      return;
    }

    if (generationMode === 'video' && !promptValue.trim()) {
      toast.error('A prompt is required for video generation');
      return;
    }

    if (credits < creditCost) {
      toast.error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
      return;
    }

    setIsGenerating(true);
    setGeneratedResults([]);
    setGeneratedType(generationMode);

    const deducted = await deductCredits(creditCost);
    if (!deducted) {
      setIsGenerating(false);
      toast.error('Failed to deduct credits');
      return;
    }

    try {
      setStatusMessage('Uploading images...');
      setProgress(10);

      const imageUrls = await Promise.all(
        uploadedImages.map(async (img) => {
          const formData = new FormData();
          formData.append('file', img.file);
          formData.append('bucket', 'source-images');
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error('Failed to upload image');
          const { url } = await res.json();
          return url as string;
        })
      );

      setProgress(30);

      if (generationMode === 'image') {
        setStatusMessage('Generating image...');

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'generate',
            referenceImages: imageUrls,
            prompt: promptValue || '',
            model: selectedModel,
          }),
        });

        setProgress(80);

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');

        setProgress(100);
        setStatusMessage('Done!');
        setGeneratedResults(result.images ?? []);
      } else {
        setStatusMessage('Starting video generation...');

        const res = await fetch('/api/img2vid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imageUrls[0],
            prompt: promptValue || '',
            model: selectedModel,
          }),
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Video generation failed');

        if (result.operationId) {
          setProgress(15);
          setStatusMessage('Rendering video...');

          let isDone = false;
          let failed = false;
          let finalUrls: string[] = [];

          while (!isDone) {
            await new Promise((r) => setTimeout(r, 10000));
            try {
              const statusRes = await fetch('/api/video-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: result.operationId }),
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.error) {
                  failed = true;
                  isDone = true;
                  throw new Error(statusData.error);
                }
                if (statusData.done) {
                  isDone = true;
                  finalUrls = statusData.url ? [statusData.url] : [];
                  setProgress(100);
                  setStatusMessage('Done!');
                } else {
                  const p = typeof statusData.progress === 'number' && statusData.progress > 0
                    ? statusData.progress : 15;
                  setProgress(p);
                  setStatusMessage(`Rendering video... ${p}%`);
                }
              }
            } catch (e) {
              if ((e as Error).message) {
                failed = true;
                isDone = true;
              }
            }
          }
          if (failed) throw new Error('Video generation failed');
          setGeneratedResults(finalUrls);
        } else if (result.images) {
          setProgress(100);
          setStatusMessage('Done!');
          setGeneratedResults(result.images);
        }
      }

      await refreshCredits();

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      toast.error(msg);
      await addCredits(creditCost);
      await refreshCredits();
    } finally {
      setIsGenerating(false);
    }
  }, [user, uploadedImages, promptValue, generationMode, selectedModel, credits, creditCost, deductCredits, addCredits, refreshCredits, router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Visible Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.08] animate-grid-draw"
        style={{
          backgroundImage: `
            linear-gradient(to right, #c8b4a0 1px, transparent 1px),
            linear-gradient(to bottom, #c8b4a0 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/50 to-[#0a0a0a]" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 py-12 sm:py-20 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center space-y-4 sm:space-y-5 max-w-5xl">
          {/* Animated Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-light text-white tracking-wider leading-tight">
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{ animationDelay: '0s', animationFillMode: 'forwards' }}
            >
              CREATE STUNNING
            </span>
            <br className="my-1 sm:my-2" />
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
            >
              VISUALS WITH
            </span>
            <br className="my-1 sm:my-2" />
            <span
              className="inline-block animate-word-appear opacity-0 bg-gradient-to-r from-[#8b7355] to-[#c8b4a0] bg-clip-text text-transparent"
              style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}
            >
              VISICRAFT
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-gray-400 font-light max-w-2xl mx-auto mt-3 sm:mt-5 px-4">
            Transform ordinary images into eye-catching creatives for YouTube, Shopify, Amazon, and social media
          </p>

          {/* Prompt Box */}
          <div className="relative z-20 pt-2 sm:pt-3">
            <div className="mx-auto w-full max-w-3xl rounded-3xl border border-[#4d453c]/20 bg-[#141414]/40 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-[20px]">
              <div className="flex flex-col">
                <div className="relative px-2 py-1">
                  {promptValue.length === 0 && !speech.isListening && (
                    <div className="pointer-events-none absolute left-2 top-3 text-lg font-medium text-[#d1c4b8]/50">
                      {typingText}
                      <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-[#d1c4b8]/60 align-middle" />
                    </div>
                  )}
                  <textarea
                    className="min-h-[60px] w-full resize-none appearance-none bg-transparent py-2 text-lg font-medium text-white placeholder:text-[#d1c4b8]/50 !border-0 !outline-none !ring-0 !shadow-none focus:!border-0 focus:!outline-none focus:!ring-0 focus:!shadow-none focus-visible:!border-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!shadow-none"
                    placeholder=""
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                </div>

                {/* Uploaded Images Strip */}
                {uploadedImages.length > 0 && (
                  <div className="flex items-center gap-2 px-2 pb-2 overflow-x-auto scrollbar-hide">
                    {uploadedImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative h-14 w-14 flex-shrink-0 animate-[chipIn_150ms_ease-out_forwards] rounded-xl border border-[#4d453c]/30 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      >
                        <img
                          src={img.preview}
                          alt="Upload"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-[#4d453c]/40 text-[#d1c4b8]/40 transition-colors hover:border-[#4d453c]/70 hover:text-[#d1c4b8]/70"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    {uploadedImages.length > 4 && (
                      <span className="ml-1 flex-shrink-0 rounded-full bg-[#1a1a1a] px-2.5 py-1 text-[10px] font-medium text-[#d1c4b8]/60 border border-[#4d453c]/20">
                        {uploadedImages.length} images
                      </span>
                    )}
                  </div>
                )}

                {/* Bottom Toolbar */}
                <div className="mt-2 flex items-center justify-between border-t border-[#4d453c]/20 pt-2">
                  <div className="flex items-center gap-2">
                    {/* Image upload button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[#d1c4b8]/70 transition-colors hover:bg-[#353534] hover:text-[#e5e2e1]"
                      title="Upload images"
                    >
                      <ImageIcon className="h-[18px] w-[18px]" />
                    </button>

                    {/* Image / Video toggle */}
                    <div className="relative ml-1 grid w-[165px] grid-cols-2 items-center rounded-full border border-[#4d453c]/20 bg-[#0e0e0e]/50 p-1">
                      <span
                        className={`pointer-events-none absolute ml-1 h-[26px] w-[calc(82.5px-4px)] rounded-full bg-[#353534] shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-transform duration-300 ease-out ${
                          generationMode === 'video' ? 'translate-x-[82.5px]' : 'translate-x-0'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setGenerationMode('image')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[10px] transition-colors duration-300 ${
                          generationMode === 'image'
                            ? 'font-bold text-[#dfc29e]'
                            : 'font-medium text-[#d1c4b8]/60 hover:text-[#d1c4b8]'
                        }`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Image</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenerationMode('video')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[10px] transition-colors duration-300 ${
                          generationMode === 'video'
                            ? 'font-bold text-[#dfc29e]'
                            : 'font-medium text-[#d1c4b8]/60 hover:text-[#d1c4b8]'
                        }`}
                      >
                        <Clapperboard className="h-3.5 w-3.5" />
                        <span>Video</span>
                      </button>
                    </div>

                    {/* Model picker */}
                    <div ref={modelMenuRef} className="relative ml-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (modelMenuPhase === 'open') {
                            closeModelMenuAnimated();
                          } else if (modelMenuPhase === 'closed') {
                            openModelMenu();
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-[#d1c4b8]/70 transition-colors hover:text-[#e5e2e1]"
                      >
                        <span>{selectedModelName}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 opacity-50 transition-transform ${modelMenuPhase !== 'closed' ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {modelMenuPhase !== 'closed' && (
                        <div
                          key={modelMenuKey}
                          className="absolute bottom-full left-0 z-40 mb-1 w-44 overflow-hidden rounded-lg border border-[#4d453c]/30 bg-[#161616] shadow-xl"
                        >
                          {currentModels.map((model, index) => {
                            const isClosing = modelMenuPhase === 'closing';
                            const reverseIndex = currentModels.length - 1 - index;
                            const staggerDelay = isClosing
                              ? reverseIndex * MODEL_MENU_CLOSE_STAGGER_MS
                              : index * MODEL_MENU_STAGGER_MS;
                            return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                closeModelMenuAnimated(() => setSelectedModel(model.id));
                              }}
                              className={`block w-full border-b border-[#4d453c]/20 px-3 py-2 text-left text-xs transition-colors last:border-b-0 ${
                                selectedModel === model.id
                                  ? 'bg-[#2a2a2a] text-[#dfc29e]'
                                  : 'text-[#d1c4b8]/80 hover:bg-[#222] hover:text-[#e5e2e1]'
                              }`}
                              style={
                                isClosing
                                  ? {
                                      opacity: 1,
                                      transform: 'translateY(0)',
                                      ...modelMenuItemAnimStyle(
                                        'heroModelOptionOut',
                                        staggerDelay,
                                        MODEL_MENU_CLOSE_ANIM_MS
                                      ),
                                    }
                                  : {
                                      opacity: 0,
                                      transform: 'translateY(8px)',
                                      ...modelMenuItemAnimStyle('heroModelOptionIn', staggerDelay),
                                    }
                              }
                            >
                              {model.name}
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Credit cost label */}
                    {uploadedImages.length > 0 && (
                      <span className="text-[10px] font-medium text-[#d1c4b8]/40">
                        {creditCost} credits
                      </span>
                    )}
                    {/* Mic */}
                    <button
                      type="button"
                      aria-pressed={speech.isListening}
                      aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
                      title={
                        speech.isListening
                          ? 'Stop listening'
                          : speech.supported
                            ? 'Voice input'
                            : 'Voice input not supported in this browser'
                      }
                      onClick={() => {
                        if (!speech.supported) {
                          toast.error(
                            'Voice input is not supported in this browser. Try Chrome, Edge, or Safari.'
                          );
                          return;
                        }
                        speech.toggle(promptValue);
                      }}
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                        speech.isListening
                          ? 'animate-mic-listening bg-[#2a2a2a] ring-1 ring-white/10 hover:bg-[#333]'
                          : 'text-[#d1c4b8]/70 hover:bg-[#353534] hover:text-[#e5e2e1]'
                      )}
                    >
                      {speech.isListening ? (
                        <span
                          className="block h-[11px] w-[11px] rounded-[2.5px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]"
                          aria-hidden
                        />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                    {/* Generate button */}
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={handleGenerate}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition-all',
                        isGenerating
                          ? 'cursor-wait bg-[#353534] text-[#d1c4b8]/40'
                          : 'bg-white text-black hover:scale-105 active:scale-95'
                      )}
                    >
                      {isGenerating ? (
                        <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[#d1c4b8]/40 border-t-[#d1c4b8]" />
                      ) : (
                        <ArrowUp className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Results / Progress Section */}
          {(isGenerating || generatedResults.length > 0 || error) && (
            <div ref={resultsRef} className="mx-auto w-full max-w-3xl pt-6">
              {/* Progress */}
              {isGenerating && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative h-32 w-full overflow-hidden rounded-2xl bg-[#1a1a1a] border border-[#4d453c]/20">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#4d453c]/10 to-transparent"
                        style={{
                          animation: 'shimmer 1.5s ease-in-out infinite',
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <span className="block h-5 w-5 animate-spin rounded-full border-2 border-[#8b7355]/30 border-t-[#c8b4a0]" />
                        <span className="text-sm font-light text-[#d1c4b8]/60">{statusMessage}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#8b7355] to-[#c8b4a0] transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && !isGenerating && (
                <p className="text-center text-sm text-red-400">{error}</p>
              )}

              {/* Generated Images */}
              {!isGenerating && generatedResults.length > 0 && generatedType === 'image' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {generatedResults.map((url, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-2xl border border-[#4d453c]/20 bg-[#1a1a1a] opacity-0 animate-word-appear"
                      style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                    >
                      <img
                        src={url}
                        alt={`Generated ${i + 1}`}
                        className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 p-3">
                        <a
                          href={url}
                          download={`visicraft-${i + 1}.png`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Generated Video */}
              {!isGenerating && generatedResults.length > 0 && generatedType === 'video' && (
                <div className="space-y-3">
                  {generatedResults.map((url, i) => (
                    <video
                      key={i}
                      src={url}
                      controls
                      className="w-full rounded-2xl border border-[#4d453c]/20 bg-[#1a1a1a] opacity-0 animate-word-appear"
                      style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Marquee Ribbon */}
          <div className="hidden sm:block">
            <MarqueeContent />
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 pt-12 sm:pt-20">
            <FeatureCard 
              icon={Upload}
              title="Upload Images"
              desc="Add your source images and reference style"
              delay={0.8}
            />
            <FeatureCard 
              icon={Zap}
              title="AI Generation"
              desc="Let AI create stunning thumbnails"
              delay={0.95}
            />
            <FeatureCard 
              icon={Download}
              title="Download"
              desc="Get your thumbnails instantly"
              delay={1.1}
            />
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes heroModelOptionIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes heroModelOptionOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-8px);
          }
        }
        @keyframes chipIn {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
