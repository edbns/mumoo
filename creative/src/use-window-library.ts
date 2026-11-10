import { useEffect, useState } from 'react';
import type { LibraryPicture } from './library-pick';
import { loadTexture } from './pack-renderer';
import { readWindowPicture, type WindowReading } from './pack-window';

/** How each library picture reads for Window, kept for the visit: a picture is read once (its links are renewed, the picture is not). `null`: it could not be read. */
const reads = new Map<string, WindowReading | null>();

/** Which screen colours read against a library picture, and whether a person stands in it. A video or GIF is judged by its poster. */
async function read(item: LibraryPicture): Promise<WindowReading | null> {
  try {
    const [photo, cutout] = await Promise.all([
      loadTexture(item.url, 'A library picture'),
      item.kind === 'photo' && item.cutoutUrl ? loadTexture(item.cutoutUrl, 'The cut-out of a library photo') : undefined,
    ]);
    try {
      return readWindowPicture(photo, cutout);
    } finally {
      photo.destroy(true);
      cutout?.destroy(true);
    }
  } catch {
    return null;
  }
}

/**
 * What the Window row needs of the library pictures it is about to deal from: how each reads. `pending` is true until every one has been read
 * (the row waits for it); a picture that cannot be read is left out.
 */
export function useWindowReadings(items: readonly LibraryPicture[]): { readings: Record<string, WindowReading>; pending: boolean } {
  const [, again] = useState(0);
  const key = items.map(item => item.id).join(',');

  useEffect(() => {
    const todo = items.filter(item => !reads.has(item.id));
    if (!todo.length) return;
    let alive = true;
    void (async () => {
      for (const item of todo) if (!reads.has(item.id)) reads.set(item.id, await read(item));
      if (alive) again(count => count + 1);
    })();
    return () => { alive = false; };
  }, [key]);

  return {
    readings: Object.fromEntries(items.flatMap(item => {
      const reading = reads.get(item.id);
      return reading ? [[item.id, reading]] : [];
    })),
    pending: items.some(item => !reads.has(item.id)),
  };
}
