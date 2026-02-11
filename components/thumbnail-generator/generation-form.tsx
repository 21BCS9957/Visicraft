'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { Icon } from '@iconify/react';
import { generationFormSchema, type GenerationFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface GenerationFormProps {
  onGenerate: (prompt?: string, selectedModel?: string) => Promise<void>;
  disabled: boolean;
  featureMode?: 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit';
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

export function GenerationForm({ onGenerate, disabled, featureMode = 'generate' }: GenerationFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<GenerationFormData>({
    resolver: zodResolver(generationFormSchema),
  });

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
              {AI_MODELS.map((model) => (
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
              : 'E.g., Make it more vibrant, add text overlay, focus on faces...'
          }
          className="min-h-[100px] bg-[#1a1d18] border-[#c8b4a0]/20 text-[#f8f7f5] placeholder:text-[#c8b4a0]/40"
          {...register('prompt')}
        />
        {errors.prompt && (
          <p className="text-red-400 text-sm">{errors.prompt.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={disabled || isGenerating}
        className="w-full bg-gradient-to-r from-[#6b5545] to-[#8a7060] hover:from-[#8a7060] hover:to-[#6b5545] text-[#f8f7f5] font-light text-lg py-6"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {featureMode === 'generate' && 'Generating...'}
            {featureMode === 'thumbnail' && 'Creating Thumbnail...'}
            {featureMode === 'upscale' && 'Upscaling...'}
            {featureMode === 'unblur' && 'Enhancing...'}
            {featureMode === 'edit' && 'Editing...'}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            {featureMode === 'generate' && 'Generate Image'}
            {featureMode === 'thumbnail' && 'Generate Thumbnail'}
            {featureMode === 'upscale' && 'Upscale Image'}
            {featureMode === 'unblur' && 'Unblur & Enhance'}
            {featureMode === 'edit' && 'Edit Image'}
          </>
        )}
      </Button>

      {disabled && !isGenerating && (
        <p className="text-[#c8b4a0]/60 text-sm text-center">
          {(featureMode === 'generate' || featureMode === 'thumbnail')
            ? 'Please upload a reference image and at least one source image'
            : 'Please upload an image to continue'
          }
        </p>
      )}
    </form>
  );
}
