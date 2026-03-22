'use client';

import { useState, useCallback } from 'react';
import { ImageUploadZone } from '@/components/thumbnail-generator/image-upload-zone';
import { ReferenceUpload } from '@/components/thumbnail-generator/reference-upload';
import { VideoUpload } from '@/components/thumbnail-generator/video-upload';
import { GenerationForm } from '@/components/thumbnail-generator/generation-form';
import { ThumbnailGallery } from '@/components/thumbnail-generator/thumbnail-gallery';
import { UploadedImage } from '@/types';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useGenerateState } from '@/lib/contexts/GenerateContext';
import { Icon } from '@iconify/react';
import { ChevronDown } from 'lucide-react';
import toast from '@/lib/toast';
import { useRouter } from 'next/navigation';

type FeatureMode = 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit' | 'img2vid' | 'vid2vid';

interface Feature {
  id: FeatureMode;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const FEATURES: Feature[] = [
  {
    id: 'generate',
    name: 'Generate Image',
    description: 'Create AI-generated images from reference',
    icon: 'ph:magic-wand-fill',
    color: '#8b7355',
  },
  {
    id: 'thumbnail',
    name: 'Generate Thumbnail',
    description: 'Create eye-catching thumbnails for videos',
    icon: 'ph:video-fill',
    color: '#ef4444',
  },
  {
    id: 'upscale',
    name: 'Upscale Image',
    description: 'Enhance resolution up to 4x',
    icon: 'ph:arrows-out-fill',
    color: '#3b82f6',
  },
  {
    id: 'unblur',
    name: 'Unblur/Enhance',
    description: 'Sharpen and deblur images',
    icon: 'ph:eye-fill',
    color: '#10b981',
  },
  {
    id: 'edit',
    name: 'Edit Image',
    description: 'Modify images with AI prompts',
    icon: 'ph:pencil-fill',
    color: '#f59e0b',
  },
  {
    id: 'img2vid',
    name: 'Image to Video',
    description: 'Animate a static image into a video',
    icon: 'ph:film-strip-fill',
    color: '#a855f7',
  },
  {
    id: 'vid2vid',
    name: 'Video to Video',
    description: 'Transform a video with AI styling',
    icon: 'ph:video-camera-fill',
    color: '#ec4899',
  },
];

// Strategic pricing based on API costs and profitability
// Gemini Pro 3 costs: ~$0.002-0.005 per image generation
// Target margin: 80-90% profit
const CREDIT_COSTS: Record<FeatureMode, number> = {
  'generate': 65,      // Standard generation - moderate complexity
  'thumbnail': 70,     // Thumbnail optimization - higher value for creators
  'upscale': 80,       // Most resource-intensive - 4x resolution processing
  'unblur': 75,        // Complex enhancement algorithms
  'edit': 70,          // AI-powered editing with prompt processing
  'img2vid': 120,
  'vid2vid': 150,
};

export default function GeneratePage() {
  const {
    selectedFeatureId,
    referenceImage,
    sourceImages,
    singleImage,
    referenceVideo,
    sourceVideo,
    prompt,
    setSelectedFeatureId,
    setReferenceImage,
    setSourceImages,
    setSingleImage,
    setReferenceVideo,
    setSourceVideo,
    setPrompt,
    videoNumResults,
    videoAspectRatio,
    videoDuration,
    videoResolution,
    videoNegativePrompt,
  } = useGenerateState();

  const selectedFeature = FEATURES.find(f => f.id === selectedFeatureId) ?? FEATURES[0];
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const { user } = useAuth();
  const { credits, deductCredits, refreshCredits, addCredits } = useCredits();
  const router = useRouter();

  const handlePromptChange = useCallback((val: string) => setPrompt(val), [setPrompt]);

  const getDynamicCreditCost = () => {
    let base = CREDIT_COSTS[selectedFeature.id] || 50;
    
    if (selectedFeature.id === 'img2vid' || selectedFeature.id === 'vid2vid') {
      let multiplier = videoNumResults;
      if (videoDuration === '10s') multiplier *= 2;
      if (videoResolution === '1080p') multiplier *= 1.5;
      if (videoResolution === '4K') multiplier *= 2;
      return Math.round(base * multiplier);
    }
    
    return base;
  };

  const handleGenerate = async (prompt?: string, selectedModel?: string) => {
    setError('');
    setGenerationProgress(0);
    setStatusMessage('');
    
    // Check if user is logged in
    if (!user) {
      setError('Insufficient balance! Sign up to get free credits and start creating amazing visuals.');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login?redirectTo=/generate');
      }, 2000);
      return;
    }
    
