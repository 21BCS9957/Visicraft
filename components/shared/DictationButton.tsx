'use client';

import { Mic } from 'lucide-react';
import toast from '@/lib/toast';
import { dictationErrorMessage, type SpeechDictation } from '@/lib/useSpeechDictation';
import { cn } from '@/lib/utils';

type ToastOptions = Parameters<typeof toast.error>[1];

/**
 * The mic for a text box (Home's prompt box, the Playground's prompt boxes): starts browser
 * dictation into the box, and while listening shows a pulsing stop square.
 */
export function DictationButton({ dictation, text, separator, onStart, disabled, size = 'md', toastOptions, className }: {
  dictation: SpeechDictation;
  /** The box's text now; dictated words are added after it. */
  text: string;
  /** Overrides the hook's separator for this start (e.g. a blank line between prompts). */
  separator?: string;
  /** Runs just before listening starts (e.g. to open a collapsed box). */
  onStart?: () => void;
  disabled?: boolean;
  /** md: Home's 36 px button; sm: 32 px for the Playground boxes. */
  size?: 'md' | 'sm';
  toastOptions?: ToastOptions;
  className?: string;
}) {
  const listening = dictation.isListening;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      title={listening ? 'Stop listening' : dictation.supported ? 'Voice input' : 'Voice input not supported in this browser'}
      onClick={() => {
        if (listening) {
          dictation.stop();
          return;
        }
        if (!dictation.supported) {
          toast.error(dictationErrorMessage('unsupported') ?? '', toastOptions);
          return;
        }
        onStart?.();
        dictation.start(text, separator);
      }}
      // !p-0: app/globals.css pads every button on phones, which would squash the icon.
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full !p-0 transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'h-9 w-9' : 'h-8 w-8',
        listening
          ? 'animate-mic-listening bg-white/12 ring-1 ring-white/10 hover:bg-white/16'
          : 'text-white/60 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {listening ? (
        <span className={cn('block rounded-[2.5px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]', size === 'md' ? 'h-[11px] w-[11px]' : 'h-[9px] w-[9px]')} aria-hidden />
      ) : (
        <Mic className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
      )}
    </button>
  );
}
