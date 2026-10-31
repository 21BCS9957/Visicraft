'use client';

import { create } from 'zustand';
import { findClient, type ClientRef } from '@/lib/clients';
import { playgroundApi } from './api';
import { isPreviewRequested } from './preview';
import { isVideoPreviewRequested } from '@/lib/video/preview';

/** The dev previews of the Playground and the Video Studio: sample clients, nothing saved. */
const inPreview = () => isPreviewRequested() || isVideoPreviewRequested();

/**
 * The agency's client list in the browser, loaded once per page for the project picker. Only
 * GoGrowth accounts get it (`enabled`); for anyone else every client control stays hidden.
 */

const LAST_CLIENT_KEY = 'visicraft:lastClient';

export const PREVIEW_CLIENTS: ClientRef[] = [
  { id: 'preview-client-brew-sage', name: 'Brew Sage' },
  { id: 'preview-client-r-casa', name: 'R casa' },
  { id: 'preview-client-thriller', name: 'Thriller' },
  { id: 'preview-client-tissue', name: 'Tissue saree' },
];

interface AgencyClientsState {
  status: 'idle' | 'loading' | 'ready';
  enabled: boolean;
  clients: ClientRef[];
  /** My projects that have a client: project id → client id. */
  assigned: Record<string, string>;
  load: () => Promise<void>;
  /** Adds a client (or finds the one with this name) and keeps the list A–Z. */
  add: (name: string) => Promise<ClientRef>;
  /** Remembers a project's client here once the server has it. */
  assign: (projectId: string, clientId: string | null) => void;
}

const byName = (list: ClientRef[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

export const useAgencyClients = create<AgencyClientsState>((set, get) => ({
  status: 'idle',
  enabled: false,
  clients: [],
  assigned: {},
  load: async () => {
    if (get().status !== 'idle') return;
    if (inPreview()) {
      set({ status: 'ready', enabled: true, clients: PREVIEW_CLIENTS, assigned: { preview: 'preview-client-brew-sage' } });
      return;
    }
    set({ status: 'loading' });
    try {
      const { enabled, clients, assigned } = await playgroundApi.clients();
      set({ status: 'ready', enabled, clients: byName(clients), assigned });
    } catch {
      // No list: the picker stays hidden and projects are made as before.
      set({ status: 'ready', enabled: false });
    }
  },
  add: async (name) => {
    const known = findClient(get().clients, name);
    if (known) return known;
    const client = inPreview()
      ? { id: `preview-client-${Date.now()}`, name: name.trim() }
      : (await playgroundApi.createClient(name)).client;
    if (!get().clients.some((existing) => existing.id === client.id)) set({ clients: byName([...get().clients, client]) });
    return client;
  },
  assign: (projectId, clientId) => {
    const assigned = { ...get().assigned };
    if (clientId) assigned[projectId] = clientId;
    else delete assigned[projectId];
    set({ assigned });
  },
}));

/** The client picked last in this browser, first in the picker next time. */
export function lastClientId(): string | null {
  try {
    return window.localStorage.getItem(LAST_CLIENT_KEY);
  } catch {
    return null;
  }
}

export function rememberLastClient(clientId: string): void {
  try {
    window.localStorage.setItem(LAST_CLIENT_KEY, clientId);
  } catch {
    // Private mode: the picker just starts A–Z.
  }
}
