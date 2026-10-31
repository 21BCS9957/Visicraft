'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Building2, Check, Loader2, Plus, Search } from 'lucide-react';
import { cleanClientName, clientInName, clientKey, findClient, type ClientRef } from '@/lib/clients';
import { lastClientId, rememberLastClient, useAgencyClients } from '@/lib/playground/agencyClients';
import { cx } from './ui';

/**
 * Which client a project is for: search the agency's list, pick one (the last one used comes
 * first), add a new one, or go without. A name that is already a client ("Rcasa" for "R casa")
 * offers that client instead of adding a second one.
 *
 * `children` opens it when clicked, or with `anchor` only marks where it opens (the caller
 * opens it, e.g. from a menu). The list is the Playground's (GoGrowth accounts) unless `clients`
 * is given (the owner's dashboard), with `onAdd` adding to it (null: no adding).
 */
export function ClientPicker({ open, onOpenChange, value, onPick, children, anchor = false, title, noneLabel = 'No client', align = 'start', side = 'bottom', clients, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  /** Resolves when it is saved; the picker closes then (and stays open if it throws). */
  onPick: (client: ClientRef | null) => Promise<void> | void;
  children: ReactNode;
  anchor?: boolean;
  title?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  clients?: ClientRef[];
  onAdd?: ((name: string) => Promise<ClientRef>) | null;
  /** Null hides "No client" (e.g. merging into another client). */
  noneLabel?: string | null;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {anchor ? <PopoverPrimitive.Anchor asChild>{children}</PopoverPrimitive.Anchor> : <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          // Opened from a menu, the menu hands focus back to its button as it closes: that isn't leaving the picker.
          onFocusOutside={anchor ? (event) => event.preventDefault() : undefined}
          className="z-[95] w-[min(320px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#141418]/95 p-2 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {open && <PickerBody value={value} title={title} noneLabel={noneLabel} onPick={onPick} onDone={() => onOpenChange(false)} list={clients} onAdd={onAdd} />}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

type Option = { kind: 'client'; client: ClientRef } | { kind: 'add'; name: string };

function PickerBody({ value, title, noneLabel, onPick, onDone, list, onAdd }: {
  value: string | null;
  title?: string;
  noneLabel: string | null;
  onPick: (client: ClientRef | null) => Promise<void> | void;
  onDone: () => void;
  list?: ClientRef[];
  onAdd?: ((name: string) => Promise<ClientRef>) | null;
}) {
  const stored = useAgencyClients((state) => state.clients);
  const storedAdd = useAgencyClients((state) => state.add);
  const clients = list ?? stored;
  const add = onAdd === undefined ? storedAdd : onAdd;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [last] = useState(lastClientId);
  const input = useRef<HTMLInputElement>(null);
  // And then takes the focus back for the search box.
  useEffect(() => {
    const timer = window.setTimeout(() => input.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const name = cleanClientName(query);
  const same = name ? findClient(clients, name) : undefined;
  // "Rcasa Home" when "R casa" exists: say so before a second client is made.
  const similar = name && !same ? clientInName(clients, name) : undefined;

  const options = useMemo<Option[]>(() => {
    const key = clientKey(name);
    const listed = key
      ? clients
        .filter((client) => clientKey(client.name).includes(key) || client.name.toLowerCase().includes(name.toLowerCase()))
        // Names that start with what was typed first; the list is A–Z already.
        .sort((a, b) => Number(!clientKey(a.name).startsWith(key)) - Number(!clientKey(b.name).startsWith(key)))
      : [...clients].sort((a, b) => Number(b.id === last) - Number(a.id === last));
    const ordered = same ? [same, ...listed.filter((client) => client.id !== same.id)] : similar ? [similar, ...listed.filter((client) => client.id !== similar.id)] : listed;
    return [
      ...ordered.map((client): Option => ({ kind: 'client', client })),
      ...(key && !same && add ? [{ kind: 'add', name } as Option] : []),
    ];
  }, [clients, name, same, similar, last, add]);

  useEffect(() => setError(''), [query]);

  const choose = async (option: Option | null) => {
    if (busy) return;
    setBusy(option ? (option.kind === 'client' ? option.client.id : 'add') : 'none');
    try {
      const client = !option ? null : option.kind === 'client' ? option.client : await add!(option.name);
      await onPick(client);
      if (client) rememberLastClient(client.id);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the client.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {title && <p className="px-2 pb-2 pt-1 text-xs font-medium text-white/70">{title}</p>}
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 focus-within:border-white/25">
        <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
        <input
          ref={input}
          autoFocus
          value={query}
          maxLength={80}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && options[0]) {
              event.preventDefault();
              void choose(options[0]);
            }
          }}
          placeholder={!add ? 'Search clients' : clients.length ? 'Search or add a client' : 'Name your first client'}
          aria-label="Client"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white !outline-none placeholder:text-white/35"
        />
      </label>

      {same && same.name !== name && <p className="px-2 pt-2 text-[11px] text-white/50">“{name}” is already the client “{same.name}”.</p>}
      {similar && <p className="px-2 pt-2 text-[11px] text-[#fff05a]/80">Did you mean “{similar.name}”?</p>}

      <ul className="mt-1.5 max-h-60 overflow-y-auto" role="listbox" aria-label="Clients">
        {options.map((option, index) => {
          const id = option.kind === 'client' ? option.client.id : 'add';
          const selected = option.kind === 'client' && option.client.id === value;
          return (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={Boolean(busy)}
                onClick={() => void choose(option)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/8 disabled:opacity-60',
                  index === 0 && name && 'bg-white/[0.05]'
                )}
              >
                {option.kind === 'client' ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    <span className="min-w-0 flex-1 truncate text-white/90">{option.client.name}</span>
                    {option.client.id === last && !name && !selected && <span className="shrink-0 text-[10px] text-white/35">Last used</span>}
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-[#fff05a]" />
                    <span className="min-w-0 flex-1 truncate text-white/90">Add “{option.name}” as a new client</span>
                  </>
                )}
                {busy === id ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/60" /> : selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#fff05a]" />}
              </button>
            </li>
          );
        })}
        {!options.length && <li className="px-2 py-3 text-xs text-white/40">No clients yet. Type a name to add one.</li>}
      </ul>

      {error && <p className="px-2 pb-1 pt-1.5 text-xs text-red-300">{error}</p>}
      {noneLabel !== null && <div className="mt-1.5 border-t border-white/8 pt-1.5">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void choose(null)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-white/55 hover:bg-white/8 hover:text-white disabled:opacity-60"
        >
          {busy === 'none' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : value === null ? <Check className="h-3.5 w-3.5 text-white/40" /> : <span className="h-3.5 w-3.5" />}
          {noneLabel}
        </button>
      </div>}
    </div>
  );
}
