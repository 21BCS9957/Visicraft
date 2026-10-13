'use client';

import { outputDimensions, playgroundModel } from './models';
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
    quality: null,
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

  // A finished 40-image Feed run, and a 9:16 Extend of its first six (for "Another size").
  const themes = ['Hero shot on dark walnut, warm diya light', 'Flat lay on linen with loose chamomile', 'Gift hamper with gold ribbon, Diwali bokeh', 'Bedside at night with a steaming cup', 'Minimal sage-green studio, one hard shadow', 'Close-up of the label, soft side light', 'Morning tray with a brass cup and marigolds', 'Hands holding the box by a window'];
  const feedPrompts = Array.from({ length: 40 }, (_, i) => `${themes[i % themes.length]} — take ${Math.floor(i / themes.length) + 1}`);
  const feed: PlaygroundRun = {
    ...run,
    id: 'preview-run-feed',
    ratios: ['4:5'],
    prompts: feedPrompts,
    imageCount: 40,
    createdAt: iso(7_200_000),
  };
  const feedItems: PlaygroundItem[] = feedPrompts.map((_, position) => ({
    id: `preview-feed-${position}`, runId: feed.id, kind: 'generated', parentItemId: null, position, promptIndex: position,
    aspectRatio: '4:5', variation: 1, status: 'done', imageUrl: SAMPLES[position % SAMPLES.length], previewUrl: SAMPLES[position % SAMPLES.length],
    width: 1856, height: 2304, error: null, favorite: false, attempts: 1, hasCanvas: false,
    startedAt: iso(7_100_000), finishedAt: iso(7_000_000), createdAt: feed.createdAt,
  }));
  const reels: PlaygroundRun = {
    ...feed,
    id: 'preview-run-reels',
    ratios: ['9:16'],
    brief: '',
    references: [],
    prompts: feedPrompts.slice(0, 6),
    imageCount: 6,
    createdAt: iso(3_600_000),
    resize: { method: 'extend', fromRunId: feed.id },
  };
  const reelsItems: PlaygroundItem[] = feedItems.slice(0, 6).map((original) => ({
    ...original, id: `preview-reels-${original.position}`, runId: reels.id, parentItemId: original.id, aspectRatio: '9:16',
    width: 1536, height: 2752, createdAt: reels.createdAt,
  }));
  return {
    project: {
      id: PREVIEW_PROJECT_ID,
      name: 'Night Unwind tea — Diwali set',
      brief: '# Brew Sage — Night Unwind\n\n## Product\nChamomile & lemongrass infusion, 30 tea bags. Keep the purple pill, the logo and the **CAFFEINE FREE** ribbon exactly.\n\n## Look\n- Warm, calm, premium\n- Indian festive season: diyas, marigolds, brass\n- Never cluttered; one hero product per image',
      briefName: 'brew-sage-guidelines.md',
      settings: { model: 'gemini-3-pro-image', size: '2K', ratios: ['4:5', '9:16'], variations: 1, thinking: 'minimal' },
      kind: 'image',
      coverUrl: SAMPLES[0],
      createdAt: iso(86_400_000),
      updatedAt: iso(600_000),
    },
    references: [
      { id: 'ref-1', url: SAMPLES[0], role: 'product', label: 'Box front', enabled: true, width: 1280, height: 720, sourceItemId: null, createdAt: iso(86_400_000) },
      { id: 'ref-2', url: SAMPLES[2], role: 'product', label: 'Box side', enabled: false, width: 1280, height: 720, sourceItemId: null, createdAt: iso(86_000_000) },
      { id: 'ref-3', url: SAMPLES[1], role: 'style', label: 'Moody Diwali style', enabled: true, width: 1280, height: 720, sourceItemId: null, createdAt: iso(85_000_000) },
    ],
    runs: [run, reels, feed],
    items: [...items, ...feedItems, ...reelsItems],
    nextBefore: null,
    refunded: 0,
  };
}

let previewCounter = 0;

/** A fake image generation: done after a few seconds, now and then a failure. */
export async function simulateGenerate(id: string): Promise<{ status: number; body: GenerateResponse }> {
  const before = usePlaygroundStore.getState();
  // Fit copies are a quick composite on the server; the rest take an AI call.
  const fit = before.runs.find((known) => known.id === before.items[id]?.runId)?.resize?.method === 'fit';
  await new Promise((resolve) => setTimeout(resolve, fit ? 300 + Math.random() * 600 : 1_500 + Math.random() * 3_000));
  const state = usePlaygroundStore.getState();
  const item = state.items[id];
  // ?previewOpenAiPaused: OpenAI images answer as they do when the OpenAI key has no credit left.
  const run = state.runs.find((known) => known.id === item.runId);
  if (new URLSearchParams(window.location.search).has('previewOpenAiPaused') && playgroundModel(run?.model).provider === 'openai') {
    return {
      status: 503,
      body: {
        outcome: 'paused',
        item: { ...item, status: 'queued', startedAt: null },
        message: 'OpenAI says this API key has no credit left. Add credit in the OpenAI dashboard (Settings → Billing), then resume.',
      },
    };
  }
  const n = previewCounter++;
  const failed = !fit && n % 9 === 5;
  // A copy shows its original (the preview has no real composite).
  const original = run?.resize && item.parentItemId ? state.items[item.parentItemId] : undefined;
  const sample = original?.imageUrl ?? SAMPLES[n % SAMPLES.length];
  const pixels = outputDimensions(run?.size ?? '2K', item.aspectRatio) ?? { width: 1536, height: 2752 };
  const done: PlaygroundItem = {
    ...item,
    status: failed ? 'failed' : 'done',
    imageUrl: failed ? null : sample,
    previewUrl: failed ? null : sample,
    error: failed ? 'Gemini returned no image (preview). Try again.' : null,
    width: failed ? null : pixels.width,
    height: failed ? null : pixels.height,
    attempts: item.attempts + 1,
    finishedAt: new Date().toISOString(),
  };
  return { status: 200, body: { outcome: failed ? 'failed' : 'done', item: done } };
}

