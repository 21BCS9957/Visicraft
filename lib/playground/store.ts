'use client';

import { create } from 'zustand';
import { DEFAULT_PLAYGROUND_MODEL, DEFAULT_QUALITY, isPlaygroundModel, nearestSize, playgroundModel, type ImageProvider, type ImageQuality } from './models';
import type { PlaygroundBundle, PlaygroundItem, PlaygroundProject, PlaygroundReference, PlaygroundRun, PlaygroundSettings } from './types';

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  model: DEFAULT_PLAYGROUND_MODEL,
  size: '2K',
  ratios: ['4:5'],
  variations: 1,
  thinking: 'minimal',
  quality: DEFAULT_QUALITY,
};

const QUALITIES: ImageQuality[] = ['high', 'xhigh', 'max'];

/** The project's saved composer choices, made valid for the model. */
export function settingsFrom(saved: Partial<PlaygroundSettings> | undefined): PlaygroundSettings {
  const model = playgroundModel(isPlaygroundModel(saved?.model) ? saved?.model : DEFAULT_SETTINGS.model);
  const ratios = (saved?.ratios ?? DEFAULT_SETTINGS.ratios).filter((ratio) => model.ratios.includes(ratio));
  return {
    model: model.id,
    size: nearestSize(model, saved?.size ?? DEFAULT_SETTINGS.size),
    ratios: ratios.length ? ratios : ['1:1'],
    variations: Math.min(4, Math.max(1, Number(saved?.variations) || 1)),
    thinking: saved?.thinking === 'high' ? 'high' : 'minimal',
    quality: QUALITIES.includes(saved?.quality as ImageQuality) ? (saved?.quality as ImageQuality) : DEFAULT_QUALITY,
  };
}

export interface RunnerState {
  /** Item ids waiting to be sent, in the order they'll go. */
  queue: string[];
  /** Item ids with a request in flight. */
  inFlight: string[];
  /** Item ids whose request dropped; their state is being checked with the server. */
  checking: string[];
  concurrency: number;
  /** Why the whole runner stopped (the user's Visicraft credits ran out), or null while it may run. */
  paused: string | null;
  /** A provider whose key, billing or quota failed: only its images wait; other models keep going. */
  pausedProviders: Partial<Record<ImageProvider, string>>;
  /** Gemini asked us to slow down until this time (epoch ms). */
  backoffUntil: number;
}

interface PlaygroundState {
  projectId: string | null;
  project: PlaygroundProject | null;
  references: PlaygroundReference[];
  /** Newest first. */
  runs: PlaygroundRun[];
  items: Record<string, PlaygroundItem>;
  nextBefore: string | null;
  /** Dev preview: canned data, simulated generation, no API calls. */
  preview: boolean;
  runner: RunnerState;
  /** The composer's model, quality, sizes and variations. */
  settings: PlaygroundSettings;
  /** Text to put in the composer ("Reuse prompts"), taken by the composer once. */
  composerDraft: string | null;
  lightboxId: string | null;

  reset: (projectId: string | null, preview?: boolean) => void;
  setSettings: (update: Partial<PlaygroundSettings>) => void;
  setComposerDraft: (draft: string | null) => void;
  setLightbox: (id: string | null) => void;
  loadBundle: (bundle: PlaygroundBundle) => void;
  /** A quiet refresh over data already on screen: keeps runs made meanwhile and images being sent. */
  mergeBundle: (bundle: PlaygroundBundle) => void;
  appendOlder: (bundle: PlaygroundBundle) => void;
  setProject: (project: PlaygroundProject) => void;
  setReferences: (references: PlaygroundReference[]) => void;
  upsertReference: (reference: PlaygroundReference) => void;
  removeReference: (id: string) => void;
  addRun: (run: PlaygroundRun, items: PlaygroundItem[]) => void;
  upsertItems: (items: PlaygroundItem[]) => void;
  removeItem: (id: string) => void;
  setRunner: (update: Partial<RunnerState> | ((runner: RunnerState) => Partial<RunnerState>)) => void;
}

