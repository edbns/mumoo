import { useCallback, useEffect, useState } from 'react';
import { authClient } from './account';
import { cartUploadIds } from './cart';
import { addUpload, clearUploads, listUploads, MAX_SHELF_PICTURES, SHELF_PICTURE, type PictureUse, type Upload } from './uploads';

/** Signed links last 15 minutes, so a long session asks for fresh ones before they run out. */
const RELINK_MS = 10 * 60_000;
/** While something is being prepared in the cloud, how often to ask whether it is ready. */
const POLL_MS = 2000;

/** What went wrong, in words for the person: with one row's picture, or (`use` null) with looking at their pictures at all. */
export type PictureProblem = { use: PictureUse | null; message: string };

/**
 * The signed-in person's own pictures: up to ten for the shelf. While something is being prepared in
 * the cloud it looks again every couple of seconds; otherwise it only looks when something changes.
 *
 * Every visit starts clean: pictures from an earlier run are removed when the page opens (and on Start over), except those a cart
 * still draws from. Those stay in `list` so the cart can be downloaded, but only pictures added in this run (`current`) are drawn on the rows.
 */
export function useUploads() {
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const [list, setList] = useState<Upload[] | null>(null);
  const [problem, setProblem] = useState<PictureProblem | null>(null);
  /** The row files are being sent for, which of them is going now, and how much of it has gone (a photo is one quick request, so it has no share). */
  const [sending, setSending] = useState<{ use: PictureUse; index: number; total: number; share?: number } | null>(null);
  const waiting = list?.some(item => item.status === 'preparing') ?? false;
  /** The pictures added since this run began: the only ones the rows draw. */
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());

  /** Takes in a new list. A picture that could not be prepared arrives once, as a failed entry, and becomes the row's problem. */
  const receive = useCallback((next: Upload[]) => {
    const failed = next.find(item => item.status === 'failed');
    setList(next.filter(item => item.status !== 'failed'));
    if (failed) setProblem({ use: failed.use, message: failed.error ?? 'We could not prepare that file. Try another.' });
  }, []);

  const refresh = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const next = await listUploads();
      if (!alive()) return;
      receive(next);
      setProblem(current => (current?.use === null ? null : current));
    } catch (cause) {
      if (alive()) setProblem({ use: null, message: cause instanceof Error ? cause.message : 'Your pictures are unavailable right now.' });
    }
  }, [receive]);

  useEffect(() => {
    if (!signedIn) { setList(null); return; }
    let live = true;
    // A new run: what an earlier one left behind goes, except what a cart still needs.
    void clearUploads(cartUploadIds()).then(next => { if (live) receive(next); }, () => refresh(() => live));
    const timer = setInterval(() => void refresh(() => live), RELINK_MS);
    return () => { live = false; clearInterval(timer); };
  }, [signedIn, refresh]);

  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const timer = setInterval(() => void refresh(() => live), POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [waiting, refresh]);

  /**
   * Adds pictures for a row, one after another: on the shelf up to `MAX_SHELF_PICTURES` are kept side by side; on an older row a new
   * one replaces the row's current one once it is ready. One that is refused does not stop the others; the person is told which.
   */
  async function add(files: File[], use: PictureUse) {
    const kept = use === SHELF_PICTURE ? (list ?? []).filter(item => item.use === use).length : 0;
    const room = use === SHELF_PICTURE ? Math.max(0, MAX_SHELF_PICTURES - kept) : 1;
    const taken = files.slice(0, room);
    setProblem(null);
    if (!taken.length) {
      setProblem({ use, message: `You already have ${MAX_SHELF_PICTURES} of your own pictures here. Start over to use others.` });
      return;
    }
    let known = new Set((list ?? []).map(item => item.id));
    const failed: string[] = [];
    for (const [index, file] of taken.entries()) {
      const place = { use, index, total: taken.length };
      setSending(place);
      try {
        const next = await addUpload(file, use, share => setSending({ ...place, share }));
        const added = next.map(item => item.id).filter(id => !known.has(id));
        known = new Set(next.map(item => item.id));
        setMine(current => new Set([...current, ...added]));
        receive(next);
      } catch (cause) {
        failed.push(cause instanceof Error ? cause.message : 'That file could not be added.');
      }
    }
    setSending(null);
    const left = files.length - taken.length;
    if (failed.length) {
      setProblem({ use, message: taken.length > 1 ? `${failed.length} of ${taken.length} could not be added. ${failed[0]}` : failed[0] });
    } else if (left) {
      setProblem({ use, message: `Only ${MAX_SHELF_PICTURES} of your own pictures can be used at once, so ${left} ${left > 1 ? 'were' : 'was'} left out.` });
    }
  }

  /** Start over: every picture goes except what a cart still needs, and the rows go back to our own. */
  async function clear() {
    setMine(new Set());
    try {
      receive(await clearUploads(cartUploadIds()));
    } catch {
      await refresh();
    }
  }

  const current = (list ?? []).filter(item => mine.has(item.id));
  return { pending: session.isPending, signedIn, list, current, problem, sending, add, clear };
}

export type Uploads = ReturnType<typeof useUploads>;
