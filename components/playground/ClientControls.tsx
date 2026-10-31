'use client';

import { cloneElement, useEffect, useMemo, useState, type MouseEvent, type ReactElement } from 'react';
import { Building2 } from 'lucide-react';
import type { ClientRef } from '@/lib/clients';
import { playgroundApi } from '@/lib/playground/api';
import { useAgencyClients } from '@/lib/playground/agencyClients';
import { usePlaygroundStore } from '@/lib/playground/store';
import { ClientPicker } from './ClientPicker';
import { cx } from './ui';

/**
 * The client pieces of the Playground's project pages (images and videos), for GoGrowth
 * accounts only: everyone else sees no client control at all, and "New project" works as before.
 */

/** The agency's clients for a page of projects: whether to show them, each project's client, and saving a change. */
export function useProjectClients(active: boolean) {
  const enabled = useAgencyClients((state) => state.enabled);
  const clients = useAgencyClients((state) => state.clients);
  const assigned = useAgencyClients((state) => state.assigned);
  const load = useAgencyClients((state) => state.load);
  const assign = useAgencyClients((state) => state.assign);
  useEffect(() => {
    if (active) void load();
  }, [active, load]);
  const byId = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  return {
    enabled,
    clientOf: (projectId: string): ClientRef | null => byId.get(assigned[projectId] ?? '') ?? null,
    /** Saves a project's client (only here in the dev preview); throws when the server refuses. */
    save: async (projectId: string, client: ClientRef | null, preview: boolean) => {
      if (!preview) await playgroundApi.updateProject(projectId, { clientId: client?.id ?? null });
      assign(projectId, client?.id ?? null);
    },
  };
}

/**
 * "New project": for GoGrowth accounts it first asks which client the project is for (or none);
 * otherwise the button creates the project at once, as it always has.
 */
export function NewProjectButton({ enabled, onCreate, children }: {
  enabled: boolean;
  onCreate: (client: ClientRef | null) => Promise<void> | void;
  children: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
}) {
  const [open, setOpen] = useState(false);
  if (!enabled) return cloneElement(children, { onClick: () => void onCreate(null) });
  return (
    <ClientPicker open={open} onOpenChange={setOpen} value={null} onPick={onCreate} title="Which client is this project for?" noneLabel="Skip for now">
      {children}
    </ClientPicker>
  );
}

/** The client's name on a project card's cover. */
export function ClientBadge({ client }: { client: ClientRef | null }) {
  if (!client) return null;
  return (
    <span className="absolute left-2.5 top-2.5 inline-flex max-w-[75%] items-center gap-1 truncate rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-md">
      <Building2 className="h-3 w-3 shrink-0 text-white/60" />
      <span className="truncate">{client.name}</span>
    </span>
  );
}

/** The open project's client in its top bar; "Add client" when it has none. Opens the picker. */
export function ProjectClientChip({ projectId, clientId, preview }: { projectId: string; clientId: string | null; preview: boolean }) {
  const { enabled, save } = useProjectClients(true);
  const clients = useAgencyClients((state) => state.clients);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const client = clients.find((known) => known.id === clientId) ?? null;
  return (
    <ClientPicker
      open={open}
      onOpenChange={setOpen}
      value={client?.id ?? null}
      title="Which client is this project for?"
      onPick={async (picked) => {
        await save(projectId, picked, preview);
        const open = usePlaygroundStore.getState().project;
        if (open?.id === projectId) usePlaygroundStore.getState().setProject({ ...open, clientId: picked?.id ?? null });
      }}
    >
      <button
        type="button"
        title={client ? `Client: ${client.name}` : 'Pick the client this project is for'}
        className={cx(
          'inline-flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
          client ? 'border-white/12 text-white/75 hover:bg-white/7 hover:text-white' : 'border-dashed border-[#fff05a]/45 text-[#fff05a]/90 hover:bg-[#fff05a]/[0.06]'
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{client?.name ?? 'Add client'}</span>
      </button>
    </ClientPicker>
  );
}
