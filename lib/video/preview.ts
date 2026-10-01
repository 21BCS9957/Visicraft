'use client';

import type { PlaygroundProject, PlaygroundProjectSummary } from '@/lib/playground/types';
import type { ProductCapture } from './client';
import { DEFAULT_VIDEO_MODEL, type StudioVideo } from './shared';

/**
 * Dev-only sample data for /playground/video?previewVideoStudio=1: the whole Video Studio,
 * including a simulated planning run, with no API calls or credits.
 */

const PHOTOS = [
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/90_da4b0dbe-efd0-44fe-a7cf-f39605d40532.jpg',
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/91_fb2dd131-c904-44d0-9c78-90b16b097866.jpg',
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/93_38a7df80-916e-4047-859f-d8a988d26593.jpg',
];
const CLIPS = ['/showcase-videos/creator-ads/01.mp4', '/showcase-videos/creator-ads/02.mp4', '/showcase-videos/creator-ads/03.mp4'];

export function isVideoPreviewRequested(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  // The Playground's own preview flag carries over through its tabs.
  return params.has('previewVideoStudio') || params.has('previewPlayground');
}

export function previewCapture(url: string): ProductCapture {
  return {
    requestedUrl: url,
    finalUrl: url,
    title: 'Burnt Orange Tissue Saree with Zari Border',
    vendor: 'HMR Handlooms',
    price: 12499,
    currency: 'INR',
    images: PHOTOS.map((photo) => ({ url: photo, source: 'shopify' })),
  };
}

const REVIEW_PROMPT = '15-second vertical luxury product film. Photoreal, cinematic 35mm look. The product is the only subject: no people, no hands, no mannequin.\n\nThe product is exactly the one in the reference images: a sheer burnt-orange tissue saree with a gold zari border. Keep its colours, materials, shape, pattern and any printed text exactly as in the reference images in every shot.\n\nOpening scene: Image 1.\n\nSetting: a heritage haveli room in late-morning light.\n\nShot 1 (0-4s): Extreme close-up. A glint sweeps across the zari border (Image 2). Slow lateral slide.\nShot 2 (4-8s): Close-up. The sheer pallu lifts in a breeze (Image 3). Fixed camera.\n\nConstraints: keep it subtitle-free and avoid generating any text or subtitles.';

export function previewReview(id: string) {
  return {
    id,
    model: 'dreamina-seedance-2-5-260628',
    quality: '1080p' as const,
    durationSeconds: 15,
    mode: 'reference' as const,
    frames: [
      { url: PHOTOS[0], label: 'Opening scene (the ad frame)' },
      { url: PHOTOS[1], label: 'zari border close-up' },
      { url: PHOTOS[2], label: 'sheer pallu drape' },
    ],
    prompt: REVIEW_PROMPT,
    credits: 512,
    notes: ['Seedance 2.5 does not accept photos of real people, so the film is built from 2 people-free views of the product and opens on the ad frame.'],
    writtenBy: 'Written by Claude Opus 5.5 from the shot sequences of 2 winning videos (modelled on Taneira)',
  };
}

