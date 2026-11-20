import { useCallback, useEffect, useState } from 'react';
import { authClient } from './account';
import { addUpload, listUploads, MAX_SHELF_PICTURES, type Upload } from './uploads';
import { friendlyError } from './friendly-error';

/** Signed links last 15 minutes, so a long session asks for fresh ones before they run out. */
const RELINK_MS = 10 * 60_000;
/** While something is being prepared in the cloud, how often to ask whether it is ready. */
const POLL_MS = 2000;

/** What went wrong, in words for the person: with adding a picture, or (`listing`) with looking at their pictures at all. */
type PictureProblem = { listing: boolean; message: string };

/**
 * The signed-in person's own pictures: up to ten for the shelf. While something is being prepared in
 * the cloud it looks again every couple of seconds; otherwise it only looks when something changes.
 *
 * Every picture stays in the person's account (History → Uploads) until they delete it, but every visit starts with a clean shelf:
 * only pictures added in this run (`current`) are drawn on the rows, up to ten at once. The others stay in `list`, so a cart that
 * still draws from one can be downloaded.
 */
export function useUploads() {
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const [list, setList] = useState<Upload[] | null>(null);
  const [problem, setProblem] = useState<PictureProblem | null>(null);
  /** Which of the files is being sent now, and how much of it has gone (a photo is one quick request, so it has no share). */
  const [sending, setSending] = useState<{ index: number; total: number; share?: number } | null>(null);
  const waiting = list?.some(item => item.status === 'preparing') ?? false;
  /** The pictures added since this run began: the only ones the rows draw. */
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());
  /**
   * The batch being added: its pictures join `mine` together, only once every one is sent and prepared, so the Director deals
   * once from all of them rather than starting on the first and dealing again as each arrives.
   */
  const [incoming, setIncoming] = useState<{ ids: ReadonlySet<string>; total: number } | null>(null);

  /** Takes in a new list. A picture that could not be prepared arrives once, as a failed entry, and becomes the problem. */
  const receive = useCallback((next: Upload[]) => {
    const failed = next.find(item => item.status === 'failed');
    setList(next.filter(item => item.status !== 'failed'));
    if (failed) setProblem({ listing: false, message: failed.error ?? 'Couldn’t prepare that file. Try another.' });
  }, []);

  const refresh = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const next = await listUploads();
      if (!alive()) return;
      receive(next);
      setProblem(current => (current?.listing ? null : current));
    } catch (cause) {
      if (alive()) setProblem({ listing: true, message: friendlyError(cause, 'Your pictures are unavailable right now. Try again soon.') });
    }
  }, [receive]);

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

  /**
   * Adds pictures one after another, up to `MAX_SHELF_PICTURES` side by side. One that is refused does not stop the others;
   * the person is told which.
   */
  async function add(files: File[]) {
    const room = Math.max(0, MAX_SHELF_PICTURES - current.length);
    const taken = files.slice(0, room);
    setProblem(null);
    if (!taken.length) {
      setProblem({ listing: false, message: `You already have ${MAX_SHELF_PICTURES} of your own pictures. Start over to use others.` });
      return;
    }
    let known = new Set((list ?? []).map(item => item.id));
    const failed: string[] = [];
    setIncoming({ ids: new Set(), total: taken.length });
    for (const [index, file] of taken.entries()) {
      const place = { index, total: taken.length };
      setSending(place);
      try {
        const next = await addUpload(file, share => setSending({ ...place, share }));
        const added = next.map(item => item.id).filter(id => !known.has(id));
        known = new Set(next.map(item => item.id));
        setIncoming(current => current && { ...current, ids: new Set([...current.ids, ...added]) });
        receive(next);
      } catch (cause) {
        failed.push(friendlyError(cause, 'Couldn’t add that file. Try again.'));
      }
    }
    setSending(null);
    const left = files.length - taken.length;
    if (failed.length) {
      setProblem({ listing: false, message: taken.length > 1 ? `${failed.length} of ${taken.length} could not be added. ${failed[0]}` : failed[0] });
    } else if (left) {
      setProblem({ listing: false, message: `Only ${MAX_SHELF_PICTURES} of your own pictures at once, so ${left} ${left > 1 ? 'were' : 'was'} left out.` });
    }
  }

  // The batch is in once nothing is being sent and none of it is still being prepared (a failed one has left the list).
  const arrived = incoming && !sending && (list ?? []).every(item => !incoming.ids.has(item.id) || item.status !== 'preparing');
  useEffect(() => {
    if (!arrived || !incoming) return;
    const present = new Set((list ?? []).map(item => item.id));
    setMine(current => new Set([...current, ...[...incoming.ids].filter(id => present.has(id))]));
    setIncoming(null);
  }, [arrived, incoming, list]);

  /** How far the batch has got, 0–100: sending is most of it, then each picture being prepared in the cloud. */
  const batchPercent = (() => {
    if (!incoming) return null;
    const total = Math.max(1, incoming.total);
    const sent = sending ? sending.index + (sending.share ?? 0) : total;
    const prepared = (list ?? []).filter(item => incoming.ids.has(item.id) && item.status !== 'preparing').length;
    return Math.min(99, Math.floor(70 * (sent / total) + 30 * (sending ? 0 : prepared / total)));
  })();

  /** Start over: the rows go back to our own pictures. The person's stay in their account. */
  function clear() {
    setMine(new Set());
  }

  /** Puts pictures already in the account back on the shelf (History keeps them), together, as one batch that is already in. */
  function reuse(ids: readonly string[]) {
    setProblem(null);
    const ready = new Set((list ?? []).filter(item => item.status === 'ready').map(item => item.id));
    setMine(new Set(ids.filter(id => ready.has(id)).slice(0, MAX_SHELF_PICTURES)));
  }

  const current = (list ?? []).filter(item => mine.has(item.id));
  return { pending: session.isPending, signedIn, list, current, problem, sending, batchPercent, add, clear, reuse };
}

export type Uploads = ReturnType<typeof useUploads>;
