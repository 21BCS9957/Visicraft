'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { isPreviewRequested } from '@/lib/playground/preview';

const noSubscribe = () => () => {};

/** True for the dev-only ?previewPlayground=1 (false while rendering on the server). */
export function usePreviewFlag(): boolean {
  return useSyncExternalStore(noSubscribe, isPreviewRequested, () => false);
}

const STORAGE_EVENT = 'visicraft:local-setting';

/** A number kept in localStorage (per browser), with a fallback the server renders. */
export function useStoredNumber(key: string, fallback: number, min: number, max: number): [number, (value: number) => void] {
  const read = useCallback(() => {
    try {
      const value = Number(window.localStorage.getItem(key));
      return value >= min && value <= max ? value : fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback, min, max]);
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(STORAGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(STORAGE_EVENT, onChange);
    };
  }, []);
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback((next: number) => {
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Private browsing: nothing is kept.
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, [key]);
  return [value, set];
}
