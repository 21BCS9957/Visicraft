'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Upload, Video, Download, Play, Pause, Loader2, Wand2, Clock, Layers, Zap, CheckCircle, AlertCircle, ChevronDown, X, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { getCreditCostForVideo } from '@/lib/credits/calculator';

interface VideoSettings {
  duration: string;
  aspectRatio: string;
  style: string;
  mood: string;
  model: string;
}

const VIDEO_STYLES = [
  { id: 'cinematic', name: 'Cinematic', icon: 'ph:film-slate-fill', desc: 'Movie-quality visuals with dramatic lighting' },
  { id: 'animated', name: 'Animated', icon: 'ph:paint-brush-fill', desc: 'Cartoon or animation style video' },
  { id: 'realistic', name: 'Realistic', icon: 'ph:camera-fill', desc: 'True-to-life footage with natural look' },
  { id: 'artistic', name: 'Artistic', icon: 'ph:palette-fill', desc: 'Creative artistic expressions and effects' },
  { id: 'documentary', name: 'Documentary', icon: 'ph:video-camera-fill', desc: 'Professional documentary style' },
];

const VIDEO_MOODS = [
  { id: 'energetic', name: 'Energetic', color: '#ef4444', desc: 'High energy, upbeat, exciting' },
  { id: 'calm', name: 'Calm', color: '#3b82f6', desc: 'Peaceful, relaxing, serene' },
  { id: 'mysterious', name: 'Mysterious', color: '#8b5cf6', desc: 'Dark, intriguing, suspenseful' },
  { id: 'joyful', name: 'Joyful', color: '#f59e0b', desc: 'Happy, bright, celebratory' },
  { id: 'dramatic', name: 'Dramatic', color: '#dc2626', desc: 'Intense, powerful, emotional' },
  { id: 'minimal', name: 'Minimal', color: '#6b7280', desc: 'Clean, simple, modern' },
];

/** Veo supports only 4, 6, or 8 seconds */
const DURATION_OPTIONS = [
  { id: '4s', name: '4 Seconds', credits: 40, desc: 'Quick clips' },
  { id: '6s', name: '6 Seconds', credits: 60, desc: 'Short videos' },
  { id: '8s', name: '8 Seconds', credits: 80, desc: 'Standard length (max)' },
];

const ASPECT_RATIOS = [
  { id: '16:9', name: '16:9', desc: 'Landscape (YouTube, Web)' },
  { id: '9:16', name: '9:16', desc: 'Portrait (TikTok, Reels)' },
  { id: '1:1', name: '1:1', desc: 'Square (Instagram Feed)' },
  { id: '4:3', name: '4:3', desc: 'Classic TV Format' },
];

const MODELS = [
  { id: 'veo-3', name: 'Google Veo 3', desc: 'Latest generation - Best quality', badge: 'Recommended' },
  { id: 'veo-2', name: 'Google Veo 2', desc: 'Proven performance', badge: null },
];

