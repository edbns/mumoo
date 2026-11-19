/**
 * The library pictures this browser was shown on cards lately, newest last, so the next creatives start with ones the person has
 * not seen. Ids only, kept in the browser; nothing about them leaves it.
 */
const KEY = 'mumoo-seen-library';
/** About three boards' worth: enough that a person goes round a board before seeing a picture again. */
const KEEP = 400;

function read(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** How recently each picture was shown: 1 for the newest, towards 0 for the oldest still remembered. */
export function seenLibrary(): Map<string, number> {
  const list = read();
  return new Map(list.map((id, at) => [id, (at + 1) / list.length]));
}

export function rememberSeen(ids: readonly string[]) {
  if (!ids.length) return;
  const fresh = new Set(ids);
  const list = [...read().filter(id => !fresh.has(id)), ...fresh].slice(-KEEP);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: the next deal simply knows less */ }
}

/** A seed of its own for each time a person makes creatives: the same song never deals the same reels twice, or to two people. */
export function dealSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
