'use client';

import type { PlaygroundProject, PlaygroundProjectSummary } from '@/lib/playground/types';
import type { ProductCapture } from './client';
import { DEFAULT_VIDEO_MODEL, type StudioVideo } from './shared';
import type { VideoAspect } from '@/lib/videoModels';

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

const REVIEW_PROMPT = [
  '15-second vertical luxury fashion film. Photoreal, cinematic 35mm look, soft late-morning light. Cast: a graceful Indian woman in her late twenties, warm brown skin, long dark hair in a low bun, small gold jhumkas, wearing the saree from the reference images. Faces look natural and real and stay the same in every shot.',
  '',
  'The product is exactly the one in the reference images: a sheer burnt-orange tissue saree with a narrow gold zari border of small flowers. Keep its colours, materials, shape, pattern and any printed text exactly as in the reference images in every shot, also when it is worn or held.',
  '',
  'Setting: a heritage haveli courtyard with carved sandstone arches in late-morning light.',
  '',
  'Shot 1 (0-4s): Wide shot. She walks slowly through the arches as sunlight falls across the saree (Image 3). Slow push-in.',
  'Shot 2 (4-8s): Extreme close-up. A glint sweeps across the zari border as the pallu moves (Image 1). Slow lateral slide.',
  'Shot 3 (8-12s): Medium shot. She turns her head and smiles softly, the sheer pallu lifting in a breeze (Image 2). Fixed camera.',
  'Shot 4 (12-15s): Wide shot. She stands still under the arch, the whole saree in view. Hold on this final frame (Image 3). Slow pull-back.',
  '',
  'Sound: (a slow, elegant sitar and tanpura melody) <soft footsteps on stone> <a light breeze>. No voice, no dialogue, no singing.',
  '',
  'Constraints: keep it subtitle-free and avoid generating any text or subtitles; do not add any logo or watermark that is not on the product itself. Only the cast appears, never a famous person. Do not change the product\'s colours, shape, pattern or printed text; no morphing, warping or melting; no flicker; one location only.',
].join('\n');

export function previewReview(id: string) {
  return {
    id,
    model: 'dreamina-seedance-2-5-260628',
    quality: '1080p' as const,
    durationSeconds: 15,
    aspectRatio: '9:16' as const,
    garment: true,
    mode: 'reference' as const,
    frames: [
      { url: PHOTOS[1], label: 'zari border close-up', kind: 'crop' as const, source: { url: PHOTOS[0], box: [0.3, 0.62, 0.45, 0.3] as [number, number, number, number] } },
      { url: PHOTOS[2], label: 'sheer pallu drape', kind: 'crop' as const, source: { url: PHOTOS[2], box: [0.18, 0.28, 0.55, 0.4] as [number, number, number, number] } },
      { url: PHOTOS[0], label: 'Scene image for shot 1', kind: 'scene' as const },
    ],
    prompt: REVIEW_PROMPT,
    credits: 512,
    notes: ['Seedance 2.5 does not accept photos of real people, so the film is built from 2 people-free product photos and a scene image made for its shots; the woman is created by Seedance from the prompt.'],
    writtenBy: 'Written from the shots of your reference video',
    referenceVideos: [{ id: 'lib-video-0', name: 'Serum UGC review', posterUrl: null, url: '/showcase-videos/creator-ads/01.mp4', shots: 4 }],
    outline: {
      hook: 'She walks through a sunlit haveli, then the zari catches the light',
      cast: 'a graceful Indian woman in her late twenties, warm brown skin, long dark hair in a low bun, small gold jhumkas, wearing the saree',
      setting: 'a heritage haveli courtyard with carved sandstone arches in late-morning light',
      shots: [
        { t: '0-4s', action: 'Wide shot. She walks slowly through the arches as sunlight falls across the saree', camera: 'Slow push-in' },
        { t: '4-8s', action: 'Extreme close-up. A glint sweeps across the zari border as the pallu moves', camera: 'Slow lateral slide' },
        { t: '8-12s', action: 'Medium shot. She turns her head and smiles softly, the sheer pallu lifting in a breeze', camera: 'Fixed camera' },
        { t: '12-15s', action: 'Wide shot. She stands still under the arch, the whole saree in view', camera: 'Slow pull-back' },
      ],
    },
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
    settings: { model: 'veo-3.1-generate-001', quality: 'draft', durationSeconds: 8, aspectRatio: '9:16', style: 'cinematic' },
    takes: [],
    plan: { mode: 'reference', frames: previewReview(id).frames },
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
    aspectRatio: '9:16' as VideoAspect,
    nativeDraft: false,
    credits: 48,
    error: null,
    createdAt: iso(ago),
    prompt: REVIEW_PROMPT,
    frames: [PHOTOS[1], PHOTOS[2], PHOTOS[0]],
    ...extra,
  });
  return [
    base('preview-review', 120_000, { review: previewReview('preview-review'), settings: { model: 'dreamina-seedance-2-5-260628', quality: '1080p', durationSeconds: 15, aspectRatio: '9:16', style: 'cinematic' } }),
    base('preview-rendering', 300_000, { title: 'Night Unwind Herbal Tea', style: 'ugc', poster: '/Youtube%20Template/Youtube_Generated.png', takes: [take('preview-rendering', 240_000, { status: 'rendering', url: null, quality: '1080p', model: 'veo-3.1-generate-001', credits: 192 })] }),
    base('preview-ready', 3_600_000, { style: 'demo', poster: PHOTOS[1], settings: { model: 'veo-3.1-generate-001', quality: 'draft', durationSeconds: 8, aspectRatio: '16:9', style: 'demo' }, takes: [take('preview-ready', 3_500_000, { url: CLIPS[0], aspectRatio: '16:9' }), take('preview-ready-hd', 3_000_000, { url: CLIPS[0], quality: '1080p', model: 'veo-3.1-generate-001', credits: 192, aspectRatio: '16:9' })] }),
    base('preview-draft', 7_200_000, { title: 'Brew Sage Chamomile', style: 'talking_head', poster: PHOTOS[2], takes: [take('preview-draft', 7_100_000, { url: CLIPS[2] })] }),
    base('preview-failed', 86_400_000, { title: 'Lace bralette set', style: 'ugc', poster: PHOTOS[2], retryable: true, takes: [take('preview-failed', 86_000_000, { status: 'failed', url: null, error: 'Seedance’s music check stopped this video: the music it generated sounded too close to an existing song. The video itself was fine. Your 62 video credits were refunded. Tap “Try again”: the sound comes out different every time.' })] }),
    base('preview-cancelled', 2 * 86_400_000, { cancelled: true, poster: PHOTOS[1] }),
  ];
}

