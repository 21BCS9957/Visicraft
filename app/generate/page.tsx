'use client';

import { useState } from 'react';
import { ImageUploadZone } from '@/components/thumbnail-generator/image-upload-zone';
import { ReferenceUpload } from '@/components/thumbnail-generator/reference-upload';
import { GenerationForm } from '@/components/thumbnail-generator/generation-form';
import { ThumbnailGallery } from '@/components/thumbnail-generator/thumbnail-gallery';
import { UploadedImage } from '@/types';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getCreditCostForFeature } from '@/lib/credits/calculator';
import { Icon } from '@iconify/react';
import { ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

type FeatureMode = 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit';

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
];

export default function GeneratePage() {
  const [selectedFeature, setSelectedFeature] = useState<Feature>(FEATURES[0]);
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sourceImages, setSourceImages] = useState<UploadedImage[]>([]);
  const [singleImage, setSingleImage] = useState<UploadedImage | null>(null);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const { user } = useAuth();
  const { credits, refreshCredits, addCredits } = useCredits();
  const router = useRouter();

  const handleGenerate = async (prompt?: string, selectedModel?: string) => {
    setError('');

    if (!user) {
      setError('Insufficient balance! Sign up to get free credits and start creating amazing visuals.');
      setTimeout(() => router.push('/login?redirectTo=/generate'), 2000);
      return;
    }

    if (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail') {
      if (!referenceImage || sourceImages.length === 0) {
        setError('Please upload both reference and source images');
        return;
      }
    } else {
      if (!singleImage) {
        setError('Please upload an image');
        return;
      }
    }

    const creditCost = getCreditCostForFeature(selectedFeature.id);
    if (credits < creditCost) {
      toast.error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
      setError(`You need ${creditCost} credits. Current balance: ${credits} credits.`);
      return;
    }

    toast.success('Processing...');

    try {
      let result;

      if (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail') {
        // Upload reference image
        const refFormData = new FormData();
        refFormData.append('file', referenceImage!.file);
        refFormData.append('bucket', 'source-images');
        
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

        if (generateResponse.status === 402) {
          await refreshCredits();
          const errorData = await generateResponse.json();
          toast.error(errorData.error || 'Insufficient credits');
          setError(errorData.error || 'Insufficient credits');
          return;
        }
        if (!generateResponse.ok) {
          const errorData = await generateResponse.json();
          throw new Error(errorData.error || 'Generation failed');
        }

        result = await generateResponse.json();
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

        if (apiResponse.status === 402) {
          await refreshCredits();
          const errorData = await apiResponse.json();
          toast.error(errorData.error || 'Insufficient credits');
          setError(errorData.error || 'Insufficient credits');
          return;
        }
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
      await refreshCredits();
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const canGenerate = (selectedFeature.id === 'generate' || selectedFeature.id === 'thumbnail')
    ? (referenceImage !== null && sourceImages.length > 0)
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
                      setSelectedFeature(feature);
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
              {getCreditCostForFeature(selectedFeature.id)} credits per operation
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
              <ImageUploadZone onImagesChange={setSourceImages} />
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
                description={
                  selectedFeature.id === 'upscale'
                    ? 'Upload an image to enhance its resolution and quality'
                    : selectedFeature.id === 'unblur'
                    ? 'Upload a blurry image to sharpen and enhance'
                    : selectedFeature.id === 'edit'
                    ? 'Upload an image you want to edit with AI'
                    : 'Upload an image to process'
                }
                title={
                  selectedFeature.id === 'upscale'
                    ? 'Upload Image to Upscale'
                    : selectedFeature.id === 'unblur'
                    ? 'Upload Blurry Image'
                    : selectedFeature.id === 'edit'
                    ? 'Upload Image to Edit'
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