export const INITIAL_RUNNER: RunnerState = {
  queue: [],
  inFlight: [],
  checking: [],
  concurrency: 3,
  paused: null,
  pausedProviders: {},
  backoffUntil: 0,
};

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  projectId: null,
  project: null,
  references: [],
  runs: [],
  items: {},
  nextBefore: null,
  preview: false,
  runner: INITIAL_RUNNER,
  settings: DEFAULT_SETTINGS,
  composerDraft: null,
  lightboxId: null,

  reset: (projectId, preview = false) => set({
    projectId,
    project: null,
    references: [],
    runs: [],
    items: {},
    nextBefore: null,
    preview,
    runner: INITIAL_RUNNER,
    settings: DEFAULT_SETTINGS,
    composerDraft: null,
    lightboxId: null,
  }),
  setSettings: (update) => set((state) => ({ settings: { ...state.settings, ...update } })),
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  setLightbox: (lightboxId) => set({ lightboxId }),
  loadBundle: (bundle) => set({
    project: bundle.project,
    references: bundle.references,
    runs: bundle.runs,
    items: Object.fromEntries(bundle.items.map((item) => [item.id, item])),
    nextBefore: bundle.nextBefore,
    settings: settingsFrom(bundle.project.settings),
  }),
  mergeBundle: (bundle) => set((state) => {
    const fresh = new Set(bundle.runs.map((run) => run.id));
    const newest = bundle.runs[0]?.createdAt ?? '';
    const madeMeanwhile = state.runs.filter((run) => !fresh.has(run.id) && run.createdAt > newest);
    const keepRuns = new Set(madeMeanwhile.map((run) => run.id));
    const busy = new Set([...state.runner.inFlight, ...state.runner.checking]);
    const kept = Object.values(state.items).filter((item) => (item.runId && keepRuns.has(item.runId)) || busy.has(item.id));
    return {
      project: bundle.project,
      references: bundle.references,
      runs: [...madeMeanwhile, ...bundle.runs],
      items: { ...Object.fromEntries(bundle.items.map((item) => [item.id, item])), ...Object.fromEntries(kept.map((item) => [item.id, item])) },
      nextBefore: bundle.nextBefore,
    };
  }),
  appendOlder: (bundle) => set((state) => ({
    runs: [...state.runs, ...bundle.runs.filter((run) => !state.runs.some((known) => known.id === run.id))],
    items: { ...state.items, ...Object.fromEntries(bundle.items.map((item) => [item.id, item])) },
    nextBefore: bundle.nextBefore,
  })),
  setProject: (project) => set({ project }),
  setReferences: (references) => set({ references }),
  upsertReference: (reference) => set((state) => ({
    references: state.references.some((known) => known.id === reference.id)
      ? state.references.map((known) => (known.id === reference.id ? reference : known))
      : [...state.references, reference],
  })),
  removeReference: (id) => set((state) => ({ references: state.references.filter((reference) => reference.id !== id) })),
  addRun: (run, items) => set((state) => ({
    runs: [run, ...state.runs.filter((known) => known.id !== run.id)],
    items: { ...state.items, ...Object.fromEntries(items.map((item) => [item.id, item])) },
  })),
  upsertItems: (items) => set((state) => ({
    items: { ...state.items, ...Object.fromEntries(items.map((item) => [item.id, item])) },
  })),
  removeItem: (id) => set((state) => {
    const items = { ...state.items };
    const runId = items[id]?.runId;
    delete items[id];
    // The run goes too once its last image is deleted (the server deletes it as well).
    const empty = runId && !Object.values(items).some((item) => item.runId === runId);
    return empty ? { items, runs: state.runs.filter((run) => run.id !== runId) } : { items };
  }),
  setRunner: (update) => set((state) => ({
    runner: { ...state.runner, ...(typeof update === 'function' ? update(state.runner) : update) },
  })),
}));

/** The run's items in order. */
export function runItems(items: Record<string, PlaygroundItem>, runId: string): PlaygroundItem[] {
  return Object.values(items)
    .filter((item) => item.runId === runId)
    .sort((a, b) => a.position - b.position);
}
