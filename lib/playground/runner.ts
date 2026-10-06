'use client';

import { playgroundApi } from './api';
import { playgroundModel, type ImageProvider } from './models';
import { simulateGenerate } from './preview';
import { runItems, usePlaygroundStore } from './store';
import type { GenerateResponse, PlaygroundItem } from './types';

/**
 * Sends a run's images to the server one by one, in order, a few at a time. Every request
 * makes exactly one image; the server charges and refunds. This module only decides what to
 * send next and reacts to the answer (busy provider → slow down; a provider's key or billing
 * → pause that provider's images only; the user's credits → pause everything; dropped
 * connection → ask the server what happened).
 */

const MAX_CONCURRENCY = 3;
const CHECK_EVERY_MS = 15_000;
/** Longer than any request can run; after this the server's sweep fails and refunds it. */
const STUCK_AFTER_MS = 11 * 60_000;

interface RunnerListener {
  onCreditsChanged?: () => void;
  onPaused?: (message: string) => void;
}

let listener: RunnerListener = {};
let creditsTimer: ReturnType<typeof setTimeout> | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let successStreak = 0;

export function setRunnerListener(next: RunnerListener) {
  listener = next;
}

const store = () => usePlaygroundStore.getState();

/** Which provider makes this image (its run's model). */
function providerOf(id: string): ImageProvider {
  const state = store();
  const runId = state.items[id]?.runId;
  const run = runId ? state.runs.find((known) => known.id === runId) : undefined;
  return playgroundModel(run?.model).provider;
}

function creditsChanged() {
  if (creditsTimer) return;
  creditsTimer = setTimeout(() => {
    creditsTimer = null;
    listener.onCreditsChanged?.();
  }, 2_500);
}

function wakeAfter(ms: number) {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    pump();
  }, Math.max(250, ms));
}

/** Adds images to the queue (at the front for ones that must go next) and starts sending. */
export function enqueue(ids: string[], front = false) {
  store().setRunner((runner) => {
    const known = new Set([...runner.queue, ...runner.inFlight, ...runner.checking]);
    const fresh = ids.filter((id) => !known.has(id));
    return { queue: front ? [...fresh, ...runner.queue] : [...runner.queue, ...fresh] };
  });
  pump();
}

export function pump() {
  const state = store();
  const { runner } = state;
  if (runner.paused) return;
  const wait = runner.backoffUntil - Date.now();
  if (wait > 0) return wakeAfter(wait);

  const free = runner.concurrency - runner.inFlight.length;
  if (free <= 0 || runner.queue.length === 0) return;

  const next: string[] = [];
  const rest: string[] = [];
  for (const id of runner.queue) {
    const item = state.items[id];
    if (!item || (item.status !== 'queued' && item.status !== 'failed')) continue;
    // A paused provider's images keep their place; the other models' images go ahead.
    if (next.length < free && !runner.pausedProviders[providerOf(id)]) next.push(id);
    else rest.push(id);
  }
  const startedAt = new Date().toISOString();
  state.upsertItems(next.map((id) => ({ ...state.items[id], status: 'generating', error: null, startedAt })));
  state.setRunner({ queue: rest, inFlight: [...runner.inFlight, ...next] });
  next.forEach((id) => void send(id));
}

async function send(id: string) {
  let outcome: GenerateResponse['outcome'] | 'network' = 'network';
  try {
    const { body } = store().preview ? await simulateGenerate(id) : await playgroundApi.generateItem(id);
    outcome = body.outcome;
    if (body.item) store().upsertItems([body.item]);

    if (body.outcome === 'done' || body.outcome === 'failed') {
      creditsChanged();
      if (++successStreak >= 4 && store().runner.concurrency < MAX_CONCURRENCY) {
        successStreak = 0;
        store().setRunner((runner) => ({ concurrency: Math.min(MAX_CONCURRENCY, runner.concurrency + 1) }));
      }
    } else if (body.outcome === 'rate_limited') {
      successStreak = 0;
      creditsChanged();
      store().setRunner((runner) => ({
        queue: [id, ...runner.queue.filter((queued) => queued !== id)],
        concurrency: Math.max(1, runner.concurrency - 1),
        backoffUntil: Date.now() + (body.retryAfterMs ?? 20_000),
      }));
    } else if (body.outcome === 'paused' || body.outcome === 'insufficient_credits') {
      creditsChanged();
      // Out of credits: the server never started it, so undo the optimistic "generating".
      if (!body.item) store().upsertItems([{ ...store().items[id], status: 'queued', startedAt: null }]);
      if (body.outcome === 'paused') pauseProvider(providerOf(id), body.message ?? 'These images are paused.', id);
      else pause(body.message ?? 'The run is paused.', id);
    } else if (body.outcome === 'not_claimable' && body.item?.status === 'generating') {
      check(id);
    }
  } catch {
    check(id);
  } finally {
    store().setRunner((runner) => ({ inFlight: runner.inFlight.filter((flying) => flying !== id) }));
    // Only the user's own credits stop everything; a paused provider still lets the others run.
    if (outcome !== 'insufficient_credits') pump();
  }
}

