'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { UploadedImage } from '@/types';
import { useAuth } from './AuthContext';

type FeatureMode = 'generate' | 'thumbnail' | 'upscale' | 'unblur' | 'edit';

interface GenerateContextValue {
  selectedFeatureId: FeatureMode;
  referenceImage: UploadedImage | null;
  sourceImages: UploadedImage[];
  singleImage: UploadedImage | null;
  prompt: string;
  setSelectedFeatureId: (id: FeatureMode) => void;
  setReferenceImage: (img: UploadedImage | null) => void;
  setSourceImages: (imgs: UploadedImage[]) => void;
  setSingleImage: (img: UploadedImage | null) => void;
  setPrompt: (prompt: string) => void;
}

const GenerateContext = createContext<GenerateContextValue>({
  selectedFeatureId: 'generate',
  referenceImage: null,
  sourceImages: [],
  singleImage: null,
  prompt: '',
  setSelectedFeatureId: () => {},
  setReferenceImage: () => {},
  setSourceImages: () => {},
  setSingleImage: () => {},
  setPrompt: () => {},
});

export function GenerateProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureMode>('generate');
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [sourceImages, setSourceImages] = useState<UploadedImage[]>([]);
  const [singleImage, setSingleImage] = useState<UploadedImage | null>(null);
  const [prompt, setPrompt] = useState('');

  // Clear all state on sign out
  useEffect(() => {
    if (!user) {
      setSelectedFeatureId('generate');
      setReferenceImage(null);
      setSourceImages([]);
      setSingleImage(null);
      setPrompt('');
    }
  }, [user]);

  return (
    <GenerateContext.Provider value={{
      selectedFeatureId,
      referenceImage,
      sourceImages,
      singleImage,
      prompt,
      setSelectedFeatureId,
      setReferenceImage,
      setSourceImages,
      setSingleImage,
      setPrompt,
    }}>
      {children}
    </GenerateContext.Provider>
  );
}

export const useGenerateState = () => useContext(GenerateContext);
