'use client';

import { usePlaygroundStore } from './store';
import type { GenerateResponse, PlaygroundBundle, PlaygroundItem, PlaygroundProjectSummary, PlaygroundRun } from './types';

/**
 * Dev-only sample data for /playground?previewPlayground=1 and
 * /playground/preview?previewPlayground=1: the whole UI with no API calls or credits.
 */

export const PREVIEW_PROJECT_ID = 'preview';

const SAMPLES = [
  '/Youtube%20Template/Youtube_Generated.png',
  '/Youtube%20Template/youtube_Reference.png',
  '/Youtube%20Template/Youtube%20_Source.png',
];

export function isPreviewRequested(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewPlayground');
}

export function previewProjects(): PlaygroundProjectSummary[] {
  const now = Date.now();
  return [
    { id: PREVIEW_PROJECT_ID, name: 'Night Unwind tea — Diwali set', coverUrl: SAMPLES[0], imageCount: 38, referenceCount: 4, updatedAt: new Date(now - 3_600_000).toISOString() },
    { id: 'preview-2', name: 'Brew Sage launch', coverUrl: SAMPLES[1], imageCount: 12, referenceCount: 2, updatedAt: new Date(now - 86_400_000 * 2).toISOString() },
    { id: 'preview-3', name: 'Empty project', coverUrl: null, imageCount: 0, referenceCount: 0, updatedAt: new Date(now - 86_400_000 * 9).toISOString() },
  ];
}

export function previewBundle(): PlaygroundBundle {
  const now = Date.now();
  const iso = (ago: number) => new Date(now - ago).toISOString();
  const prompts = [
    'Hero shot of the tea box on a dark walnut table, warm diya light, marigold petals, steam rising from a brass cup',
    'Flat lay: the box, loose chamomile, lemongrass stalks and a handwritten "Sleep well" card on linen',
    'The box in a festive gift hamper with gold ribbon, Diwali lights bokeh behind',
    'Close-up of the box label, soft side light, shallow depth of field',
    'A cosy bedside scene at night: the box beside a steaming cup and an open book',
    'Minimal studio shot, sage-green seamless background, one hard shadow',
  ];
  const run: PlaygroundRun = {
    id: 'preview-run-1',
    model: 'gemini-3-pro-image',
    size: '2K',
    ratios: ['4:5', '9:16'],
    variations: 1,
    thinking: null,
    brief: 'Brand: Brew Sage. Product: Night Unwind chamomile & lemongrass infusion, 30 tea bags. Keep the purple pill, logo and "CAFFEINE FREE" ribbon exactly. Warm, calm, premium; Indian festive season.',
    references: [
      { id: 'ref-1', url: SAMPLES[0], role: 'product', label: 'Box front' },
      { id: 'ref-3', url: SAMPLES[1], role: 'style', label: 'Moody Diwali style' },
    ],
    prompts,
    imageCount: prompts.length * 2,
    creditsPerImage: 50,
    cancelledAt: null,
    createdAt: iso(600_000),
  };
  const statuses: PlaygroundItem['status'][] = ['done', 'done', 'done', 'done', 'done', 'failed', 'done', 'generating', 'generating', 'queued', 'queued', 'queued'];
  const items: PlaygroundItem[] = statuses.map((status, position) => ({
    id: `preview-item-${position}`,
    runId: run.id,
    kind: 'generated',
    parentItemId: null,
    position,
    promptIndex: Math.floor(position / 2),
    aspectRatio: run.ratios[position % 2],
    variation: 1,
    status,
    imageUrl: status === 'done' ? SAMPLES[position % SAMPLES.length] : null,
    previewUrl: status === 'done' ? SAMPLES[position % SAMPLES.length] : null,
    width: status === 'done' ? 1856 : null,
    height: status === 'done' ? 2304 : null,
    error: status === 'failed' ? "Gemini's safety filters blocked this image. Try rewording the prompt or using different references." : null,
    favorite: position === 2,
    attempts: status === 'queued' ? 0 : 1,
    hasCanvas: false,
    startedAt: status === 'queued' ? null : iso(120_000),
    finishedAt: status === 'done' || status === 'failed' ? iso(60_000) : null,
    createdAt: run.createdAt,
  }));
  return {
    project: {
      id: PREVIEW_PROJECT_ID,
      name: 'Night Unwind tea — Diwali set',
      brief: run.brief,
      settings: { model: 'gemini-3-pro-image', size: '2K', ratios: ['4:5', '9:16'], variations: 1, thinking: 'minimal' },
      coverUrl: SAMPLES[0],
      createdAt: iso(86_400_000),
      updatedAt: iso(600_000),
    },
    references: [
      { id: 'ref-1', url: SAMPLES[0], role: 'product', label: 'Box front', enabled: true, width: 1280, height: 720, sourceItemId: null, createdAt: iso(86_400_000) },
      { id: 'ref-2', url: SAMPLES[2], role: 'product', label: 'Box side', enabled: false, width: 1280, height: 720, sourceItemId: null, createdAt: iso(86_000_000) },
      { id: 'ref-3', url: SAMPLES[1], role: 'style', label: 'Moody Diwali style', enabled: true, width: 1280, height: 720, sourceItemId: null, createdAt: iso(85_000_000) },
    ],
    runs: [run],
    items,
    nextBefore: null,
    refunded: 0,
  };
}

let previewCounter = 0;

/** A fake image generation: done after a few seconds, now and then a failure. */
export async function simulateGenerate(id: string): Promise<{ status: number; body: GenerateResponse }> {
  await new Promise((resolve) => setTimeout(resolve, 1_500 + Math.random() * 3_000));
  const item = usePlaygroundStore.getState().items[id];
  const n = previewCounter++;
  const failed = n % 9 === 5;
  const done: PlaygroundItem = {
    ...item,
    status: failed ? 'failed' : 'done',
    imageUrl: failed ? null : SAMPLES[n % SAMPLES.length],
    previewUrl: failed ? null : SAMPLES[n % SAMPLES.length],
    error: failed ? 'Gemini returned no image (preview). Try again.' : null,
    width: failed ? null : 1536,
    height: failed ? null : 2752,
    attempts: item.attempts + 1,
    finishedAt: new Date().toISOString(),
  };
  return { status: 200, body: { outcome: failed ? 'failed' : 'done', item: done } };
}
