'use client';

import { useState } from 'react';
import { ImageUploadZone } from '@/components/thumbnail-generator/image-upload-zone';
import { ReferenceUpload } from '@/components/thumbnail-generator/reference-upload';
import { GenerationForm } from '@/components/thumbnail-generator/generation-form';
import { ThumbnailGallery } from '@/components/thumbnail-generator/thumbnail-gallery';
import { UploadedImage } from '@/types';
import { Card } from '@/components/ui/card';

export default function GeneratePage() {
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sourceImages, setSourceImages] = useState<UploadedImage[]>([]);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  const handleGenerate = async (prompt?: string) => {
    setError('');
    
    if (!referenceImage || sourceImages.length === 0) {
      setError('Please upload both reference and source images');
      return;
    }

    try {
      // Upload reference image
      const refFormData = new FormData();
      refFormData.append('file', referenceImage.file);
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

      // Generate thumbnails
      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImageUrl: refUrl,
          sourceImageUrls: sourceUrls,
          prompt,
        }),
      });

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const { thumbnails } = await generateResponse.json();
      setGeneratedThumbnails(thumbnails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const canGenerate = referenceImage !== null && sourceImages.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26]">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extralight text-[#f8f7f5] tracking-[0.2em] uppercase mb-4">
            Generate Thumbnails
          </h1>
          <p className="text-[#c8b4a0] text-lg font-light">
            Upload your images and let AI create stunning thumbnails
          </p>
        </div>

        {/* Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <Card className="p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
            <h2 className="text-xl font-light text-[#f8f7f5] mb-4 tracking-wide">
              Reference Thumbnail
            </h2>
            <ReferenceUpload onImageChange={setReferenceImage} />
          </Card>

          <Card className="p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
            <h2 className="text-xl font-light text-[#f8f7f5] mb-4 tracking-wide">
              Source Images (1-10)
            </h2>
            <ImageUploadZone onImagesChange={setSourceImages} />
          </Card>
        </div>

        {/* Generation Form */}
        <Card className="p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26] mb-12">
          <GenerationForm onGenerate={handleGenerate} disabled={!canGenerate} />
        </Card>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Gallery */}
        <ThumbnailGallery thumbnails={generatedThumbnails} />
      </div>
    </div>
  );
}
