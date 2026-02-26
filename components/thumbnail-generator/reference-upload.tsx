'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Info } from 'lucide-react';
import { validateImageFile } from '@/lib/validations';
import { UploadedImage } from '@/types';
import { Button } from '@/components/ui/button';

interface ReferenceUploadProps {
  onImageChange: (image: UploadedImage | null) => void;
  initialImage?: UploadedImage | null;
  description?: string;
  title?: string;
}

export function ReferenceUpload({ onImageChange, initialImage, description, title }: ReferenceUploadProps) {
  const [image, setImage] = useState<UploadedImage | null>(initialImage ?? null);
  const [error, setError] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError('');
    
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const validation = validateImageFile(file);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    const uploadedImage: UploadedImage = {
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substring(2),
    };

    setImage(uploadedImage);
    onImageChange(uploadedImage);
  }, [onImageChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
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

  const removeImage = () => {
    setImage(null);
    onImageChange(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[#c8b4a0] text-sm h-[4rem] shrink-0">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>{description || 'Upload a reference thumbnail that defines the style you want'}</span>
      </div>

      {!image ? (
        <div
          {...getRootProps()}
          className={`
            relative w-full h-[280px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center cursor-pointer
            transition-all duration-300
            ${isDragActive 
              ? 'border-[#c8b4a0] bg-[#c8b4a0]/5' 
              : 'border-[#c8b4a0]/20 hover:border-[#c8b4a0]/40'
            }
            bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]
          `}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-16 w-16 text-[#c8b4a0] mb-4" />
          <p className="text-[#f8f7f5] font-light text-lg mb-2">
            {isDragActive ? 'Drop image here' : (title || 'Upload Reference Thumbnail')}
          </p>
          <p className="text-[#c8b4a0] text-sm">
            Click or drag to upload
          </p>
          <p className="text-[#c8b4a0]/60 text-xs mt-2">
            JPG, PNG, WebP • Max 5MB
          </p>
        </div>
      ) : (
        <div className="relative group rounded-lg overflow-hidden border border-[#c8b4a0]/20 h-[280px]">
          <img
            src={image.preview}
            alt="Reference thumbnail"
            className="w-full h-full object-contain"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={removeImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
