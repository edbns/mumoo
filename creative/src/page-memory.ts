/**
 * What an account page last showed, held in this tab for the person who saw it, so going back to the page shows it at once
 * while it is asked for again. It is never written to disk and is forgotten on signing out.
 */
const kept = new Map<string, { owner: string; at: number; value: unknown }>();

/** The page's last data, if it was this person's and is no older than `freshMs` (links in it stop working after a while). */
export function recall<T>(page: string, owner: string | undefined, freshMs = Infinity): T | null {
  const entry = kept.get(page);
  if (!owner || !entry || entry.owner !== owner || Date.now() - entry.at > freshMs) return null;
  return entry.value as T;
}

export function keep(page: string, owner: string | undefined, value: unknown) {
  if (owner) kept.set(page, { owner, at: Date.now(), value });
}

export function forgetPages() {
  kept.clear();
}
