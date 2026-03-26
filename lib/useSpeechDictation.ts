'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechDictationOptions = {
  /** BCP 47 language tag, e.g. en-US */
  lang?: string;
  /** Fired for recoverable and fatal errors (e.g. `not-allowed`, `network`) */
  onError?: (error: string) => void;
};

/**
 * Browser speech-to-text (Web Speech API), similar to ChatGPT voice input:
 * continuous listening with interim results appended to the controlled text.
 */
export function useSpeechDictation(
  setText: (value: string | ((prev: string) => string)) => void,
  options?: SpeechDictationOptions
) {
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef('');
  const finalsRef = useRef('');
  const lang = options?.lang ?? 'en-US';

  const getOnError = () => onErrorRef.current;

  const disposeRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
    try {
      rec.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      disposeRecognition();
    };
  }, [disposeRecognition]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        disposeRecognition();
      }
    } else {
      setIsListening(false);
    }
  }, [disposeRecognition]);

  const start = useCallback(
    (currentText: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setSupported(false);
        return;
      }

      disposeRecognition();
      baseRef.current = currentText;
      finalsRef.current = '';

      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;

      rec.onstart = () => setIsListening(true);

      rec.onresult = (event: Event) => {
        const ev = event as unknown as {
          resultIndex: number;
          results: { length: number; [i: number]: { 0?: { transcript?: string }; isFinal: boolean } };
        };
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i][0]?.transcript ?? '';
          if (ev.results[i].isFinal) {
            finalsRef.current += piece;
          } else {
            interim += piece;
          }
        }
        const next = baseRef.current + finalsRef.current + interim;
        setText(next);
      };

      rec.onerror = (event: Event) => {
        const err = (event as unknown as { error?: string }).error ?? 'unknown';
        if (err === 'aborted') return;
        if (err === 'no-speech') return;
        getOnError()?.(err);
        setIsListening(false);
        disposeRecognition();
      };

      rec.onend = () => {
        setIsListening(false);
        disposeRecognition();
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch {
        setIsListening(false);
        disposeRecognition();
      }
    },
    [disposeRecognition, lang, setText]
  );

  const toggle = useCallback(
    (currentText: string) => {
      if (isListening) {
        stop();
      } else {
        start(currentText);
      }
    },
    [isListening, start, stop]
  );

  return {
    isListening,
    supported,
    start,
    stop,
    toggle,
  };
}