/** Dev preview Library: a few images and one guideline document. */
const PREVIEW_ANALYSIS: import('./types').LibraryVideoAnalysis = {
  format: 'Creator UGC review',
  hook: 'A close-up of the product in hand before a word is said',
  style: 'ugc',
  audio: 'Voice-over in Hinglish, light room tone, no music',
  brief: 'Handheld phone footage at arm\'s length. The product fills the frame in the first second, then the creator talks to camera while using it; quick cuts every 2-3 seconds and a calm hero shot at the end.',
  sequence: [
    { t: '0-2s', shot: 'Extreme close-up of the product in hand, label to camera', camera: 'handheld push-in', purpose: 'hook' },
    { t: '2-5s', shot: 'Creator holds it up beside her face and starts talking', camera: 'handheld', purpose: 'problem' },
    { t: '5-9s', shot: 'Using the product at a bathroom counter', camera: 'cut, static', text: 'Day 1', purpose: 'proof' },
    { t: '9-12s', shot: 'The product on the counter, soft daylight', camera: 'slow push-in', purpose: 'CTA' },
  ],
  analyzedAt: new Date().toISOString(),
};

/** Sample folders for the Library preview (?previewPlayground=1). */
export function previewLibraryFolders(kind: import('./types').LibraryKind): import('./types').LibraryFolder[] {
  const now = new Date().toISOString();
  if (kind === 'video') {
    return [
      { id: 'folder-video-1', kind, name: 'Reference videos', count: 2, createdAt: now },
      { id: 'folder-video-2', kind, name: 'Diwali 2026', count: 1, createdAt: now },
    ];
  }
  if (kind === 'image') return [{ id: 'folder-image-1', kind, name: 'Brew Sage packshots', count: 2, createdAt: now }];
  return [];
}

export function previewLibrary(kind: import('./types').LibraryKind): import('./types').LibraryItem[] {
  const now = Date.now();
  const empty = { folderId: null, posterUrl: null, durationSeconds: null, analysis: null };
  if (kind === 'document') {
    const content = '# Brew Sage brand guidelines\n\n## Voice\nWarm, calm, premium. Never loud.\n\n## Photography\n- One hero product per image\n- Warm diya light for festive work\n- Keep the logo and the CAFFEINE FREE ribbon exact';
    return [{ id: 'lib-doc-1', kind: 'document', name: 'brew-sage-guidelines.md', url: null, preview: content.slice(0, 400), length: content.length, width: null, height: null, mimeType: 'text/markdown', sizeBytes: content.length, source: 'upload', createdAt: new Date(now - 86_400_000).toISOString(), ...empty }];
  }
  if (kind === 'video') {
    return [
      { name: 'Serum UGC review', folderId: 'folder-video-1', analysis: PREVIEW_ANALYSIS, duration: 12.4, clip: '/showcase-videos/creator-ads/01.mp4' },
      { name: 'Unboxing in daylight', folderId: 'folder-video-1', analysis: null, duration: 9.8, clip: '/showcase-videos/creator-ads/02.mp4' },
      { name: 'Festive film', folderId: 'folder-video-2', analysis: null, duration: 15, clip: '/showcase-videos/creator-ads/03.mp4' },
    ].map((sample, index) => ({
      id: `lib-video-${index}`, kind: 'video' as const, name: sample.name, url: sample.clip,
      preview: null, length: null, width: 1080, height: 1920, mimeType: 'video/mp4', sizeBytes: 8_400_000, source: 'upload' as const,
      createdAt: new Date(now - index * 3_600_000).toISOString(),
      folderId: sample.folderId, posterUrl: null, durationSeconds: sample.duration, analysis: sample.analysis,
    }));
  }
  return SAMPLES.map((url, index) => ({
    id: `lib-img-${index}`, kind: 'image' as const, name: ['Box front', 'Moody Diwali style', 'Box side'][index] ?? 'Image', url,
    preview: null, length: null, width: 1280, height: 720, mimeType: 'image/png', sizeBytes: 250_000, source: 'upload' as const,
    createdAt: new Date(now - index * 3_600_000).toISOString(),
    ...empty,
    folderId: index < 2 ? 'folder-image-1' : null,
  }));
}

/** What Gemini "sees" in a preview video (no API call). */
export function previewVideoAnalysis(): import('./types').LibraryVideoAnalysis {
  return { ...PREVIEW_ANALYSIS, analyzedAt: new Date().toISOString() };
}