/** A scripted planning run: the events /api/generate streams, spaced out like the real thing. */
export function previewPlanEvents(reviewId: string, aspectRatio: VideoAspect = '9:16'): Array<{ after: number; event: Record<string, unknown> }> {
  const storyboard = {
    hook: 'The saree waits in a sunlit haveli, then the zari catches the light',
    style: 'cinematic',
    shots: [
      { t: '0-4s', action: 'The saree draped over a carved jharokha bench as sunlight falls across it', camera: 'Slow push-in' },
      { t: '4-8s', action: 'A glint sweeps across the zari border', camera: 'Slow lateral slide' },
      { t: '8-15s', action: 'The sheer pallu lifts in a breeze and settles', camera: 'Fixed' },
    ],
  };
  return [
    { after: 600, event: { type: 'stage', id: 'understand', status: 'active', detail: 'Reading the product' } },
    { after: 200, event: { type: 'stage', id: 'analyze', status: 'active', detail: 'Using the shots of your reference video' } },
    { after: 1600, event: { type: 'stage', id: 'understand', status: 'done', detail: 'Product identity locked', data: { price: '₹12,499', tier: 'premium', locked: ['Burnt-orange tissue weave', 'Narrow gold zari border of small flowers'] } } },
    { after: 300, event: { type: 'stage', id: 'analyze', status: 'done', detail: '1 reference video · 4 shots', data: { designs: [{ pageName: 'Serum UGC review', format: 'Creator UGC review', hook: 'A close-up of the product in hand before a word is said', style: 'ugc', sequence: [{ t: '0-2s', shot: 'Extreme close-up of the product in hand' }, { t: '2-5s', shot: 'Creator holds it up and starts talking' }, { t: '5-9s', shot: 'Using the product at a counter' }, { t: '9-12s', shot: 'The product on the counter, soft daylight' }] }] } } },
    { after: 200, event: { type: 'stage', id: 'plan', status: 'skipped', detail: 'Planned together with the video prompt' } },
    { after: 100, event: { type: 'stage', id: 'generate', status: 'skipped', detail: 'No hero frame needed: the film is built from your photos' } },
    { after: 200, event: { type: 'stage', id: 'storyboard', status: 'active', detail: 'Writing the prompt from your reference video' } },
    { after: 2400, event: { type: 'stage', id: 'storyboard', status: 'done', detail: storyboard.hook } },
    { after: 200, event: { type: 'stage', id: 'scenes', status: 'active', detail: 'Making the scene image for the film', data: { requests: [{ shot: 1, prompt: 'The saree draped over a carved wooden jharokha bench in a heritage haveli, late-morning sun falling across the zari border; warm sandstone walls; no people.' }] } } },
    { after: 2600, event: { type: 'stage', id: 'scenes', status: 'done', detail: '1 made · shot 1', data: { images: [{ shot: 1, url: PHOTOS[0] }], aspectRatio } } },
    { after: 300, event: { type: 'storyboard', storyboard: { ...storyboard, mood: 'calm, warm' } } },
    { after: 100, event: { type: 'stage', id: 'storyboard', status: 'done', detail: storyboard.hook, data: { storyboard } } },
    { after: 300, event: { type: 'video_review', reviewId, review: { ...previewReview(reviewId), aspectRatio } } },
    { after: 100, event: { type: 'stage', id: 'review', status: 'active', detail: 'Waiting for your approval' } },
    { after: 100, event: { type: 'done', acceptedCount: 0, reviewId } },
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
      video: { model: DEFAULT_VIDEO_MODEL, duration: 10, quality: 'draft', aspectRatio: '9:16', style: 'cinematic', referenceVideoIds: ['lib-video-0'], notes: '' },
    },
    coverUrl: PHOTOS[0],
    createdAt: now,
    updatedAt: now,
  };
}

