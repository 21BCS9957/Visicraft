/**
 * Clients: the brands GoGrowth works for, one list for the whole agency. Every project can
 * belong to one. Shared by the Playground (the picker) and the server.
 */

export interface ClientRef {
  id: string;
  name: string;
}

export const CLIENT_NAME_MAX = 80;

/** A name as stored: trimmed, single spaces, at most 80 characters. */
export function cleanClientName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, CLIENT_NAME_MAX).trim() : '';
}

/** What makes two names the same client: case, spaces and punctuation don't count ("R casa" = "Rcasa"). */
export function clientKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The client this name already is, if any. */
export function findClient<T extends ClientRef>(clients: T[], name: string): T | undefined {
  const key = clientKey(name);
  return key ? clients.find((client) => clientKey(client.name) === key) : undefined;
}

/** A project's name the app gave it ("Project 12 Oct", "Video · 13 Oct"): it says nothing about the client. */
export function isDefaultProjectName(name: string): boolean {
  return /^(project \d{1,2} [a-z]{3,9}\.?|video · .+|untitled project|new video project)$/i.test(name.trim());
}

/**
 * The keys of a name's first words, one more word each time: "Rcasa Banners" gives "rcasa",
 * "rcasabanners". A client whose key is one of them starts the name at a word break.
 */
export function leadingKeys(name: string): string[] {
  const words = name.trim().split(/\s+/).map(clientKey).filter(Boolean);
  return words.map((_, index) => words.slice(0, index + 1).join(''));
}

/** The client a name starts with ("Thriller Grip me" → Thriller), the longest match first. */
export function clientInName<T extends ClientRef>(clients: T[], name: string): T | undefined {
  const keys = leadingKeys(name);
  let best: { client: T; length: number } | undefined;
  for (const client of clients) {
    const key = clientKey(client.name);
    if (key && keys.includes(key) && (!best || key.length > best.length)) best = { client, length: key.length };
  }
  return best?.client;
}
