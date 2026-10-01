import 'server-only';

import type { VideoProjectProduct, VideoProjectSettings } from '@/lib/playground/types';

/** What a video project may save as its product and New video choices, cleaned and capped. */

const MAX_STORE_PHOTOS = 24;
const MAX_PHOTOS = 12;

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function urls(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(httpUrl).filter((url): url is string => Boolean(url)))].slice(0, max);
}

export function cleanVideoProduct(raw: unknown): VideoProjectProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const storePhotos = urls(r.storePhotos, MAX_STORE_PHOTOS);
  const photos = (Array.isArray(r.photos) ? r.photos : [])
    .map((photo) => {
      const p = (photo && typeof photo === 'object' ? photo : {}) as Record<string, unknown>;
      const url = httpUrl(p.url);
      return url ? { url, name: text(p.name, 160) ?? '' } : null;
    })
    .filter((photo): photo is { url: string; name: string } => photo !== null)
    .slice(0, MAX_PHOTOS);
  const price = Number(r.price);
  return {
    url: httpUrl(r.url),
    title: text(r.title, 300),
    vendor: text(r.vendor, 160),
    description: text(r.description, 4000),
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: typeof r.currency === 'string' && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : null,
    storePhotos,
    // Only store photos that were found, and no more than a video takes.
    selected: urls(r.selected, MAX_PHOTOS).filter((url) => storePhotos.includes(url)),
    photos,
    name: text(r.name, 160) ?? '',
  };
}

export function cleanVideoSettings(raw: unknown): VideoProjectSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const duration = Number(r.duration);
  return {
    model: text(r.model, 120) ?? '',
    duration: Number.isFinite(duration) && duration > 0 && duration <= 60 ? Math.round(duration) : 8,
    quality: ['draft', '720p', '1080p', '4k'].includes(String(r.quality)) ? String(r.quality) : '1080p',
    style: ['ugc', 'talking_head', 'demo', 'cinematic', 'any'].includes(String(r.style)) ? String(r.style) : 'any',
    research: typeof r.research === 'boolean' ? r.research : null,
    notes: text(r.notes, 1500) ?? '',
  };
}
