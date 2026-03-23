'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { Icon } from '@iconify/react';
import { generationFormSchema, type GenerationFormData } from '@/lib/validations';
import { useGenerateState } from '@/lib/contexts/GenerateContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface GenerationFormProps {
  onGenerate: (prompt?: string, selectedModel?: string) => Promise<void>;
  disabled: boolean;
  featureMode?: 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit' | 'img2vid' | 'vid2vid';
  defaultPrompt?: string;
  onPromptChange?: (value: string) => void;
  generationProgress?: number;
  statusMessage?: string;
}

const AI_MODELS = [
  {
    id: 'gpt-image',
    name: 'GPT-4o Image',
    provider: 'OpenAI',
    icon: 'simple-icons:openai',
    iconType: 'icon',
    color: '#10A37F',
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Gemini 3 Pro Image',
    icon: 'emojione:banana',
    iconType: 'icon',
    color: '#FFD700',
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    provider: 'Midjourney AI',
    icon: 'https://logo.clearbit.com/midjourney.com',
    iconType: 'image',
    color: '#34D399',
  },
  {
    id: 'google-imagen',
    name: 'Google Imagen 4',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon',
    color: '#4285F4',
  },
  {
    id: 'flux-2-max',
    name: 'Flux 2 Max',
    provider: 'FLUX Models',
    icon: 'ph:lightning-fill',
    iconType: 'icon',
    color: '#8b7355',
  },
];

const VIDEO_MODELS = [
  {
    id: 'veo-3.1-generate-001',
    name: 'Google Veo 3.1',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon',
    color: '#4285F4',
  },
  {
    id: 'veo-2.0-generate-001',
    name: 'Google Veo 2.0',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon',
    color: '#4285F4',
  },
  {
    id: 'veo-1.0',
    name: 'Google Veo 1.0',
    provider: 'Google AI',
    icon: 'simple-icons:google',
    iconType: 'icon',
    color: '#4285F4',
  },
  {
    id: 'runway-gen3',
    name: 'Runway Gen-3 Alpha',
    provider: 'Runway AI',
    icon: 'ph:video-camera-fill',
    iconType: 'icon',
    color: '#000000',
  }
];

