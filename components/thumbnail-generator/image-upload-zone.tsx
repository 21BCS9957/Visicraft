'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Info } from 'lucide-react';
import { validateImageFile, MAX_SOURCE_IMAGES } from '@/lib/validations';
import { UploadedImage } from '@/types';
import { Button } from '@/components/ui/button';

interface ImageUploadZoneProps {
  onImagesChange: (images: UploadedImage[]) => void;
  initialImages?: UploadedImage[];
  maxImages?: number;
}

export function ImageUploadZone({ onImagesChange, initialImages, maxImages = MAX_SOURCE_IMAGES }: ImageUploadZoneProps) {
  const [images, setImages] = useState<UploadedImage[]>(initialImages ?? []);
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
      'image/jpg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 5 * 1024 * 1024,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection) {
        const errorCode = rejection.errors[0]?.code;
        if (errorCode === 'file-too-large') {
          setError('File is too large. Maximum size is 5MB');
        } else if (errorCode === 'file-invalid-type') {
          setError('Invalid file type. Please upload JPG, PNG, or WebP images');
        } else {
          setError('File upload failed. Please try again');
        }
      }
    },
  });

  const removeImage = (id: string) => {
    const newImages = images.filter(img => img.id !== id);
    setImages(newImages);
    onImagesChange(newImages);
  };

  return (
    <div className="space-y-4 flex flex-col">
      <div className="flex items-start gap-2 text-[#c8b4a0] text-sm h-[4rem] shrink-0">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          {images.length > 0
            ? `${images.length}/${maxImages} images • drag or click to add more`
            : 'Upload source images (1–10) that will be transformed to match your reference style'}
        </span>
      </div>
      <div
        {...getRootProps()}
        className={`
          relative w-full h-[280px] border-2 border-dashed rounded-lg cursor-pointer
          flex flex-col p-4
          transition-all duration-300
          ${isDragActive 
            ? 'border-[#c8b4a0] bg-[#c8b4a0]/5' 
            : 'border-[#c8b4a0]/20 hover:border-[#c8b4a0]/40'
          }
          bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]
        `}
      >
        <input {...getInputProps()} />
        {images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Upload className="mx-auto h-16 w-16 text-[#c8b4a0] mb-4" />
            <p className="text-[#f8f7f5] font-light text-lg mb-2">
              {isDragActive ? 'Drop images here' : 'Upload Source Images'}
            </p>
            <p className="text-[#c8b4a0] text-sm">
              Click or drag to upload ({images.length}/{maxImages})
            </p>
            <p className="text-[#c8b4a0]/60 text-xs mt-2">
              JPG, PNG, WebP • Max 5MB per image
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-auto">
              {(() => {
                const rows: UploadedImage[][] = [];
                for (let i = 0; i < images.length; i += 2) {
                  rows.push(images.slice(i, i + 2));
                }
                return rows.map((rowImages, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="flex-1 flex flex-row gap-2 min-h-0"
                  >
                    {rowImages.map((image) => (
                      <div
                        key={image.id}
                        className="flex-1 min-h-0 min-w-0 relative group rounded-lg overflow-hidden border border-[#c8b4a0]/20 bg-[#1a1d18]"
                      >
                        <img
                          src={image.preview}
                          alt="Upload preview"
                          className="w-full h-full object-contain"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(image.id);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ));
              })()}
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
