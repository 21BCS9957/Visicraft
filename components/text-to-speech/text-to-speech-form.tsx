'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Sparkles, Play, Pause, Download, Volume2, Settings2, RefreshCw, Copy, Check } from 'lucide-react';
import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

const ttsFormSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000, 'Text must be less than 5000 characters'),
});

type TTSFormData = z.infer<typeof ttsFormSchema>;

interface VoiceModel {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  style: string;
  icon: string;
  color: string;
  credits: number; // Credit cost per generation
  tier: 'ultra' | 'premium' | 'standard';
}

interface Expression {
  id: string;
  name: string;
  description: string;
  icon: string;
  ssml: string;
}

const VOICE_MODELS: VoiceModel[] = [
  // Journey Voices (Ultra Premium - Multilingual & Expressive) - 25 credits
  {
    id: 'en-US-Journey-F',
    name: 'Aria Journey',
    language: 'Multilingual',
    gender: 'female',
    style: 'Ultra Premium • Expressive',
    icon: 'ph:sparkle-fill',
    color: '#f59e0b',
    credits: 25,
    tier: 'ultra',
  },
  {
    id: 'en-US-Journey-D',
    name: 'Atlas Journey',
    language: 'Multilingual',
    gender: 'male',
    style: 'Ultra Premium • Dynamic',
    icon: 'ph:sparkle-fill',
    color: '#3b82f6',
    credits: 25,
    tier: 'ultra',
  },
  {
    id: 'en-US-Journey-O',
    name: 'Nova Journey',
    language: 'Multilingual',
    gender: 'female',
    style: 'Ultra Premium • Versatile',
    icon: 'ph:sparkle-fill',
    color: '#ec4899',
    credits: 25,
    tier: 'ultra',
  },
  
  // Studio Voices (Most Natural - Premium) - 20 credits
  {
    id: 'en-US-Studio-O',
    name: 'Olivia Studio',
    language: 'English (US)',
    gender: 'female',
    style: 'Premium Natural',
    icon: 'ph:star-fill',
    color: '#a855f7',
    credits: 20,
    tier: 'premium',
  },
  {
    id: 'en-US-Studio-Q',
    name: 'Quinn Studio',
    language: 'English (US)',
    gender: 'male',
    style: 'Premium Natural',
    icon: 'ph:star-fill',
    color: '#6366f1',
    credits: 20,
    tier: 'premium',
  },
  // Wavenet Voices (Very Natural) - 15 credits
  {
    id: 'en-US-Wavenet-C',
    name: 'Clara',
    language: 'English (US)',
    gender: 'female',
    style: 'Natural & Clear',
    icon: 'ph:waveform-fill',
    color: '#10b981',
    credits: 15,
    tier: 'premium',
  },
  {
    id: 'en-US-Wavenet-A',
    name: 'Alex',
    language: 'English (US)',
    gender: 'male',
    style: 'Natural & Professional',
    icon: 'ph:waveform-fill',
    color: '#0ea5e9',
    credits: 15,
    tier: 'premium',
  },
  {
    id: 'en-US-Wavenet-F',
    name: 'Fiona',
    language: 'English (US)',
    gender: 'female',
    style: 'Natural & Warm',
    icon: 'ph:waveform-fill',
    color: '#8b5cf6',
    credits: 15,
    tier: 'premium',
  },
  {
    id: 'en-US-Wavenet-H',
    name: 'Hannah',
    language: 'English (US)',
    gender: 'female',
    style: 'Natural & Friendly',
    icon: 'ph:waveform-fill',
    color: '#14b8a6',
    credits: 15,
    tier: 'premium',
  },
  {
    id: 'en-GB-Wavenet-A',
    name: 'Amelia',
    language: 'English (UK)',
    gender: 'female',
    style: 'British Natural',
    icon: 'ph:waveform-fill',
    color: '#84cc16',
    credits: 15,
    tier: 'premium',
  },
  {
    id: 'en-GB-Wavenet-B',
    name: 'Benjamin',
    language: 'English (UK)',
    gender: 'male',
    style: 'British Natural',
    icon: 'ph:waveform-fill',
    color: '#06b6d4',
    credits: 15,
    tier: 'premium',
  },
  // Neural2 Voices (Standard) - 10 credits
  {
    id: 'en-US-Neural2-J',
    name: 'James',
    language: 'English (US)',
    gender: 'male',
    style: 'Professional',
    icon: 'ph:user-fill',
    color: '#64748b',
    credits: 10,
    tier: 'standard',
  },
  {
    id: 'en-US-Neural2-A',
    name: 'Adam',
    language: 'English (US)',
    gender: 'male',
    style: 'Standard',
    icon: 'ph:user-fill',
    color: '#71717a',
    credits: 10,
    tier: 'standard',
  },
  {
    id: 'en-US-Neural2-C',
    name: 'Catherine',
    language: 'English (US)',
    gender: 'female',
    style: 'Standard',
    icon: 'ph:user-fill',
    color: '#78716c',
    credits: 10,
    tier: 'standard',
  },
  {
    id: 'en-US-Neural2-F',
    name: 'Faith',
    language: 'English (US)',
    gender: 'female',
    style: 'Energetic',
    icon: 'ph:user-fill',
    color: '#737373',
    credits: 10,
    tier: 'standard',
  },
  {
    id: 'en-GB-Neural2-F',
    name: 'Emily',
    language: 'English (UK)',
    gender: 'female',
    style: 'British Standard',
    icon: 'ph:user-fill',
    color: '#6b7280',
  },
  {
    id: 'en-GB-Neural2-D',
    name: 'Daniel',
    language: 'English (UK)',
    gender: 'male',
    style: 'British Standard',
    icon: 'ph:user-fill',
    color: '#52525b',
  },
  {
    id: 'hi-IN-Neural2-A',
    name: 'Aditi',
    language: 'Hindi',
    gender: 'female',
    style: 'Expressive',
    icon: 'ph:user-fill',
    color: '#f97316',
  },
  {
    id: 'hi-IN-Neural2-B',
    name: 'Bhavesh',
    language: 'Hindi',
    gender: 'male',
    style: 'Deep & Authoritative',
    icon: 'ph:user-fill',
    color: '#ea580c',
  },
];

