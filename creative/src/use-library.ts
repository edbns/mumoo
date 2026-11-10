import { useEffect, useState } from 'react';
import type { LibraryPicture } from './library-pick';

/** The links last 15 minutes; they are renewed well before that. */
const RENEW_MS = 10 * 60 * 1000;

/**
 * The approved library the creatives may draw from, or null until it has been asked for. A library that cannot be reached
 * is simply empty: the shelf then carries on with our own photography.
 */
export function useLibrary(): LibraryPicture[] | null {
  const [items, setItems] = useState<LibraryPicture[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await fetch('/api/library')
        .then(response => (response.ok ? response.json() as Promise<{ items?: LibraryPicture[] }> : null))
        .then(body => (Array.isArray(body?.items) ? body.items : null))
        .catch(() => null);
      if (alive) setItems(current => next ?? current ?? []);
    };
    void load();
    const timer = setInterval(() => void load(), RENEW_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return items;
}
