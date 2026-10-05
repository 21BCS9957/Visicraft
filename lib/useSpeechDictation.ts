'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

const noSubscribe = () => () => {};
const isSupported = () => getSpeechRecognitionCtor() !== null;

export type SpeechDictationOptions = {
  /** BCP 47 language tag; Indian English (en-IN) by default */
  lang?: string;
  /** Put between the existing text and the dictated words when the text doesn't end in whitespace (default a space) */
  separator?: string;
  /** Fired for recoverable and fatal errors (e.g. `not-allowed`, `network`) */
  onError?: (error: string) => void;
};

/** What to tell the user about a recognition error (or `unsupported`); null when it needs no message. */
export function dictationErrorMessage(code: string): string | null {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access denied. Allow the microphone in your browser settings.';
    case 'service-not-allowed':
      return 'Voice input is not available. Check your browser permissions.';
    case 'network':
      return 'Voice recognition failed (network). Check your connection.';
    case 'audio-capture':
      return 'No microphone found. Check that one is connected.';
    case 'unsupported':
      return 'Voice input is not supported in this browser. Try Chrome, Edge, or Safari.';
    default:
      return null;
  }
}

/**
 * Browser speech-to-text (Web Speech API), similar to ChatGPT voice input:
 * continuous listening with interim results appended to the controlled text.
 */
export function useSpeechDictation(
  setText: (value: string | ((prev: string) => string)) => void,
  options?: SpeechDictationOptions
) {
  const onErrorRef = useRef(options?.onError);
  // The latest handler, kept after each render (refs can't be written during render).
  useEffect(() => {
    onErrorRef.current = options?.onError;
  });
  const [isListening, setIsListening] = useState(false);
  // The server render assumes support; the browser's answer replaces it on hydration.
  const supported = useSyncExternalStore(noSubscribe, isSupported, () => true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef('');
  const finalsRef = useRef('');
  const lang = options?.lang ?? 'en-IN';
  const defaultSeparator = options?.separator ?? ' ';

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

  /** Stops at once and drops any result still on its way, so it can't overwrite an edit. */
  const cancel = useCallback(() => {
    disposeRecognition();
    setIsListening(false);
  }, [disposeRecognition]);

  const start = useCallback(
    (currentText: string, separator: string = defaultSeparator) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;

      disposeRecognition();
      // Dictated words start after a separator, not glued to the last typed word.
      baseRef.current = currentText && !/\s$/.test(currentText) ? currentText + separator : currentText;
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
    [defaultSeparator, disposeRecognition, lang, setText]
  );

  const toggle = useCallback(
    (currentText: string, separator?: string) => {
      if (isListening) {
        stop();
      } else {
        start(currentText, separator);
      }
    },
    [isListening, start, stop]
  );

  return {
    isListening,
    supported,
    start,
    stop,
    cancel,
    toggle,
  };
}

export type SpeechDictation = ReturnType<typeof useSpeechDictation>;
