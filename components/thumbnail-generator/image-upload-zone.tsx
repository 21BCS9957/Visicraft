'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { validateImageFile, MAX_SOURCE_IMAGES } from '@/lib/validations';
import { UploadedImage } from '@/types';
import { Button } from '@/components/ui/button';

interface ImageUploadZoneProps {
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
}

export function ImageUploadZone({ onImagesChange, maxImages = MAX_SOURCE_IMAGES }: ImageUploadZoneProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [error, setError] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError('');
    
    if (images.length + acceptedFiles.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    const validFiles: UploadedImage[] = [];
    
    for (const file of acceptedFiles) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        continue;
      }

      validFiles.push({
        file,
        preview: URL.createObjectURL(file),
        id: Math.random().toString(36).substring(2),
      });
    }

    const newImages = [...images, ...validFiles];
    setImages(newImages);
    onImagesChange(newImages);
  }, [images, maxImages, onImagesChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 5 * 1024 * 1024,
  });

  const removeImage = (id: string) => {
    const newImages = images.filter(img => img.id !== id);
    setImages(newImages);
    onImagesChange(newImages);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-300
          ${isDragActive 
            ? 'border-[#c8b4a0] bg-[#c8b4a0]/5' 
            : 'border-[#c8b4a0]/20 hover:border-[#c8b4a0]/40'
          }
          bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-[#c8b4a0] mb-4" />
        <p className="text-[#f8f7f5] font-light mb-2">
          {isDragActive ? 'Drop images here' : 'Drag & drop images here'}
        </p>
        <p className="text-[#c8b4a0] text-sm">
          or click to select ({images.length}/{maxImages})
        </p>
        <p className="text-[#c8b4a0]/60 text-xs mt-2">
          JPG, PNG, WebP • Max 5MB per image
        </p>
      </div>

      {error && (
        <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group aspect-video rounded-lg overflow-hidden border border-[#c8b4a0]/20"
            >
              <img
                src={image.preview}
                alt="Upload preview"
                className="w-full h-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                onClick={() => removeImage(image.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
