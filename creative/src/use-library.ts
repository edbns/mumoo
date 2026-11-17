import { useEffect, useState } from 'react';
import type { LearnedCards } from './creatives-pack';
import type { LibraryPicture } from './library-pick';

/** The links last 15 minutes; they are renewed well before that. */
const RENEW_MS = 10 * 60 * 1000;

type Library = { items: LibraryPicture[] | null; cards: LearnedCards };

/**
 * The approved library the creatives may draw from (`items`, null until it has been asked for), and what people lately kept and
 * downloaded of each row's kinds of card (`cards`: the first answer's, kept for the visit, so a shelf never reorders under the person). A library that cannot be reached is simply empty: the shelf then carries on
 * with our own photography, in the brain's own order.
 */
export function useLibrary(): Library {
  const [library, setLibrary] = useState<Library>({ items: null, cards: {} });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const body = await fetch('/api/library')
        .then(response => (response.ok ? response.json() as Promise<{ items?: LibraryPicture[]; cards?: LearnedCards }> : null))
        .catch(() => null);
      const items = Array.isArray(body?.items) ? body.items : null;
      const cards = body?.cards && typeof body.cards === 'object' ? body.cards : null;
      if (alive) setLibrary(current => ({ items: items ?? current.items ?? [], cards: Object.keys(current.cards).length ? current.cards : cards ?? current.cards }));
    };
    void load();
    const timer = setInterval(() => void load(), RENEW_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return library;
}