export function previewHistory(): StudioVideo[] {
  const now = Date.now();
  const iso = (ago: number) => new Date(now - ago).toISOString();
  const base = (id: string, ago: number, extra: Partial<StudioVideo>): StudioVideo => ({
    id,
    createdAt: iso(ago),
    title: 'Burnt Orange Tissue Saree',
    style: 'cinematic',
    poster: PHOTOS[0],
    review: null,
    cancelled: false,
    prompt: REVIEW_PROMPT,
    settings: { model: 'veo-3.1-generate-001', quality: 'draft', durationSeconds: 8, style: 'cinematic' },
    takes: [],
    ...extra,
  });
  const take = (key: string, ago: number, extra: Partial<StudioVideo['takes'][number]>) => ({
    key,
    operationId: `preview-${key}`,
    status: 'ready' as const,
    url: CLIPS[1],
    model: 'veo-3.1-fast-generate-preview',
    quality: 'draft' as const,
    durationSeconds: 8,
    nativeDraft: false,
    credits: 48,
    error: null,
    createdAt: iso(ago),
    ...extra,
  });
  return [
    base('preview-review', 120_000, { review: previewReview('preview-review'), settings: { model: 'dreamina-seedance-2-5-260628', quality: '1080p', durationSeconds: 15, style: 'cinematic' } }),
    base('preview-rendering', 300_000, { title: 'Night Unwind Herbal Tea', style: 'ugc', poster: '/Youtube%20Template/Youtube_Generated.png', takes: [take('preview-rendering', 240_000, { status: 'rendering', url: null, quality: '1080p', model: 'veo-3.1-generate-001', credits: 192 })] }),
    base('preview-ready', 3_600_000, { style: 'demo', poster: PHOTOS[1], takes: [take('preview-ready', 3_500_000, { url: CLIPS[0] }), take('preview-ready-hd', 3_000_000, { url: CLIPS[0], quality: '1080p', model: 'veo-3.1-generate-001', credits: 192 })] }),
    base('preview-draft', 7_200_000, { title: 'Brew Sage Chamomile', style: 'talking_head', poster: PHOTOS[2], takes: [take('preview-draft', 7_100_000, { url: CLIPS[2] })] }),
    base('preview-failed', 86_400_000, { title: 'Lace bralette set', style: 'ugc', poster: PHOTOS[2], takes: [take('preview-failed', 86_000_000, { status: 'failed', url: null, error: 'Veo’s safety filter rejected this video, including a retry with a neutral product-only prompt. Your 192 video credits were refunded.' })] }),
    base('preview-cancelled', 2 * 86_400_000, { cancelled: true, poster: PHOTOS[1] }),
  ];
}

/** A scripted planning run: the events /api/generate streams, spaced out like the real thing. */
export function previewPlanEvents(reviewId: string): Array<{ after: number; event: Record<string, unknown> }> {
  return [
    { after: 600, event: { type: 'stage', id: 'understand', status: 'active', detail: 'Reading the product' } },
    { after: 1600, event: { type: 'stage', id: 'understand', status: 'done', detail: 'handloom tissue saree', data: { niche: 'handloom sarees', price: '₹12,499', tier: 'premium', keywords: ['tissue saree', 'zari saree'], competitors: ['Taneira', 'Suta'], locked: ['Burnt-orange tissue weave', 'Narrow gold zari border of small flowers'] } } },
    { after: 500, event: { type: 'stage', id: 'research', status: 'active', detail: 'Scraping Meta Ad Library', data: { scraped: 0, relevant: 0, styled: 0, winners: 0 } } },
    { after: 1800, event: { type: 'stage', id: 'research', status: 'active', detail: '186 video ads scraped', data: { scraped: 186, relevant: 23, styled: 4, winners: 0 } } },
    { after: 1600, event: { type: 'stage', id: 'research', status: 'done', detail: '2 winners', data: { scraped: 186, relevant: 23, styled: 4, winners: 2, ads: [{ id: 'a1', pageName: 'Taneira', daysRunning: 142, libraryUrl: 'https://www.facebook.com/ads/library/', imageUrl: PHOTOS[1], mediaKind: 'video', style: 'cinematic', styleConfirmed: true }, { id: 'a2', pageName: 'Suta', daysRunning: 96, libraryUrl: 'https://www.facebook.com/ads/library/', imageUrl: PHOTOS[2], mediaKind: 'video', style: 'cinematic' }] } } },
    { after: 400, event: { type: 'stage', id: 'analyze', status: 'done', detail: 'Slow reveals, heritage settings', data: { designs: [{ pageName: 'Taneira', format: 'Cinematic reveal', hook: 'A drape catching light', daysRunning: 142, sequence: [{ t: '0-2s', shot: 'Border close-up' }, { t: '2-6s', shot: 'Pallu in breeze' }] }] } } },
    { after: 900, event: { type: 'stage', id: 'plan', status: 'done', detail: 'Heritage haveli', data: { angles: [{ index: 0, name: 'Heritage haveli', withText: false, modelledOn: 'Taneira', brief: 'The saree alone in a sunlit haveli room, light sweeping the zari.' }] } } },
    { after: 300, event: { type: 'stage', id: 'generate', status: 'active', detail: 'Hero frame' } },
    { after: 2200, event: { type: 'creative', index: 0, url: PHOTOS[0] } },
    { after: 200, event: { type: 'stage', id: 'generate', status: 'done', detail: 'Hero frame ready', data: { passed: 1, retrying: 0, withheld: 0 } } },
    { after: 1400, event: { type: 'storyboard', storyboard: { hook: 'Light sweeps across the zari', style: 'cinematic', shots: [{ t: '0-4s', action: 'A glint sweeps across the zari border', camera: 'Slow lateral slide' }, { t: '4-8s', action: 'The sheer pallu lifts in a breeze', camera: 'Fixed' }], mood: 'calm, warm' } } },
    { after: 100, event: { type: 'stage', id: 'storyboard', status: 'done', detail: 'Light sweeps across the zari', data: { storyboard: { hook: 'Light sweeps across the zari', style: 'cinematic', shots: [{ t: '0-4s', action: 'A glint sweeps across the zari border', camera: 'Slow lateral slide' }, { t: '4-8s', action: 'The sheer pallu lifts in a breeze', camera: 'Fixed' }] } } } },
    { after: 300, event: { type: 'video_review', reviewId, review: previewReview(reviewId) } },
    { after: 100, event: { type: 'stage', id: 'review', status: 'active', detail: 'Waiting for your approval' } },
    { after: 100, event: { type: 'done', acceptedCount: 1, reviewId } },
  ];
}

