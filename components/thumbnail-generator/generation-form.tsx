'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Sparkles } from 'lucide-react';
import { generationFormSchema, type GenerationFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface GenerationFormProps {
  onGenerate: (prompt?: string) => Promise<void>;
  disabled: boolean;
}

export function GenerationForm({ onGenerate, disabled }: GenerationFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<GenerationFormData>({
    resolver: zodResolver(generationFormSchema),
  });

  const onSubmit = async (data: GenerationFormData) => {
    setIsGenerating(true);
    try {
      await onGenerate(data.prompt);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-[#f8f7f5]">
          Additional Instructions (Optional)
        </Label>
        <Textarea
          id="prompt"
          placeholder="E.g., Make it more vibrant, add text overlay, focus on faces..."
          className="min-h-[100px] bg-[#1a1d18] border-[#c8b4a0]/20 text-[#f8f7f5] placeholder:text-[#c8b4a0]/40"
          {...register('prompt')}
        />
        {errors.prompt && (
          <p className="text-red-400 text-sm">{errors.prompt.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={disabled || isGenerating}
        className="w-full bg-gradient-to-r from-[#6b5545] to-[#8a7060] hover:from-[#8a7060] hover:to-[#6b5545] text-[#f8f7f5] font-light text-lg py-6"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Generating Thumbnails...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            Generate Thumbnails
          </>
        )}
      </Button>

      {disabled && !isGenerating && (
        <p className="text-[#c8b4a0]/60 text-sm text-center">
          Please upload a reference image and at least one source image
        </p>
      )}
    </form>
  );
}
