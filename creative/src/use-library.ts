import { useEffect, useState } from 'react';
import type { ShelfLearning } from './creatives-pack';
import type { LibraryPicture } from './library-pick';

/** The links last an hour (and the CDN's copy of the list a few minutes); they are renewed well before that. */
const RENEW_MS = 10 * 60 * 1000;

type Library = { items: LibraryPicture[] | null; learning: ShelfLearning };

/**
 * The approved library the creatives may draw from (`items`, null until it has been asked for), and what people lately kept and
 * downloaded of each template and its kinds of card, overall and per lane (`learning`: the first answer's, kept for the visit, so a
 * shelf never reorders under the person). A library that cannot be reached is simply empty: the shelf then carries on
 * with our own photography, in the brain's own order.
 */
export function useLibrary(): Library {
  const [library, setLibrary] = useState<Library>({ items: null, learning: {} });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const body = await fetch('/api/library')
        .then(response => (response.ok ? response.json() as Promise<{ items?: LibraryPicture[] } & ShelfLearning> : null))
        .catch(() => null);
      const items = Array.isArray(body?.items) ? body.items : null;
      const object = (value: unknown) => (value && typeof value === 'object' ? value : undefined);
      const learning: ShelfLearning | null = body && (object(body.cards) || object(body.rows))
        ? { cards: object(body.cards), rows: object(body.rows), lanes: object(body.lanes) } as ShelfLearning : null;
      if (alive) setLibrary(current => ({ items: items ?? current.items ?? [], learning: Object.keys(current.learning).length ? current.learning : learning ?? current.learning }));
    };
    void load();
    const timer = setInterval(() => void load(), RENEW_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return library;
}
