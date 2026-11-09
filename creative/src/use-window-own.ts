import { useEffect, useState } from 'react';
import { friendlyError } from './friendly-error';
import { loadTexture } from './pack-renderer';
import { readWindowPicture } from './pack-window';
import type { Upload } from './uploads';
import type { WindowOwn } from './window-deal';

/**
 * What the Window row needs to know of the person's own picture before it can deal cards from it: which screen
 * colours read against it, and whether a person stands in it (a photo's cut-out). A video or GIF is judged by its
 * poster. The picture is read once, when it becomes ready (not each time its link is renewed), and its textures
 * are given back at once.
 */
export function useWindowOwn(upload: Upload | null): { own: WindowOwn | null; problem: string } {
  const [read, setRead] = useState<{ id: string; own: WindowOwn } | { id: string; problem: string } | null>(null);
  const id = upload?.id;

  useEffect(() => {
    setRead(null);
    if (!upload?.url || !id) return;
    let alive = true;
    void (async () => {
      const [photo, cutout] = await Promise.all([loadTexture(upload.url!, 'Your picture'), upload.cutoutUrl ? loadTexture(upload.cutoutUrl, 'The cut-out of your photo') : undefined]);
      try {
        return { id, own: { reading: readWindowPicture(photo, cutout), clip: Boolean(upload.motionUrl) } };
      } finally {
        photo.destroy(true);
        cutout?.destroy(true);
      }
    })()
      .catch(cause => ({ id, problem: friendlyError(cause, 'Your picture could not be read for Window.') }))
      .then(result => { if (alive) setRead(result); });
    return () => { alive = false; };
  }, [id]);

  if (!upload || read?.id !== upload.id) return { own: null, problem: '' };
  return 'own' in read ? { own: read.own, problem: '' } : { own: null, problem: read.problem };
}
