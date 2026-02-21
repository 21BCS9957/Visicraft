'use client';

import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { TextToSpeechForm } from '@/components/text-to-speech/text-to-speech-form';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Icon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const CREDIT_COST = 15;

const FEATURES = [
  {
    id: 'tts',
    name: 'Text to Speech',
    description: 'Convert text to natural-sounding speech',
    icon: 'ph:waveform-fill',
    color: '#8b7355',
  },
];

export default function TextToSpeechPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const { user } = useAuth();
  const { credits, deductCredits, refreshCredits, addCredits } = useCredits();
  const router = useRouter();

  const handleGenerate = async (text: string, voiceId: string, expression: string) => {
    setError('');
    
    if (!user) {
      setError('Insufficient balance! Sign up to get free credits and start creating.');
      setTimeout(() => {
        router.push('/login?redirectTo=/text-to-speech');
      }, 2000);
      return;
    }

    if (credits < CREDIT_COST) {
      toast.error(`Insufficient credits! Need ${CREDIT_COST}, have ${credits}`);
      setError(`You need ${CREDIT_COST} credits. Current balance: ${credits} credits.`);
      return;
    }

    const deducted = await deductCredits(CREDIT_COST);
    if (!deducted) {
      toast.error('Failed to deduct credits. Please try again.');
      return;
    }

    toast.success(`${CREDIT_COST} credits deducted. Processing...`);

    try {
      const response = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId,
          expression,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Speech generation failed');
      }

      const result = await response.json();
      setGeneratedAudio(result.audioUrl);
      await refreshCredits();
      toast.success('Speech generated successfully!');
    } catch (err) {
      await addCredits(CREDIT_COST);
      await refreshCredits();
      
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26]">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#8b7355] to-[#6b5545] mb-4 sm:mb-6">
            <Icon icon="ph:waveform-fill" className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extralight text-[#f8f7f5] tracking-[0.2em] uppercase mb-3 sm:mb-4">
            Text to Speech
          </h1>
          <p className="text-[#c8b4a0] text-base sm:text-lg font-light mb-4 sm:mb-6 px-4 max-w-2xl mx-auto">
            Transform your text into natural, expressive speech. Choose from a variety of voices and expressions.
          </p>

          {/* Credit Cost Display */}
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#8b7355]/10 border border-[#8b7355]/30 rounded-lg">
            <Icon icon="ph:coins-fill" className="w-4 h-4 sm:w-5 sm:h-5 text-[#c8b4a0]" />
            <span className="text-[#c8b4a0] text-xs sm:text-sm font-light">
              {CREDIT_COST} credits per generation
            </span>
          </div>
        </div>

        {/* Main Form */}
        <div className="max-w-4xl mx-auto">
          <Card className="p-4 sm:p-6 md:p-8 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]">
            <TextToSpeechForm 
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              generatedAudio={generatedAudio}
            />
          </Card>

          {/* Error Display */}
          {error && (
            <div className={`mt-6 p-4 rounded-lg text-sm max-w-2xl mx-auto ${
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
                      onClick={() => router.push('/login?redirectTo=/text-to-speech')}
                      className="mt-3 px-4 py-2 bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white rounded-lg text-sm font-light hover:shadow-lg transition-all"
                    >
                      Sign Up for Free Credits
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Features Grid */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl bg-[#1a1d18]/50 border border-[#c8b4a0]/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#8b7355]/20 flex items-center justify-center">
                <Icon icon="ph:waveform-fill" className="w-6 h-6 text-[#8b7355]" />
              </div>
              <h3 className="text-white font-light mb-2">Natural Voices</h3>
              <p className="text-[#c8b4a0]/60 text-sm">High-quality neural voices that sound human</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#1a1d18]/50 border border-[#c8b4a0]/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#8b7355]/20 flex items-center justify-center">
                <Icon icon="ph:face-smiling-fill" className="w-6 h-6 text-[#8b7355]" />
              </div>
              <h3 className="text-white font-light mb-2">Expressive Styles</h3>
              <p className="text-[#c8b4a0]/60 text-sm">Choose from various emotional expressions</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#1a1d18]/50 border border-[#c8b4a0]/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#8b7355]/20 flex items-center justify-center">
                <Icon icon="ph:download-simple-fill" className="w-6 h-6 text-[#8b7355]" />
              </div>
              <h3 className="text-white font-light mb-2">Easy Export</h3>
              <p className="text-[#c8b4a0]/60 text-sm">Download audio in MP3 format instantly</p>
            </div>
          </div>
        </div>
      </div>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 1000,
          className: 'mobile-toast',
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #2a2a2a',
            maxWidth: '90vw',
            pointerEvents: 'none',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
}
