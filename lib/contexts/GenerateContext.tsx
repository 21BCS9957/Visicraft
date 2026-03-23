'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { UploadedImage, UploadedVideo } from '@/types';
import { useAuth } from './AuthContext';

type FeatureMode = 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit' | 'img2vid' | 'vid2vid';

interface GenerateContextValue {
  selectedFeatureId: FeatureMode;
  referenceImage: UploadedImage | null;
  sourceImages: UploadedImage[];
  singleImage: UploadedImage | null;
  referenceVideo: UploadedVideo | null;
  sourceVideo: UploadedVideo | null;
  prompt: string;
  setSelectedFeatureId: (id: FeatureMode) => void;
  setReferenceImage: (img: UploadedImage | null) => void;
  setSourceImages: (imgs: UploadedImage[]) => void;
  setSingleImage: (img: UploadedImage | null) => void;
  setReferenceVideo: (vid: UploadedVideo | null) => void;
  setSourceVideo: (vid: UploadedVideo | null) => void;
  setPrompt: (prompt: string) => void;
  videoNumResults: number;
  videoAspectRatio: string;
  videoDuration: string;
  videoResolution: string;
  videoNegativePrompt: string;
  setVideoNumResults: (n: number) => void;
  setVideoAspectRatio: (ar: string) => void;
  setVideoDuration: (dur: string) => void;
  setVideoResolution: (res: string) => void;
  setVideoNegativePrompt: (np: string) => void;
}

const GenerateContext = createContext<GenerateContextValue>({
  selectedFeatureId: 'generate',
  referenceImage: null,
  sourceImages: [],
  singleImage: null,
  referenceVideo: null,
  sourceVideo: null,
  prompt: '',
  setSelectedFeatureId: () => {},
  setReferenceImage: () => {},
  setSourceImages: () => {},
  setSingleImage: () => {},
  setReferenceVideo: () => {},
  setSourceVideo: () => {},
  setPrompt: () => {},
  videoNumResults: 1,
  videoAspectRatio: '16:9',
  videoDuration: '5s',
  videoResolution: '1080p',
  videoNegativePrompt: '',
  setVideoNumResults: () => {},
  setVideoAspectRatio: () => {},
  setVideoDuration: () => {},
  setVideoResolution: () => {},
  setVideoNegativePrompt: () => {},
});

export function GenerateProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureMode>('generate');
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sourceImages, setSourceImages] = useState<UploadedImage[]>([]);
  const [singleImage, setSingleImage] = useState<UploadedImage | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<UploadedVideo | null>(null);
  const [sourceVideo, setSourceVideo] = useState<UploadedVideo | null>(null);
  const [prompt, setPrompt] = useState('');
  const [videoNumResults, setVideoNumResults] = useState<number>(1);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>('16:9');
  const [videoDuration, setVideoDuration] = useState<string>('5s');
  const [videoResolution, setVideoResolution] = useState<string>('1080p');
  const [videoNegativePrompt, setVideoNegativePrompt] = useState<string>('');

  // Clear all state on sign out
  useEffect(() => {
    if (!user) {
      setSelectedFeatureId('generate');
      setReferenceImage(null);
      setSourceImages([]);
      setSingleImage(null);
      setReferenceVideo(null);
      setSourceVideo(null);
      setPrompt('');
      setVideoNumResults(1);
      setVideoAspectRatio('16:9');
      setVideoDuration('5s');
      setVideoResolution('1080p');
      setVideoNegativePrompt('');
    }
  }, [user]);

  return (
    <GenerateContext.Provider value={{
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
      setVideoNumResults,
      setVideoAspectRatio,
      setVideoDuration,
      setVideoResolution,
      setVideoNegativePrompt,
    }}>
      {children}
    </GenerateContext.Provider>
  );
}

export const useGenerateState = () => useContext(GenerateContext);