const EXPRESSIONS: Expression[] = [
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Standard speaking voice',
    icon: 'ph:waveform',
    ssml: '',
  },
  {
    id: 'cheerful',
    name: 'Cheerful',
    description: 'Happy and enthusiastic',
    icon: 'ph:smiley-fill',
    ssml: '<express-as type="GoodNews">',
  },
  {
    id: 'sad',
    name: 'Sad',
    description: 'Solemn and melancholy',
    icon: 'ph:smiley-sad-fill',
    ssml: '<express-as type="Sadness">',
  },
  {
    id: 'angry',
    name: 'Angry',
    description: 'Firm and forceful',
    icon: 'ph:smiley-angry-fill',
    ssml: '<express-as type="Anger">',
  },
  {
    id: 'fearful',
    name: 'Fearful',
    description: 'Anxious and nervous',
    icon: 'ph:smiley-nervous-fill',
    ssml: '<express-as type="Fear">',
  },
  {
    id: 'disgusted',
    name: 'Disgusted',
    description: 'Unpleasant and aversion',
    icon: 'ph:smiley-pouting-fill',
    ssml: '<express-as type="Disgust">',
  },
  {
    id: 'excited',
    name: 'Excited',
    description: 'Energetic and thrilled',
    icon: 'ph:star-fill',
    ssml: '<express-as type="Excited">',
  },
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'Warm and approachable',
    icon: 'ph:hand-waving-fill',
    ssml: '<express-as type="Friendly">',
  },
];

const CREDIT_COST = 15; // Base cost, will be overridden by voice model