    console.log("DEBUG: 3 : " ,selectedFeature)
    // Validation based on feature mode
    if (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail') {
      if (!referenceImage || sourceImages.length === 0) {
        setError('Please upload both reference and source images');
        return;
      }
    } else if (selectedFeature.id === 'vid2vid') {
      if (!sourceVideo) {
        setError('Please upload a source video');
        return;
      }
    } else {
      if (!singleImage) {
        setError('Please upload an image');
        return;
      }
    }

    const creditCost = getDynamicCreditCost();

    // if (credits < creditCost) {
    //   toast.error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
    //   setError(`You need ${creditCost} credits. Current balance: ${credits} credits.`);
    //   return;
    // }

    // const amountToDeduct = creditCost;
    // const deducted = await deductCredits(amountToDeduct);
    // if (!deducted) {
    //   toast.error('Failed to deduct credits. Please try again.');
    //   return;
    // }
    
    const amountToDeduct = 0;

    toast.success(`${amountToDeduct} credits deducted. Processing...`);

    try {
      let result;

      if (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail') {
        // Upload reference image
        const refFormData = new FormData();
        refFormData.append('file', referenceImage!.file);
        refFormData.append('bucket', 'reference-images');
        
        const refResponse = await fetch('/api/upload', {
          method: 'POST',
          body: refFormData,
        });
        
        if (!refResponse.ok) throw new Error('Failed to upload reference image');
        const { url: refUrl } = await refResponse.json();

        // Upload source images
        const sourceUrls = await Promise.all(
          sourceImages.map(async (img) => {
            const formData = new FormData();
            formData.append('file', img.file);
            formData.append('bucket', 'source-images');
            
            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) throw new Error('Failed to upload source image');
            const { url } = await response.json();
            return url;
          })
        );

        // Choose API endpoint based on feature
        const apiEndpoint = selectedFeature.id === 'thumbnail' ? '/api/thumbnail' : '/api/generate';
        
        // Generate images
        const generateResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceImage: refUrl,
            sourceImages: sourceUrls,
            prompt: selectedFeature.id === 'thumbnail' 
              ? `Create an eye-catching, professional YouTube thumbnail. ${prompt || 'Make it vibrant and attention-grabbing with bold text and clear focal points.'}`
              : prompt,
            model: selectedModel || 'nano-banana-pro',
          }),
        });

        if (!generateResponse.ok) {
          const errorData = await generateResponse.json();
          throw new Error(errorData.error || 'Generation failed');
        }

        result = await generateResponse.json();
      } else if (selectedFeature.id === 'img2vid' || selectedFeature.id === 'vid2vid') {
        const isVid2vid = selectedFeature.id === 'vid2vid';
        const fileToUpload = isVid2vid ? sourceVideo!.file : singleImage!.file;
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('bucket', isVid2vid ? 'source-video' : 'source-images');
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) throw new Error(`Failed to upload ${isVid2vid ? 'video' : 'image'}`);
        const { url: fileUrl } = await uploadResponse.json();

        const apiEndpoint = `/api/${selectedFeature.id}`;
        
        const payload: Record<string, any> = {
          prompt,
          model: selectedModel || 'nano-banana-pro',
          numResults: videoNumResults,
          aspectRatio: videoAspectRatio,
          duration: videoDuration,
          resolution: videoResolution,
          negativePrompt: videoNegativePrompt,
        };
        
        if (isVid2vid) {
          payload.videoUrl = fileUrl;
        } else {
          payload.imageUrl = fileUrl;
        }

        const apiResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json();
          throw new Error(errorData.error || `${selectedFeature.name} failed`);
        }

        result = await apiResponse.json();
        
        // --- Client-Side Polling for Vertex LROs ---
        if (result.operationId) {
          setStatusMessage('Initializing video sequence...');
          setGenerationProgress(5);
          
          let isDone = false;
          let failed = false;
          let finalImages: string[] = [];

          while (!isDone) {
            await new Promise((res) => setTimeout(res, 10000)); // Poll every 10 seconds
            
            try {
              const statusRes = await fetch('/api/video-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: result.operationId })
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
                  // If we get a valid URI back
                  finalImages = statusData.url ? [statusData.url] : [];
                  setGenerationProgress(100);
                  setStatusMessage('Finalizing...');
                } else {
                  // Some models don't return accurate progress percentages, so we safeguard with 10%
                  const currentProgress = typeof statusData.progress === 'number' && statusData.progress > 0 ? statusData.progress : 15;
                  setGenerationProgress(currentProgress);
                  setStatusMessage(`Rendering video... ${currentProgress}%`);
                }
              }
            } catch (e) {
               console.error("Polling error:", e);
               // We don't break the loop on transient network errors, just keep waiting.
            }
          }
          
          if (failed) throw new Error('Generation failed during Google Vertex polling.');
          result.images = finalImages;
        }
      } else {
        // Upload single image for other operations
        const formData = new FormData();
        formData.append('file', singleImage!.file);
        formData.append('bucket', 'source-images');
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) throw new Error('Failed to upload image');
        const { url: imageUrl } = await uploadResponse.json();

        // Call appropriate API based on feature
        const apiEndpoint = `/api/${selectedFeature.id}`;
        const apiResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl,
            prompt: selectedFeature.id === 'edit' ? prompt : undefined,
            model: selectedModel || 'nano-banana-pro',
          }),
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json();
          throw new Error(errorData.error || `${selectedFeature.name} failed`);
        }

        result = await apiResponse.json();
      }

      setGeneratedThumbnails(result.images || []);
      await refreshCredits();
      toast.success(`✨ ${selectedFeature.name} complete!`);
    } catch (err) {
      await addCredits(amountToDeduct);
      await refreshCredits();
      
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const canGenerate = (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail')
    ? (referenceImage !== null && sourceImages.length > 0)
    : selectedFeature.id === 'vid2vid'
    ? (sourceVideo !== null)
    : (singleImage !== null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26] pt-16">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header with Feature Selector */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extralight text-[#f8f7f5] tracking-[0.2em] uppercase mb-3 sm:mb-4">
            AI Image Tools
          </h1>
          <p className="text-[#c8b4a0] text-base sm:text-lg font-light mb-4 sm:mb-6 px-4">
            Select a feature and let AI transform your images
          </p>

          {/* Feature Selector Dropdown */}
          <div className="max-w-md mx-auto relative px-4">
            <button
              onClick={() => setShowFeatureMenu(!showFeatureMenu)}
              className="w-full bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between hover:border-[#c8b4a0]/40 transition-colors"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div 
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${selectedFeature.color}20` }}
                >
                  <Icon 
                    icon={selectedFeature.icon} 
                    className="w-5 h-5 sm:w-6 sm:h-6" 
                    style={{ color: selectedFeature.color }}
                  />
                </div>
                <div className="text-left min-w-0 flex-1">
                  <div className="text-white font-light text-base sm:text-lg truncate">{selectedFeature.name}</div>
                  <div className="text-[#c8b4a0]/60 text-xs sm:text-sm truncate">{selectedFeature.description}</div>
                </div>
              </div>
              <ChevronDown 
                className={`w-4 h-4 sm:w-5 sm:h-5 text-[#c8b4a0] transition-transform flex-shrink-0 ml-2 ${showFeatureMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown Menu */}
            {showFeatureMenu && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-lg shadow-2xl z-50 overflow-hidden mx-4 sm:mx-0">
                {FEATURES.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => {
                      setSelectedFeatureId(feature.id);
                      setShowFeatureMenu(false);
                      setError('');
                      setGeneratedThumbnails([]);
                      toast.success(`Switched to ${feature.name}`);
                    }}
                    className={`w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 hover:bg-[#c8b4a0]/10 transition-colors border-b border-[#c8b4a0]/10 last:border-b-0 ${
                      selectedFeature.id === feature.id ? 'bg-[#c8b4a0]/5' : ''
                    }`}
                  >
                    <div 
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${feature.color}20` }}
                    >
                      <Icon 
                        icon={feature.icon} 
                        className="w-5 h-5 sm:w-6 sm:h-6" 
                        style={{ color: feature.color }}
                      />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-white font-light text-sm sm:text-base truncate">{feature.name}</div>
                      <div className="text-[#c8b4a0]/60 text-xs sm:text-sm truncate">{feature.description}</div>
                    </div>
                    {selectedFeature.id === feature.id && (
                      <Icon icon="ph:check-circle-fill" className="w-5 h-5 sm:w-6 sm:h-6 text-[#8b7355] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Credit Cost Display */}
          <div className="mt-4 inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#8b7355]/10 border border-[#8b7355]/30 rounded-lg">
            <Icon icon="ph:coins-fill" className="w-4 h-4 sm:w-5 sm:h-5 text-[#c8b4a0]" />
            <span className="text-[#c8b4a0] text-xs sm:text-sm font-light">
              {getDynamicCreditCost()} credits per operation
            </span>
          </div>
        </div>

        {/* Upload Section - Dynamic based on feature */}
        {(selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail') ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 mb-6 sm:mb-8 lg:mb-12">
            <Card className="p-4 sm:p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
              <h2 className="text-lg sm:text-xl font-light text-[#f8f7f5] mb-3 sm:mb-4 tracking-wide">
                {selectedFeature.id === 'thumbnail' ? 'Reference Thumbnail' : 'Reference Image'}
              </h2>
              <ReferenceUpload 
                onImageChange={setReferenceImage}
                initialImage={referenceImage}
                description={
                  selectedFeature.id === 'thumbnail'
                    ? 'Upload a reference thumbnail that defines the style and layout you want'
                    : 'Upload a reference image that defines the style and composition you want'
                }
                title={
                  selectedFeature.id === 'thumbnail'
                    ? 'Upload Reference Thumbnail'
                    : 'Upload Reference Image'
                }
              />
            </Card>

            <Card className="p-4 sm:p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
              <h2 className="text-lg sm:text-xl font-light text-[#f8f7f5] mb-3 sm:mb-4 tracking-wide">
                Source Images (1-10)
              </h2>
              <ImageUploadZone onImagesChange={setSourceImages} initialImages={sourceImages} />
            </Card>
          </div>
        ) : selectedFeature.id === 'vid2vid' ? (
          <div className="max-w-2xl mx-auto mb-6 sm:mb-8 lg:mb-12">
            <Card className="p-4 sm:p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
              <h2 className="text-lg sm:text-xl font-light text-[#f8f7f5] mb-3 sm:mb-4 tracking-wide">
                Upload Source Video
              </h2>
              <VideoUpload 
                onVideoChange={setSourceVideo}
                initialVideo={sourceVideo}
                description="Upload a video to transform with AI styling"
                title="Upload Source Video"
              />
            </Card>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto mb-6 sm:mb-8 lg:mb-12">
            <Card className="p-4 sm:p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
              <h2 className="text-lg sm:text-xl font-light text-[#f8f7f5] mb-3 sm:mb-4 tracking-wide">
                Upload Image
              </h2>
              <ReferenceUpload 
                onImageChange={setSingleImage}
                initialImage={singleImage}
                description={
                  selectedFeature.id === 'upscale'
                    ? 'Upload an image to enhance its resolution and quality'
                    : selectedFeature.id === 'unblur'
                    ? 'Upload a blurry image to sharpen and enhance'
                    : selectedFeature.id === 'edit'
                    ? 'Upload an image you want to edit with AI'
                    : selectedFeature.id === 'img2vid'
                    ? 'Upload an image to animate into a video'
                    : 'Upload an image to process'
                }
                title={
                  selectedFeature.id === 'upscale'
                    ? 'Upload Image to Upscale'
                    : selectedFeature.id === 'unblur'
                    ? 'Upload Blurry Image'
                    : selectedFeature.id === 'edit'
                    ? 'Upload Image to Edit'
                    : selectedFeature.id === 'img2vid'
                    ? 'Upload Image to Animate'
                    : 'Upload Image'
                }
              />
            </Card>
          </div>
        )}

        {/* Generation Form */}
        <Card className="p-4 sm:p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26] mb-8 sm:mb-12 max-w-2xl mx-auto">
          <GenerationForm 
            onGenerate={handleGenerate} 
            disabled={!canGenerate}
            featureMode={selectedFeature.id}
            defaultPrompt={prompt}
            onPromptChange={handlePromptChange}
            generationProgress={generationProgress}
            statusMessage={statusMessage}
          />
        </Card>

        {/* Error Display */}
        {error && (
          <div className={`mb-6 sm:mb-8 p-3 sm:p-4 rounded-lg text-sm sm:text-base max-w-2xl mx-auto ${
            !user 
              ? 'bg-[#8b7355]/10 border border-[#8b7355]/30 text-[#c8b4a0]' 
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            <div className="flex items-start gap-3">
              {!user && (
                <Icon icon="ph:gift-fill" className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p>{error}</p>
                {!user && (
                  <button
                    onClick={() => router.push('/login?redirectTo=/generate')}
                    className="mt-3 px-4 py-2 bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white rounded-lg text-sm font-light hover:shadow-lg transition-all"
                  >
                    Sign Up for Free Credits
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Gallery */}
        <ThumbnailGallery thumbnails={generatedThumbnails} />
      </div>
    </div>
  );
}