export default function VideoGenerationPage() {
  const { user } = useAuth();
  const { credits, refreshCredits } = useCredits();
  const router = useRouter();

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('Initializing...');

  const [settings, setSettings] = useState<VideoSettings>({
    duration: '8s',
    aspectRatio: '16:9',
    style: 'cinematic',
    mood: 'energetic',
    model: 'veo-3',
  });

  const creditCost = getCreditCostForVideo(settings.duration);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image must be less than 10MB');
        return;
      }
      setUploadedImage(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
  };

  const handleGenerate = async () => {
    setError('');

    if (!user) {
      setError('Please sign in to generate videos');
      setTimeout(() => router.push('/login?redirectTo=/video-generation'), 2000);
      return;
    }

    if (!prompt.trim()) {
      setError('Please enter a prompt describing your video');
      return;
    }

    if (credits < creditCost) {
      setError(`Insufficient credits! Need ${creditCost}, have ${credits}`);
      return;
    }

    toast.success('Generating video...');
    setIsGenerating(true);
    setGeneratedVideo(null);
    setGenerationStatus('Submitting video generation request...');

    try {
      let imageUrl: string | undefined;
      if (uploadedImage) {
        const formData = new FormData();
        formData.append('file', uploadedImage);
        formData.append('bucket', 'source-images');
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || 'Failed to upload image');
        }
        const data = await uploadResponse.json();
        imageUrl = data.url;
      }

      const generateResponse = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imageUrl || undefined,
          prompt,
          ...settings,
        }),
      });

      if (generateResponse.status === 402) {
        await refreshCredits();
        const errorData = await generateResponse.json();
        setError(errorData.error || 'Insufficient credits');
        toast.error(errorData.error || 'Insufficient credits');
        return;
      }
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || 'Video generation failed');
      }

      const result = await generateResponse.json();
      
      console.log('📹 Video Generation Result:', result);

      // If API returns an error
      if (!result.success || result.status === 'error') {
        throw new Error(result.error || result.message || 'Video generation failed');
      }

      // If video is returned directly (immediate result)
      if (result.videoUrl && result.status === 'completed') {
        setGeneratedVideo(result.videoUrl);
        await refreshCredits();
        toast.success('Video generated successfully!');
        setGenerationStatus('Complete!');
      } 
      // If requires polling (LRO pattern)
      else if (result.requiresPolling && (result.jobId || result.operationName)) {
        setGenerationStatus('Video generation started. You can check back in a few minutes...');
        
        toast.success(
          'Video generation started! Usually 1–3 minutes. You can wait here or come back later.',
          { duration: 6000 }
        );
        
        // Poll in background with shorter timeout
        await pollVideoStatus(result.jobId, result.operationName);
      } 
      // If no video and no polling needed - it's an error
      else {
        throw new Error(result.message || 'Failed to generate video. No video URL returned.');
      }
    } catch (err) {
      await refreshCredits();
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const pollVideoStatus = async (jobId: string | null, operationName: string | null) => {
    let currentJobId = jobId;
    let currentOperationName = operationName;
    const pollIntervalMs = 3000; // Poll every 3 seconds (faster feedback)
    const maxAttempts = 200;     // ~10 minutes
    let attempts = 0;

    console.log('🔄 Starting polling for video generation...');

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      attempts++;

      try {
        const pollUrl = new URL('/api/video/generate', window.location.origin);
        if (currentJobId) pollUrl.searchParams.set('jobId', currentJobId);
        if (currentOperationName) pollUrl.searchParams.set('operationName', currentOperationName);

        const response = await fetch(pollUrl.toString());
        const result = await response.json();

        console.log(`📊 Poll attempt ${attempts}:`, result.status, result);
        const elapsedSec = attempts * (pollIntervalMs / 1000);
        setGenerationStatus(`Processing... ${elapsedSec}s elapsed (typically 1–3 min)`);

        if (result.status === 'completed') {
          if (result.videoUrl) {
            setGeneratedVideo(result.videoUrl);
            setGenerationStatus('Complete!');
            await refreshCredits();
            toast.success('Video generated successfully!');
            console.log('✅ Video generated:', result.videoUrl);
            return;
          }
        } else if (result.status === 'error') {
          throw new Error(result.error || 'Video generation failed');
        } else if (result.progress) {
          setGenerationStatus(`Processing... ${result.progress}% complete`);
        }
      } catch (err) {
        console.error('Polling error:', err);
        // Don't throw on individual poll errors, continue polling
      }
    }

    // Timeout after max attempts
    throw new Error('Video generation timed out after 10 minutes. The video may still be processing. Please check back later or contact support.');
  };

  const handleReset = () => {
    setUploadedImage(null);
    setImagePreview(null);
    setPrompt('');
    setGeneratedVideo(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d0f0c] via-[#1a1d18] to-[#0d0f0c] relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(to right, #8b7355 1px, transparent 1px), linear-gradient(to bottom, #8b7355 1px, transparent 1px)`,
          backgroundSize: '4rem 4rem'
        }} />
        <motion.div 
          animate={{ 
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(circle at 30% 20%, rgba(139, 115, 85, 0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(200, 180, 160, 0.1) 0%, transparent 50%)',
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10 sm:mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#8b7355]/20 to-[#6b5545]/20 border border-[#8b7355]/30 rounded-full mb-4">
            <Video className="w-4 h-4 text-[#c8b4a0]" />
            <span className="text-[#c8b4a0] text-sm font-light">AI Video Generation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extralight text-white tracking-[0.15em] uppercase mb-3 sm:mb-4">
            Create Stunning <span className="text-[#c8b4a0]">Videos</span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg font-light max-w-2xl mx-auto">
            Transform your images into captivating videos with AI. Enter a prompt and watch the magic happen.
          </p>
        </motion.div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Left Column - Input */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="p-5 sm:p-6 border-[#c8b4a0]/15 bg-gradient-to-br from-[#1a1d18]/80 to-[#121412]/80 backdrop-blur-sm">
                {/* Image Upload */}
                <div className="mb-6">
                  <label className="text-white font-light text-lg mb-3 block flex items-center gap-2">
                    <Upload className="w-5 h-5 text-[#c8b4a0]" />
                    Upload Image (optional)
                  </label>
                  <p className="text-gray-500 text-sm mb-4">Add an image for image-to-video, or leave empty for text-to-video</p>
                  
                  {!imagePreview ? (
                    <label className="border-2 border-dashed border-[#c8b4a0]/20 rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center cursor-pointer hover:border-[#c8b4a0]/40 hover:bg-[#c8b4a0]/5 transition-all group">
                      <div className="w-16 h-16 rounded-full bg-[#8b7355]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-[#c8b4a0]" />
                      </div>
                      <span className="text-white font-light">Click to upload image</span>
                      <span className="text-gray-500 text-sm mt-1">PNG, JPG up to 10MB</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden group">
                      <img src={imagePreview} alt="Preview" className="w-full h-64 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={removeImage}
                          className="p-3 bg-red-500/20 rounded-full hover:bg-red-500/40 transition-colors"
                        >
                          <X className="w-6 h-6 text-white" />
                        </button>
                      </div>
                      <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/70 rounded-lg backdrop-blur-sm">
                        <span className="text-white text-sm font-light">{uploadedImage?.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Prompt Input */}
                <div className="mb-6">
                  <label className="text-white font-light text-lg mb-3 block flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-[#c8b4a0]" />
                    Describe Your Video
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a detailed prompt describing the video you want... (e.g., 'A serene mountain landscape at sunrise with birds flying across the sky, cinematic lighting, slow motion')"
                    className="w-full h-32 bg-[#0d0f0c] border border-[#c8b4a0]/20 rounded-xl p-4 text-white placeholder-gray-500 font-light resize-none focus:border-[#c8b4a0]/40 focus:outline-none transition-colors"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Be specific for better results</span>
                    <span>{prompt.length}/500</span>
                  </div>
                </div>

                {/* Settings Toggle */}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-between p-4 bg-[#0d0f0c] border border-[#c8b4a0]/20 rounded-xl hover:border-[#c8b4a0]/40 transition-colors mb-6"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-[#c8b4a0]" />
                    <span className="text-white font-light">Video Settings</span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-[#c8b4a0] transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                </button>

                {/* Settings Panel */}
                <AnimatePresence>
                  {showSettings && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-5 pb-2">
                        {/* Duration */}
                        <div>
                          <label className="text-gray-400 text-sm mb-2 block flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Duration
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {DURATION_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setSettings({ ...settings, duration: opt.id })}
                                className={`p-3 rounded-lg border text-center transition-all ${
                                  settings.duration === opt.id
                                    ? 'border-[#8b7355] bg-[#8b7355]/10 text-white'
                                    : 'border-[#c8b4a0]/20 text-gray-400 hover:border-[#c8b4a0]/40'
                                }`}
                              >
                                <div className="font-light">{opt.name}</div>
                                <div className="text-xs text-[#c8b4a0] mt-1">{opt.credits} credits</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Aspect Ratio */}
                        <div>
                          <label className="text-gray-400 text-sm mb-2 block">Aspect Ratio</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {ASPECT_RATIOS.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setSettings({ ...settings, aspectRatio: opt.id })}
                                className={`p-3 rounded-lg border text-center transition-all ${
                                  settings.aspectRatio === opt.id
                                    ? 'border-[#8b7355] bg-[#8b7355]/10 text-white'
                                    : 'border-[#c8b4a0]/20 text-gray-400 hover:border-[#c8b4a0]/40'
                                }`}
                              >
                                <div className="font-light">{opt.name}</div>
                                <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Style */}
                        <div>
                          <label className="text-gray-400 text-sm mb-2 block">Video Style</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {VIDEO_STYLES.map((style) => (
                              <button
                                key={style.id}
                                onClick={() => setSettings({ ...settings, style: style.id })}
                                className={`p-3 rounded-lg border text-left transition-all ${
                                  settings.style === style.id
                                    ? 'border-[#8b7355] bg-[#8b7355]/10'
                                    : 'border-[#c8b4a0]/20 hover:border-[#c8b4a0]/40'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon icon={style.icon} className="w-4 h-4 text-[#c8b4a0]" />
                                  <span className="text-white font-light text-sm">{style.name}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 ml-6">{style.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Mood */}
                        <div>
                          <label className="text-gray-400 text-sm mb-2 block">Mood</label>
                          <div className="flex flex-wrap gap-2">
                            {VIDEO_MOODS.map((mood) => (
                              <button
                                key={mood.id}
                                onClick={() => setSettings({ ...settings, mood: mood.id })}
                                className={`px-4 py-2 rounded-full border text-sm transition-all ${
                                  settings.mood === mood.id
                                    ? 'text-white'
                                    : 'border-[#c8b4a0]/20 text-gray-400 hover:border-[#c8b4a0]/40'
                                }`}
                                style={settings.mood === mood.id ? { backgroundColor: `${mood.color}20`, borderColor: mood.color } : {}}
                              >
                                {mood.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Model */}
                        <div>
                          <label className="text-gray-400 text-sm mb-2 block">AI Model</label>
                          <div className="space-y-2">
                            {MODELS.map((model) => (
                              <button
                                key={model.id}
                                onClick={() => setSettings({ ...settings, model: model.id })}
                                className={`w-full p-3 rounded-lg border text-left transition-all ${
                                  settings.model === model.id
                                    ? 'border-[#8b7355] bg-[#8b7355]/10'
                                    : 'border-[#c8b4a0]/20 hover:border-[#c8b4a0]/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-white font-light">{model.name}</span>
                                  {model.badge && (
                                    <span className="px-2 py-0.5 bg-[#8b7355]/20 text-[#c8b4a0] text-xs rounded-full">
                                      {model.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{model.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error Display */}
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${
                      !user ? 'bg-[#8b7355]/10 border border-[#8b7355]/30' : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${!user ? 'text-[#c8b4a0]' : 'text-red-400'}`} />
                    <div className="flex-1">
                      <p className={!user ? 'text-[#c8b4a0]' : 'text-red-400'}>{error}</p>
                      {!user && (
                        <button
                          onClick={() => router.push('/login?redirectTo=/video-generation')}
                          className="mt-3 px-4 py-2 bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white rounded-lg text-sm font-light hover:shadow-lg transition-all"
                        >
                          Sign In to Continue
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full py-4 bg-gradient-to-r from-[#8b7355] to-[#6b5545] rounded-xl text-white font-light text-lg tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Video...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Video ({creditCost} credits)
                    </>
                  )}
                </button>

                {/* Credits Info */}
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Zap className="w-4 h-4" />
                  <span>Available: <span className="text-[#c8b4a0]">{credits}</span> credits</span>
                </div>
              </Card>
            </motion.div>

            {/* Right Column - Output */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-5 sm:p-6 border-[#c8b4a0]/15 bg-gradient-to-br from-[#1a1d18]/80 to-[#121412]/80 backdrop-blur-sm h-full min-h-[500px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-light text-lg flex items-center gap-2">
                    <Play className="w-5 h-5 text-[#c8b4a0]" />
                    Generated Video
                  </h3>
                  {generatedVideo && (
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      New Video
                    </button>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center bg-[#0d0f0c] rounded-xl border border-[#c8b4a0]/10 relative overflow-hidden">
                  {!generatedVideo ? (
                    <div className="text-center p-8">
                      <div className="w-20 h-20 rounded-full bg-[#8b7355]/10 flex items-center justify-center mx-auto mb-4">
                        <Video className="w-10 h-10 text-[#c8b4a0]/50" />
                      </div>
                      <p className="text-gray-500 font-light">Your generated video will appear here</p>
                      <p className="text-gray-600 text-sm mt-2">Upload an image and enter a prompt to get started</p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4">
                      <video
                        src={generatedVideo}
                        controls
                        className="w-full max-h-[350px] rounded-lg shadow-2xl"
                        poster={imagePreview || undefined}
                      >
                        Your browser does not support video playback.
                      </video>
                      <div className="mt-6 flex gap-3">
                        <a
                          href={generatedVideo}
                          download={`visicraft-video-${Date.now()}.mp4`}
                          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#8b7355] to-[#6b5545] rounded-lg text-white font-light hover:shadow-lg transition-all"
                        >
                          <Download className="w-5 h-5" />
                          Download Video
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Loading Overlay */}
                  {isGenerating && (
                    <div className="absolute inset-0 bg-[#0d0f0c]/90 flex flex-col items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="w-16 h-16 border-2 border-[#8b7355]/30 border-t-[#8b7355] rounded-full mb-4"
                      />
                      <p className="text-white font-light text-lg">Creating your video</p>
                      <p className="text-gray-500 text-sm mt-2">{generationStatus}</p>
                      <p className="text-gray-600 text-xs mt-1">Typically takes 2-5 minutes</p>
                    </div>
                  )}
                </div>

                {/* Settings Summary */}
                {generatedVideo && (
                  <div className="mt-4 p-4 bg-[#0d0f0c] rounded-lg border border-[#c8b4a0]/10">
                    <h4 className="text-white font-light text-sm mb-3">Video Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400">Duration:</span>
                        <span className="text-white">{settings.duration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400">Aspect:</span>
                        <span className="text-white">{settings.aspectRatio}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon icon="ph:palette-fill" className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400">Style:</span>
                        <span className="text-white capitalize">{settings.style}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-gray-400">Status:</span>
                        <span className="text-green-400">Complete</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