interface TextToSpeechFormProps {
  onGenerate: (text: string, voiceId: string, expression: string) => Promise<void>;
  isGenerating: boolean;
  generatedAudio: string | null;
}

export function TextToSpeechForm({ onGenerate, isGenerating, generatedAudio }: TextToSpeechFormProps) {
  const [selectedVoice, setSelectedVoice] = useState<VoiceModel>(VOICE_MODELS[0]);
  const [selectedExpression, setSelectedExpression] = useState<Expression>(EXPRESSIONS[0]);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showExpressionDropdown, setShowExpressionDropdown] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [volumeGain, setVolumeGain] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<TTSFormData>({
    resolver: zodResolver(ttsFormSchema),
    defaultValues: { text: '' },
  });

  const watchedText = watch('text');

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const onSubmit = async (data: TTSFormData) => {
    await onGenerate(data.text, selectedVoice.id, selectedExpression.id);
  };

  const handlePlayPause = () => {
    if (!audioRef.current || !generatedAudio) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (!generatedAudio) return;
    const link = document.createElement('a');
    link.href = generatedAudio;
    link.download = `visicraft-tts-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audio downloaded!');
  };

  const handleCopy = async () => {
    if (!watchedText) return;
    await navigator.clipboard.writeText(watchedText);
    setIsCopied(true);
    toast.success('Text copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Audio Player */}
      {generatedAudio && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#8b7355]/20 via-[#6b5545]/20 to-[#8b7355]/20 border border-[#c8b4a0]/20 p-6">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjEiLz48L3N2Zz4=')] opacity-50"></div>
          
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handlePlayPause}
                className="w-14 h-14 rounded-full bg-gradient-to-r from-[#8b7355] to-[#6b5545] flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-1" />
                )}
              </button>
              <div>
                <p className="text-white font-medium">Audio Generated</p>
                <p className="text-[#c8b4a0]/60 text-sm">Click to play</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="p-3 rounded-xl bg-[#c8b4a0]/10 hover:bg-[#c8b4a0]/20 transition-colors text-[#c8b4a0]"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Waveform Animation */}
          <div className="mt-4 flex items-center justify-center gap-1 h-8">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className={`w-1 bg-[#8b7355] rounded-full transition-all duration-300 ${
                  isPlaying ? 'animate-pulse' : ''
                }`}
                style={{
                  height: isPlaying ? `${Math.random() * 100}%` : '20%',
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
          
          <audio
            ref={audioRef}
            src={generatedAudio}
            onEnded={() => setIsPlaying(false)}
            onLoadedData={() => {
              if (audioRef.current) {
                audioRef.current.play();
                setIsPlaying(true);
              }
            }}
          />
        </div>
      )}

      {/* Text Input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="text" className="text-[#f8f7f5] text-lg font-light">
            Enter Your Text
          </Label>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!watchedText}
            className="flex items-center gap-2 text-sm text-[#c8b4a0] hover:text-white transition-colors disabled:opacity-50"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {isCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <Textarea
          id="text"
          placeholder="Enter the text you want to convert to speech. You can write anything from short announcements to long articles..."
          className="min-h-[180px] bg-[#1a1d18] border-[#c8b4a0]/20 text-[#f8f7f5] placeholder:text-[#c8b4a0]/40 text-lg leading-relaxed resize-none"
          {...register('text')}
        />
        <div className="flex items-center justify-between text-sm">
          {errors.text ? (
            <p className="text-red-400">{errors.text.message}</p>
          ) : (
            <p className="text-[#c8b4a0]/60">
              {watchedText?.length || 0} / 5000 characters
            </p>
          )}
        </div>
      </div>

      {/* Voice & Expression Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Voice Model Selection */}
        <div className="space-y-3">
          <Label className="text-[#f8f7f5] flex items-center gap-2">
            <Icon icon="ph:microphone-fill" className="w-5 h-5 text-[#8b7355]" />
            Voice Model
          </Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowVoiceDropdown(!showVoiceDropdown);
                setShowExpressionDropdown(false);
              }}
              className="w-full flex items-center justify-between px-5 py-4 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-xl text-[#f8f7f5] hover:border-[#c8b4a0]/40 transition-all"
            >
              <div className="flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${selectedVoice.color}20` }}
                >
                  <Icon 
                    icon={selectedVoice.icon} 
                    className="w-5 h-5" 
                    style={{ color: selectedVoice.color }}
                  />
                </div>
                <div className="text-left">
                  <div className="text-base font-medium flex items-center gap-2">
                    {selectedVoice.name}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#8b7355]/20 text-[#c8b4a0]">
                      {selectedVoice.credits}
                    </span>
                  </div>
                  <div className="text-xs text-[#c8b4a0]/60">{selectedVoice.language} • {selectedVoice.style}</div>
                </div>
              </div>
              <Icon 
                icon="ph:caret-down" 
                className={`w-5 h-5 text-[#c8b4a0] transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showVoiceDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-xl shadow-2xl z-20 max-h-[320px] overflow-y-auto">
                {VOICE_MODELS.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => {
                      setSelectedVoice(voice);
                      setShowVoiceDropdown(false);
                    }}
                    className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-[#c8b4a0]/10 transition-colors border-b border-[#c8b4a0]/10 last:border-b-0 ${
                      selectedVoice.id === voice.id ? 'bg-[#8b7355]/10' : ''
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${voice.color}20` }}
                    >
                      <Icon 
                        icon={voice.icon} 
                        className="w-5 h-5" 
                        style={{ color: voice.color }}
                      />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-[#f8f7f5] font-medium flex items-center gap-2">
                        {voice.name}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#8b7355]/20 text-[#c8b4a0]">
                          {voice.credits} credits
                        </span>
                      </div>
                      <div className="text-xs text-[#c8b4a0]/60">{voice.language} • {voice.style}</div>
                    </div>
                    {selectedVoice.id === voice.id && (
                      <Icon icon="ph:check-circle-fill" className="w-5 h-5 text-[#8b7355] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expression Selection */}
        <div className="space-y-3">
          <Label className="text-[#f8f7f5] flex items-center gap-2">
            <Icon icon="ph:face-smiling-fill" className="w-5 h-5 text-[#8b7355]" />
            Expression / Style
          </Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowExpressionDropdown(!showExpressionDropdown);
                setShowVoiceDropdown(false);
              }}
              className="w-full flex items-center justify-between px-5 py-4 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-xl text-[#f8f7f5] hover:border-[#c8b4a0]/40 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#8b7355]/20 flex items-center justify-center">
                  <Icon 
                    icon={selectedExpression.icon} 
                    className="w-5 h-5 text-[#8b7355]" 
                  />
                </div>
                <div className="text-left">
                  <div className="text-base font-medium">{selectedExpression.name}</div>
                  <div className="text-xs text-[#c8b4a0]/60">{selectedExpression.description}</div>
                </div>
              </div>
              <Icon 
                icon="ph:caret-down" 
                className={`w-5 h-5 text-[#c8b4a0] transition-transform ${showExpressionDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showExpressionDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1d18] border border-[#c8b4a0]/20 rounded-xl shadow-2xl z-20 max-h-[320px] overflow-y-auto">
                {EXPRESSIONS.map((expr) => (
                  <button
                    key={expr.id}
                    type="button"
                    onClick={() => {
                      setSelectedExpression(expr);
                      setShowExpressionDropdown(false);
                    }}
                    className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-[#c8b4a0]/10 transition-colors border-b border-[#c8b4a0]/10 last:border-b-0 ${
                      selectedExpression.id === expr.id ? 'bg-[#8b7355]/10' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#8b7355]/20 flex items-center justify-center flex-shrink-0">
                      <Icon 
                        icon={expr.icon} 
                        className="w-5 h-5 text-[#8b7355]" 
                      />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-[#f8f7f5] font-medium">{expr.name}</div>
                      <div className="text-xs text-[#c8b4a0]/60">{expr.description}</div>
                    </div>
                    {selectedExpression.id === expr.id && (
                      <Icon icon="ph:check-circle-fill" className="w-5 h-5 text-[#8b7355] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="rounded-xl border border-[#c8b4a0]/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="w-full flex items-center justify-between px-5 py-4 bg-[#1a1d18]/50 hover:bg-[#1a1d18] transition-colors"
        >
          <div className="flex items-center gap-3 text-[#f8f7f5]">
            <Settings2 className="w-5 h-5 text-[#8b7355]" />
            <span className="font-light">Advanced Settings</span>
          </div>
          <Icon 
            icon="ph:caret-down" 
            className={`w-5 h-5 text-[#c8b4a0] transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvancedSettings && (
          <div className="px-5 py-6 bg-[#1a1d18]/30 space-y-6 border-t border-[#c8b4a0]/20">
            {/* Speaking Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[#f8f7f5] text-sm">Speaking Rate</Label>
                <span className="text-[#c8b4a0] text-sm font-mono">{speakingRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={speakingRate}
                onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#c8b4a0]/20 rounded-lg appearance-none cursor-pointer accent-[#8b7355]"
              />
              <div className="flex justify-between text-xs text-[#c8b4a0]/60">
                <span>Slower (0.5x)</span>
                <span>Normal (1.0x)</span>
                <span>Faster (2.0x)</span>
              </div>
            </div>

            {/* Pitch */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[#f8f7f5] text-sm">Pitch</Label>
                <span className="text-[#c8b4a0] text-sm font-mono">{pitch > 0 ? '+' : ''}{pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.5"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#c8b4a0]/20 rounded-lg appearance-none cursor-pointer accent-[#8b7355]"
              />
              <div className="flex justify-between text-xs text-[#c8b4a0]/60">
                <span>Lower (-5)</span>
                <span>Normal (0)</span>
                <span>Higher (+5)</span>
              </div>
            </div>

            {/* Volume Gain */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[#f8f7f5] text-sm">Volume Gain</Label>
                <span className="text-[#c8b4a0] text-sm font-mono">{volumeGain > 0 ? '+' : ''}{volumeGain.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="0.5"
                value={volumeGain}
                onChange={(e) => setVolumeGain(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#c8b4a0]/20 rounded-lg appearance-none cursor-pointer accent-[#8b7355]"
              />
              <div className="flex justify-between text-xs text-[#c8b4a0]/60">
                <span>Quieter (-5 dB)</span>
                <span>Normal (0 dB)</span>
                <span>Louder (+5 dB)</span>
              </div>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={() => {
                setSpeakingRate(1.0);
                setPitch(0);
                setVolumeGain(0);
                toast.success('Settings reset to default');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#c8b4a0]/10 hover:bg-[#c8b4a0]/20 text-[#c8b4a0] rounded-lg transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Reset to Default
            </button>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="space-y-4">
        <Button
          type="submit"
          disabled={isGenerating || !watchedText}
          className="w-full bg-gradient-to-r from-[#6b5545] to-[#8a7060] hover:from-[#8a7060] hover:to-[#6b5545] text-[#f8f7f5] font-light text-lg py-6 rounded-xl"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating Speech...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generate Speech
            </>
          )}
        </Button>
        
        <div className="flex items-center justify-center gap-2 text-[#c8b4a0]/60 text-sm">
          <Icon icon="ph:coins-fill" className="w-4 h-4" />
          <span>{selectedVoice.credits} credits per generation</span>
          {selectedVoice.tier === 'ultra' && (
            <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-[#f59e0b]/20 to-[#ec4899]/20 text-[#f59e0b] text-xs">
              Ultra Premium
            </span>
          )}
          {selectedVoice.tier === 'premium' && (
            <span className="px-2 py-0.5 rounded-full bg-[#8b7355]/20 text-[#c8b4a0] text-xs">
              Premium
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