/** The connection dropped: the image may still be generating on the server. Ask until it isn't. */
function check(id: string) {
  store().setRunner((runner) => ({ checking: [...new Set([...runner.checking, id])] }));
  const poll = async () => {
    try {
      const { item } = await playgroundApi.getItem(id);
      if (item.status === 'generating') {
        if (item.startedAt && Date.now() - Date.parse(item.startedAt) > STUCK_AFTER_MS) {
          // Opening the project fails and refunds images a stopped request left behind.
          const projectId = store().projectId;
          if (projectId) await playgroundApi.getProject(projectId).catch(() => null);
        }
        setTimeout(poll, CHECK_EVERY_MS);
        return;
      }
      store().upsertItems([item]);
      store().setRunner((runner) => ({ checking: runner.checking.filter((checked) => checked !== id) }));
      creditsChanged();
      if (item.status === 'queued') enqueue([id], true);
    } catch {
      setTimeout(poll, CHECK_EVERY_MS + 5_000);
    }
  };
  setTimeout(poll, 6_000);
}

function pause(message: string, id?: string) {
  store().setRunner((runner) => ({
    paused: message,
    queue: id ? [id, ...runner.queue.filter((queued) => queued !== id)] : runner.queue,
  }));
  listener.onPaused?.(message);
}

function pauseProvider(provider: ImageProvider, message: string, id?: string) {
  const already = store().runner.pausedProviders[provider] === message;
  store().setRunner((runner) => ({
    pausedProviders: { ...runner.pausedProviders, [provider]: message },
    queue: id ? [id, ...runner.queue.filter((queued) => queued !== id)] : runner.queue,
  }));
  if (!already) listener.onPaused?.(message);
}

export function resume() {
  store().setRunner({ paused: null, pausedProviders: {}, backoffUntil: 0 });
  pump();
}

/** Tries a paused provider's images again (after its key or billing is fixed). */
export function resumeProvider(provider: ImageProvider) {
  store().setRunner((runner) => {
    const pausedProviders = { ...runner.pausedProviders };
    delete pausedProviders[provider];
    return { pausedProviders, backoffUntil: 0 };
  });
  pump();
}

/** Cancels the paused provider's images that haven't started; the other models' images go on. */
export async function cancelProviderWaiting(provider: ImageProvider) {
  const state = store();
  const runIds = state.runs
    .filter((run) => playgroundModel(run.model).provider === provider)
    .filter((run) => runItems(state.items, run.id).some((item) => item.status === 'queued'))
    .map((run) => run.id);
  for (const runId of runIds) await cancelRun(runId);
  resumeProvider(provider);
}

/** Every queued image of the project that nothing is sending yet, oldest run first. */
export function waitingItems(): PlaygroundItem[] {
  const { runs, items, runner } = store();
  const busy = new Set([...runner.queue, ...runner.inFlight, ...runner.checking]);
  return [...runs]
    .reverse()
    .flatMap((run) => runItems(items, run.id))
    .filter((item) => item.status === 'queued' && !busy.has(item.id));
}

/** Picks up images left waiting (after a reload or a pause). */
export function resumeWaiting() {
  store().setRunner({ paused: null, pausedProviders: {}, backoffUntil: 0 });
  enqueue(waitingItems().map((item) => item.id));
}

export async function cancelRun(runId: string) {
  const state = store();
  const cancelledIds = state.preview
    ? runItems(state.items, runId).filter((item) => item.status === 'queued').map((item) => item.id)
    : (await playgroundApi.cancelRun(runId)).cancelledIds;
  const finishedAt = new Date().toISOString();
  const cancelled = new Set(cancelledIds);
  store().upsertItems(cancelledIds.map((id) => ({ ...store().items[id], status: 'cancelled', finishedAt })));
  store().setRunner((runner) => ({ queue: runner.queue.filter((id) => !cancelled.has(id)) }));
}

/** Cancels every image of the project that hasn't started (all runs). */
export async function cancelWaiting() {
  const runIds = [...new Set(waitingItems().map((item) => item.runId).filter((id): id is string => Boolean(id)))];
  const queuedRuns = new Set(store().runner.queue.map((id) => store().items[id]?.runId));
  for (const runId of new Set([...runIds, ...[...queuedRuns].filter((id): id is string => Boolean(id))])) {
    await cancelRun(runId);
  }
  store().setRunner({ paused: null, pausedProviders: {} });
}

export async function retryItem(item: PlaygroundItem) {
  if (item.status === 'cancelled') {
    const updated = store().preview
      ? { ...item, status: 'queued' as const, error: null }
      : (await playgroundApi.updateItem(item.id, { requeue: true })).item;
    store().upsertItems([updated]);
  }
  enqueue([item.id], true);
}

export function isRunnerBusy(): boolean {
  const { runner } = store();
  return runner.queue.length > 0 || runner.inFlight.length > 0 || runner.checking.length > 0;
}
