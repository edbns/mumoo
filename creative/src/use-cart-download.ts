import { useEffect, useRef, useState } from 'react';
import type { Cart, CartItem } from './cart';
import { PENDING_KEY, estimatedPercent, expired, orderLabel, readPending, writePending, type PendingDownload } from './cart-jobs';
import { friendlyError } from './friendly-error';
import { ORDER_WAIT_MS, cancelCloudJobs, followCloudJobs } from './pack-cloud-export';
import { reportDelivered } from './pack-feedback';
import { reportProblem } from './report-problem';

export type DownloadProgress = {
  label: string;
  percent: number;
  /** Some videos have not started yet, so they can still be taken back. */
  cancellable?: boolean;
  /** Taking them back was asked for. */
  cancelling?: boolean;
};
/** What the person is told when a download ends, wherever they are in the app. */
export type DownloadMessage = { kind: 'ready' | 'error'; text: string };

/** One video as it is; several as one zip. */
async function bundle(videos: Blob[]): Promise<{ file: Blob; name: string }> {
  if (videos.length === 1) return { file: videos[0], name: 'mumoo-creative.mp4' };
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < videos.length; index++) files[`mumoo-creative-${index + 1}.mp4`] = new Uint8Array(await videos[index].arrayBuffer());
  const { zipSync } = await import('fflate');
  return { file: new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), name: 'mumoo-creatives.zip' };
}

function saveFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * The cart's download, from any page. The studio only queues the videos; from then on their queue ids are kept in the
 * browser and followed here, so a refresh or a reloaded tab picks the renders up again. Finished videos are kept in the
 * person's Media (nothing downloads by itself, unless their storage is full) and the items that were made leave the cart.
 * A failure keeps the cart.
 */
