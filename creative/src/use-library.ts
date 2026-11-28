import { useEffect, useState } from 'react';
import { sessionToken } from './account';
import type { KeptCard, ShelfLearning } from './creatives-pack';
import type { LibraryPicture } from './library-pick';

/** The links last an hour (and the CDN's copy of the list a few minutes); they are renewed well before that. */
const RENEW_MS = 10 * 60 * 1000;

type Library = { items: LibraryPicture[] | null; learning: ShelfLearning };

/** What this person kept before, when they are signed in (`/api/my-shelf`); nothing otherwise, or when it cannot be had. */
async function keptBefore(): Promise<KeptCard[] | undefined> {
  const token = await sessionToken().catch(() => null);
  if (!token) return undefined;
  const body = await fetch('/api/my-shelf', { headers: { Authorization: `Bearer ${token}` } })
    .then(response => (response.ok ? response.json() as Promise<{ kept?: unknown }> : null))
    .catch(() => null);
  return Array.isArray(body?.kept) ? body.kept as KeptCard[] : undefined;
}

/**
 * The approved library the creatives may draw from (`items`, null until it has been asked for), and what people lately kept and
 * downloaded of each template and its kinds of card, overall and per lane, with what this person kept before when signed in
 * (`learning`: the first answer's, kept for the visit, so a shelf never reorders under the person). A library that cannot be reached is simply empty: the shelf then carries on
 * with our own photography, in the brain's own order.
 */
export function useLibrary(): Library {
  const [library, setLibrary] = useState<Library>({ items: null, learning: {} });
  useEffect(() => {
    let alive = true;
    let learned = false;
    const load = async () => {
      const [body, mine] = await Promise.all([
        fetch('/api/library')
          .then(response => (response.ok ? response.json() as Promise<{ items?: LibraryPicture[] } & ShelfLearning> : null))
          .catch(() => null),
        learned ? Promise.resolve(undefined) : keptBefore(),
      ]);
      const items = Array.isArray(body?.items) ? body.items : null;
      const object = (value: unknown) => (value && typeof value === 'object' ? value : undefined);
      const everybody: ShelfLearning | null = body && (object(body.cards) || object(body.rows))
        ? { cards: object(body.cards), rows: object(body.rows), lanes: object(body.lanes) } as ShelfLearning : null;
      const learning = everybody || mine?.length ? { ...everybody, ...(mine?.length ? { mine } : {}) } : null;
      if (learning) learned = true;
      if (alive) setLibrary(current => ({ items: items ?? current.items ?? [], learning: Object.keys(current.learning).length ? current.learning : learning ?? current.learning }));
    };
    void load();
    const timer = setInterval(() => void load(), RENEW_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return library;
}