export function GenerationForm({ 
  onGenerate, 
  disabled, 
  featureMode = 'generate', 
  defaultPrompt, 
  onPromptChange,
  generationProgress,
  statusMessage
}: GenerationFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  const isVideoMode = featureMode === 'img2vid' || featureMode === 'vid2vid';
  const currentModels = isVideoMode ? VIDEO_MODELS : AI_MODELS;
  
  const [selectedModel, setSelectedModel] = useState(currentModels[0]);
  
  useEffect(() => {
    if (!currentModels.find(m => m.id === selectedModel.id)) {
      setSelectedModel(currentModels[0]);
    }
  }, [featureMode, isVideoMode]);
  
  const {
    videoNumResults, setVideoNumResults,
    videoAspectRatio, setVideoAspectRatio,
    videoDuration, setVideoDuration,
    videoResolution, setVideoResolution,
    videoNegativePrompt, setVideoNegativePrompt
  } = useGenerateState();
  
  const { register, handleSubmit, formState: { errors }, watch } = useForm<GenerationFormData>({
    resolver: zodResolver(generationFormSchema),
    defaultValues: { prompt: defaultPrompt ?? '' },
  });

  const promptValue = watch('prompt');
  useEffect(() => {
    onPromptChange?.(promptValue ?? '');
  }, [promptValue, onPromptChange]);

  const onSubmit = async (data: GenerationFormData) => {
    setIsGenerating(true);
    try {
      // Pass both prompt and selected model to parent
      await onGenerate(data.prompt, selectedModel.id);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Model Selection */}
      <div className="space-y-2">
        <Label htmlFor="model" className="text-[#f8f7f5]">
          AI Model
        </Label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="w-full flex items-center justify-between px-4 py-3 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg text-[#f8f7f5] hover:border-[#c8b4a0]/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${selectedModel.color}15` }}
              >
                {selectedModel.iconType === 'image' ? (
                  <img 
                    src={selectedModel.icon} 
                    alt={selectedModel.name}
                    className="w-5 h-5 object-contain rounded"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Icon 
                    icon={selectedModel.icon} 
                    className="w-5 h-5" 
                    style={{ color: selectedModel.color }}
                  />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-light">{selectedModel.name}</div>
                <div className="text-xs text-[#c8b4a0]/60">{selectedModel.provider}</div>
              </div>
            </div>
            <ChevronDown 
              className={`w-4 h-4 text-[#c8b4a0] transition-transform ${showModelDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {showModelDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg shadow-2xl z-10 overflow-hidden">
              {currentModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(model);
                    setShowModelDropdown(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#c8b4a0]/10 transition-colors border-b border-[#c8b4a0]/10 last:border-b-0 ${
                    selectedModel.id === model.id ? 'bg-[#c8b4a0]/5' : ''
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
                  <div className="text-left flex-1">
                    <div className="text-sm font-light text-[#f8f7f5]">{model.name}</div>
                    <div className="text-xs text-[#c8b4a0]/60">{model.provider}</div>
                  </div>
                  {selectedModel.id === model.id && (
                    <Icon icon="ph:check-circle-fill" className="w-5 h-5 text-[#8b7355]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-[#c8b4a0]/60">
          Select your preferred AI model for generation
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-[#f8f7f5]">
          {featureMode === 'edit' ? 'Edit Instructions (Required)' : 'Additional Instructions (Optional)'}
        </Label>
        <Textarea
          id="prompt"
          placeholder={
            featureMode === 'thumbnail'
              ? 'E.g., Add bold text "AMAZING!", Make it vibrant, Focus on the main subject...'
              : featureMode === 'edit' 
              ? 'E.g., Change background to sunset, Add text "Sale", Remove watermark...'
              : featureMode === 'upscale'
              ? 'E.g., Enhance details, Preserve quality...'
              : featureMode === 'unblur'
              ? 'E.g., Maximum sharpness, Focus on faces...'
              : featureMode === 'img2vid'
              ? 'E.g., Make the background move, add camera pan, animate character...'
              : featureMode === 'vid2vid'
              ? 'E.g., Convert to anime style, make it look cinematic...'
              : 'E.g., Make it more vibrant, add text overlay, focus on faces...'
          }
          className="min-h-[100px] bg-[#1a1d18] border-[#c8b4a0]/20 text-[#f8f7f5] placeholder:text-[#c8b4a0]/40"
          {...register('prompt')}
        />
        {errors.prompt && (
          <p className="text-red-400 text-sm">{errors.prompt.message}</p>
        )}
      </div>

      {(featureMode === 'img2vid' || featureMode === 'vid2vid') && (
        <div className="space-y-4 pt-4 border-t border-[#c8b4a0]/10">
          <h3 className="text-[#f8f7f5] font-light">Advanced Video Settings</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#c8b4a0] text-xs">Aspect Ratio</Label>
              <select 
                value={videoAspectRatio}
                onChange={(e) => setVideoAspectRatio(e.target.value)}
                className="w-full bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg p-2.5 text-sm text-[#f8f7f5] focus:outline-none focus:border-[#c8b4a0]/40"
              >
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#c8b4a0] text-xs">Duration</Label>
              <select 
                value={videoDuration}
                onChange={(e) => setVideoDuration(e.target.value)}
                className="w-full bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg p-2.5 text-sm text-[#f8f7f5] focus:outline-none focus:border-[#c8b4a0]/40"
              >
                <option value="4s">4 Seconds</option>
                <option value="6s">6 Seconds</option>
                <option value="8s">8 Seconds</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#c8b4a0] text-xs">Resolution</Label>
              <select 
                value={videoResolution}
                onChange={(e) => setVideoResolution(e.target.value)}
                className="w-full bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg p-2.5 text-sm text-[#f8f7f5] focus:outline-none focus:border-[#c8b4a0]/40"
              >
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="4K">4K Ultra HD</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#c8b4a0] text-xs">Number of Results</Label>
              <select 
                value={videoNumResults.toString()}
                onChange={(e) => setVideoNumResults(parseInt(e.target.value))}
                className="w-full bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg p-2.5 text-sm text-[#f8f7f5] focus:outline-none focus:border-[#c8b4a0]/40"
              >
                <option value="1">1 Video</option>
                <option value="2">2 Videos</option>
                <option value="3">3 Videos</option>
                <option value="4">4 Videos</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#c8b4a0] text-xs">Negative Prompt</Label>
            <Textarea
              value={videoNegativePrompt}
              onChange={(e) => setVideoNegativePrompt(e.target.value)}
              placeholder="E.g., blurry, distorted, bad quality..."
              className="min-h-[80px] bg-[#1a1d18] border-[#c8b4a0]/20 text-[#f8f7f5] placeholder:text-[#c8b4a0]/40 text-sm"
            />
          </div>
        </div>
      )}

      {isGenerating && generationProgress !== undefined && generationProgress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-[#c8b4a0] font-light px-1">
            <span>{statusMessage || 'Processing...'}</span>
            <span>{generationProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#1a1d18] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#6b5545] to-[#8a7060] transition-all duration-500 ease-out"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={disabled || isGenerating}
        className="w-full bg-gradient-to-r from-[#6b5545] to-[#8a7060] hover:from-[#8a7060] hover:to-[#6b5545] text-[#f8f7f5] font-light text-lg py-6"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {statusMessage ? statusMessage : (
              <>
                {featureMode === 'generate' && 'Generating...'}
                {featureMode === 'thumbnail' && 'Creating Thumbnail...'}
                {featureMode === 'upscale' && 'Upscaling...'}
                {featureMode === 'unblur' && 'Enhancing...'}
                {featureMode === 'edit' && 'Editing...'}
                {featureMode === 'img2vid' && 'Animating Image...'}
                {featureMode === 'vid2vid' && 'Processing Video...'}
              </>
            )}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            {featureMode === 'generate' && 'Generate Image'}
            {featureMode === 'thumbnail' && 'Generate Thumbnail'}
            {featureMode === 'upscale' && 'Upscale Image'}
            {featureMode === 'unblur' && 'Unblur & Enhance'}
            {featureMode === 'edit' && 'Edit Image'}
            {featureMode === 'img2vid' && 'Animate Image'}
            {featureMode === 'vid2vid' && 'Transform Video'}
          </>
        )}
      </Button>

      {disabled && !isGenerating && (
        <p className="text-[#c8b4a0]/60 text-sm text-center">
          {(featureMode === 'generate' || featureMode === 'thumbnail')
            ? 'Please upload a reference image and at least one source image'
            : featureMode === 'vid2vid'
            ? 'Please upload a video to continue'
            : 'Please upload an image to continue'
          }
        </p>
      )}
    </form>
  );
}
