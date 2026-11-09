import { useCallback, useEffect, useState } from 'react';
import { authClient } from './account';
import { addUpload, listUploads, removeUpload, type PictureUse, type Upload } from './uploads';

/** Signed links last 15 minutes, so a long session asks for fresh ones before they run out. */
const RELINK_MS = 10 * 60_000;
const POLL_MS = 3000;

/**
 * The signed-in person's own pictures (all rows share one list). While something is being prepared in the
 * cloud it looks again every few seconds; otherwise it only looks when something changes.
 */
export function useUploads() {
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const [list, setList] = useState<Upload[] | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>();
  const waiting = list?.some(item => item.status === 'preparing') ?? false;

  const refresh = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const next = await listUploads();
      if (!alive()) return;
      setList(next);
      setError('');
    } catch (cause) {
      if (alive()) setError(cause instanceof Error ? cause.message : 'Your pictures are unavailable right now.');
    }
  }, []);

  useEffect(() => {
    if (!signedIn) { setList(null); return; }
    let live = true;
    void refresh(() => live);
    const timer = setInterval(() => void refresh(() => live), RELINK_MS);
    return () => { live = false; clearInterval(timer); };
  }, [signedIn, refresh]);

  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const timer = setInterval(() => void refresh(() => live), POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [waiting, refresh]);

  async function add(file: File, use: PictureUse) {
    setProgress(0);
    setError('');
    try {
      await addUpload(file, use, share => setProgress(share));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be added.');
    } finally {
      setProgress(undefined);
    }
  }

  async function remove(id: string) {
    try {
      await removeUpload(id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be removed.');
    }
  }

  return { pending: session.isPending, signedIn, list, error, progress, add, remove };
}

export type Uploads = ReturnType<typeof useUploads>;
