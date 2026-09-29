'use client';

import { playgroundApi } from './api';
import type { PlaygroundBundle, PlaygroundProjectSummary } from './types';

/**
 * What the browser already loaded this visit, so going back and forth between the projects
 * page and a project shows it at once (then refreshes quietly). Hovering a project card
 * starts loading it before the click.
 */

const bundles = new Map<string, PlaygroundBundle>();
const loading = new Map<string, Promise<PlaygroundBundle>>();
let projectList: PlaygroundProjectSummary[] | null = null;

export function cachedBundle(projectId: string): PlaygroundBundle | null {
  return bundles.get(projectId) ?? null;
}

export function rememberBundle(projectId: string, bundle: PlaygroundBundle) {
  bundles.set(projectId, bundle);
}

export function forgetProject(projectId: string) {
  bundles.delete(projectId);
  loading.delete(projectId);
  projectList = projectList?.filter((project) => project.id !== projectId) ?? null;
}

/** Loads a project once, however many callers ask at the same time. */
export function fetchBundle(projectId: string): Promise<PlaygroundBundle> {
  const pending = loading.get(projectId);
  if (pending) return pending;
  const request = playgroundApi.getProject(projectId)
    .then((bundle) => {
      bundles.set(projectId, bundle);
      return bundle;
    })
    .finally(() => loading.delete(projectId));
  loading.set(projectId, request);
  return request;
}

export function prefetchProject(projectId: string) {
  if (!bundles.has(projectId) && !loading.has(projectId)) void fetchBundle(projectId).catch(() => undefined);
}

export function cachedProjectList(): PlaygroundProjectSummary[] | null {
  return projectList;
}

export function rememberProjectList(list: PlaygroundProjectSummary[]) {
  projectList = list;
}