export function useCartDownload({ token, cart, onDelivered }: { token: string; cart: Cart; onDelivered: () => void }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [message, setMessage] = useState<DownloadMessage | null>(null);
  const running = useRef(false);
  /** The videos of the order being followed, and whether the person asked to take back the ones not started yet. */
  const following = useRef<string[]>([]);
  const cancelled = useRef(false);
  const latest = useRef({ token, cart, onDelivered });
  latest.current = { token, cart, onDelivered };

  async function follow(pending: PendingDownload) {
    const total = pending.jobs.length;
    let done = 0;
    let waiting = 0;
    let making = total;
    let takenBack = 0;
    const show = () => setProgress({
      label: orderLabel({ total, done, takenBack, waiting }),
      percent: estimatedPercent(done, total, Date.now() - pending.startedAt, making),
      cancellable: waiting > 0 && !cancelled.current,
      cancelling: cancelled.current && waiting > 0,
    });
    show();
    const ticking = setInterval(show, 1000);
    // One render failing does not end the wait for the others: the ones that are made are delivered, the rest stay in the cart.
    type Job = PendingDownload['jobs'][number];
    const results: Array<{ job: Job; video: Blob | null } | { job: Job; cause: unknown } | { job: Job; cancelled: true }> = [];
    const byId = new Map(pending.jobs.map(job => [job.jobId, job]));
    await followCloudJobs(latest.current.token, pending.jobs.map(job => job.jobId), {
      onUpdate: (queued, rendering) => { waiting = queued; making = rendering; show(); },
      onEnd: (id, end) => {
        const job = byId.get(id)!;
        results.push('cancelled' in end ? { job, cancelled: true } : 'cause' in end ? { job, cause: end.cause } : { job, video: end.video });
        if ('cancelled' in end) takenBack += 1;
        done += 1;
        show();
      },
    }).finally(() => clearInterval(ticking));
    const made = results.flatMap(result => ('video' in result ? [{ job: result.job, video: result.video }] : []));
    const failed = results.flatMap(result => ('cause' in result ? [result.cause] : []));
    const back = results.filter(result => 'cancelled' in result).length;
    if (!made.length && failed.length) throw failed[0];
    // Videos kept in Media are downloaded from there when the person wants them; only ones that could not be kept are saved now.
    const unkept = made.flatMap(entry => (entry.video ? [entry.video] : []));
    if (unkept.length) {
      setProgress({ label: 'Getting your download ready…', percent: 100 });
      // The renders are done: from here a failure is the download's (the file could not be put together or saved), not a render's.
      try {
        const { file, name } = await bundle(unkept);
        saveFile(file, name);
      } catch (cause) {
        throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), { problemKind: 'download' });
      }
    }
    localStorage.removeItem(PENDING_KEY);
    const delivered = made.map(entry => entry.job.itemId);
    // Success needs no notice: the person is on their Media, where the creatives appear. Only a partial failure or full storage is told.
    // Taken back: they are still chosen, and their credits are back.
    if (back) {
      setMessage({ kind: 'ready', text: `${back === 1 ? '1 video was' : `${back} videos were`} cancelled and ${back === 1 ? 'its credit is' : 'their credits are'} back. ${back === 1 ? 'It is' : 'They are'} still chosen.${made.length ? ` ${made.length === 1 ? 'The 1 that was made is' : `The ${made.length} that were made are`} in your Media.` : ''}` });
    }
    if (unkept.length && !failed.length) {
      setMessage({ kind: 'error', text: `Media storage is full, so ${unkept.length === 1 ? 'your new creative was' : `${unkept.length} new creatives were`} downloaded to this computer instead.` });
    }
    if (failed.length) {
      const reason = friendlyError(failed[0], 'Couldn’t export the creatives.');
      reportProblem('render', reason);
      const count = made.length;
      setMessage({ kind: 'error', text: `${count === 1 ? 'Your creative is' : `Your ${count} creatives are`} ready. ${failed.length === 1 ? '1 could not be made' : `${failed.length} could not be made`} (${reason.replace(/\.$/, '')}) and ${failed.length === 1 ? 'is' : 'are'} still chosen: open them from the bar at the bottom to try again.` });
    }
    if (!delivered.length) return;
    latest.current.cart.removeFrom(pending.songKey, delivered);
    reportDelivered(latest.current.token, pending.songKey.split(':')[0], delivered);
    latest.current.onDelivered();
  }

  async function run(begin: () => Promise<PendingDownload>) {
    running.current = true;
    cancelled.current = false;
    setMessage(null);
    try {
      const pending = await begin();
      following.current = pending.jobs.map(job => job.jobId);
      // Cancelled while the videos were still being queued: the ones that made it in are taken back now.
      if (cancelled.current && following.current.length) await cancelCloudJobs(latest.current.token, following.current).catch(() => undefined);
      await follow(pending);
    } catch (cause) {
      localStorage.removeItem(PENDING_KEY);
      const text = friendlyError(cause, 'Couldn’t export the creatives.');
      reportProblem((cause as { problemKind?: 'download' }).problemKind ?? 'render', text);
      setMessage({ kind: 'error', text: `${text} Your chosen videos are kept.` });
    } finally {
      running.current = false;
      following.current = [];
      setProgress(null);
    }
  }

  /** Takes back the videos not started yet (their credits come back, they stay chosen); the ones being made finish and are kept. */
  function cancel() {
    if (!running.current || cancelled.current) return;
    cancelled.current = true;
    setProgress(current => current && { ...current, cancellable: false, cancelling: true });
    if (following.current.length) {
      void cancelCloudJobs(latest.current.token, following.current).catch(cause => {
        cancelled.current = false;
        setMessage({ kind: 'error', text: friendlyError(cause, 'Couldn’t cancel. Try again.') });
      });
    }
  }

  /**
   * `submit` queues one render per item (in order) and returns their ids, the first ones only if it had to stop (`stopped` says the
   * person cancelled); it may report what it is doing.
   */
  function start(songKey: string, items: readonly CartItem[], submit: (report: (label: string) => void, stopped: () => boolean) => Promise<string[]>) {
    if (running.current) return;
    setProgress({ label: 'Starting…', percent: 0, cancellable: true });
    void run(async () => {
      const ids = await submit(label => setProgress(current => ({ label, percent: 0, cancellable: !cancelled.current, cancelling: cancelled.current && Boolean(current) })), () => cancelled.current);
      // Fewer ids than items when the credits ran out part way: the rest stay in the cart.
      const pending: PendingDownload = { songKey, startedAt: Date.now(), jobs: items.slice(0, ids.length).map((item, index) => ({ itemId: item.id, jobId: ids[index] })) };
      localStorage.setItem(PENDING_KEY, writePending(pending));
      return pending;
    });
  }

  // After a refresh or a reloaded tab, a download that was in progress is picked up again.
  useEffect(() => {
    if (!token || running.current) return;
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const pending = readPending(raw);
    if (!pending || expired(pending, Date.now(), ORDER_WAIT_MS)) {
      localStorage.removeItem(PENDING_KEY);
      reportProblem('download', 'A download that was going didn’t finish.');
      setMessage({ kind: 'error', text: 'Videos that were being made didn’t finish. Your chosen videos are kept — open them from the bottom bar to try again.' });
      return;
    }
    void run(async () => pending);
  }, [token]);

  return { progress, message, dismiss: () => setMessage(null), start, cancel };
}

export type CartDownload = ReturnType<typeof useCartDownload>;
