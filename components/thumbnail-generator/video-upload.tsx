'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Info } from 'lucide-react';
import { validateVideoFile } from '@/lib/validations';
import { UploadedVideo } from '@/types';
import { Button } from '@/components/ui/button';

interface VideoUploadProps {
  onVideoChange: (video: UploadedVideo | null) => void;
  initialVideo?: UploadedVideo | null;
  description?: string;
  title?: string;
}

export function VideoUpload({ onVideoChange, initialVideo, description, title }: VideoUploadProps) {
  const [video, setVideo] = useState<UploadedVideo | null>(initialVideo ?? null);
  const [error, setError] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError('');
    
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const validation = validateVideoFile(file);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    const uploadedVideo: UploadedVideo = {
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substring(2),
    };

    setVideo(uploadedVideo);
    onVideoChange(uploadedVideo);
  }, [onVideoChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/quicktime': ['.mov'],
    },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection) {
        const errorCode = rejection.errors[0]?.code;
        if (errorCode === 'file-too-large') {
          setError('File is too large. Maximum size is 50MB');
        } else if (errorCode === 'file-invalid-type') {
          setError('Invalid file type. Please upload MP4, WebM, or MOV videos');
        } else {
          setError('File upload failed. Please try again');
        }
      }
    },
  });

  const removeVideo = () => {
    setVideo(null);
    onVideoChange(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[#c8b4a0] text-sm h-[4rem] shrink-0">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>{description || 'Upload a video to use as source'}</span>
      </div>

      {!video ? (
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
            {isDragActive ? 'Drop video here' : (title || 'Upload Video')}
          </p>
          <p className="text-[#c8b4a0] text-sm">
            Click or drag to upload
          </p>
          <p className="text-[#c8b4a0]/60 text-xs mt-2">
            MP4, WebM, MOV • Max 50MB
          </p>
        </div>
      ) : (
        <div className="relative group rounded-lg overflow-hidden border border-[#c8b4a0]/20 h-[280px] bg-black">
          <video
            src={video.preview}
            className="w-full h-full object-contain"
            controls
            autoPlay
            muted
            loop
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={removeVideo}
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