export const PREVIEW_CLIP = CLIPS[1];

export const PREVIEW_VIDEO_PROJECT_ID = 'preview-video';

export function previewVideoProjects(): PlaygroundProjectSummary[] {
  const now = Date.now();
  return [
    { id: PREVIEW_VIDEO_PROJECT_ID, name: 'Tissue saree — festive films', coverUrl: PHOTOS[0], imageCount: 0, referenceCount: 0, videoCount: 7, updatedAt: new Date(now - 3_600_000).toISOString() },
    { id: 'preview-video-2', name: 'Night Unwind tea — UGC', coverUrl: '/Youtube%20Template/Youtube_Generated.png', imageCount: 0, referenceCount: 0, videoCount: 2, updatedAt: new Date(now - 86_400_000 * 2).toISOString() },
    { id: 'preview-video-3', name: 'Video · 1 Oct', coverUrl: null, imageCount: 0, referenceCount: 0, videoCount: 0, updatedAt: new Date(now - 86_400_000 * 5).toISOString() },
  ];
}

export function previewVideoProject(id: string): PlaygroundProject {
  const now = new Date().toISOString();
  return {
    id,
    name: 'Tissue saree — festive films',
    brief: '# HMR Handlooms\n- Heritage, handwoven, never glossy or synthetic-looking.\n- Warm late-morning light; no neon, no city streets.\n- The zari border must always read clearly.',
    briefName: 'hmr-guidelines.md',
    kind: 'video',
    settings: {
      product: {
        url: 'https://hmrhandlooms.com/products/burnt-orange-tissue-saree',
        title: 'Burnt Orange Tissue Saree with Zari Border',
        vendor: 'HMR Handlooms',
        description: null,
        price: 12499,
        currency: 'INR',
        storePhotos: PHOTOS,
        selected: PHOTOS,
        photos: [],
        name: '',
      },
      video: { model: DEFAULT_VIDEO_MODEL, duration: 10, quality: 'draft', style: 'cinematic', research: null, notes: '' },
    },
    coverUrl: PHOTOS[0],
    createdAt: now,
    updatedAt: now,
  };
}

