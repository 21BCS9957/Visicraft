'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { isPreviewRequested } from '@/lib/playground/preview';

const noSubscribe = () => () => {};

// One observer for every measured element (a gallery can show hundreds of cards).
const widthWatchers = new Map<Element, (width: number) => void>();
let widthObserver: ResizeObserver | null = null;

/** An element's width, kept current as it resizes: pass the callback as its `ref` (0 until measured). */
export function useElementWidth(): [(element: HTMLElement | null) => void, number] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    widthObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) widthWatchers.get(entry.target)?.(entry.contentRect.width);
    });
    widthWatchers.set(element, setWidth);
    widthObserver.observe(element);
    // Measured at once too: a page that isn't drawing (a background tab) gets no resize notices.
    setWidth(element.getBoundingClientRect().width);
    return () => {
      widthWatchers.delete(element);
      widthObserver?.unobserve(element);
    };
  }, [element]);
  return [setElement, width];
}

const coarseQuery = () => window.matchMedia('(pointer: coarse)');

/** True on touch screens, where globals.css makes every button at least 44 px. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = coarseQuery();
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => coarseQuery().matches,
    () => false
  );
}

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
