import { useEffect, useRef, useState } from 'react';
import type { Cart, CartItem } from './cart';
import { PENDING_KEY, estimatedPercent, expired, readPending, writePending, type PendingDownload } from './cart-jobs';
import { friendlyError } from './friendly-error';
import { JOB_TIMEOUT_MS, awaitCloudJob } from './pack-cloud-export';
import { reportDelivered } from './pack-feedback';
import { reportProblem } from './report-problem';

export type DownloadProgress = { label: string; percent: number };
/** What the person is told when a download ends, wherever they are in the app. */
export type DownloadMessage = { kind: 'ready' | 'error'; text: string };

const ASKED_KEY = 'mumoo-notify-asked';

/** True while we still want to ask for permission to notify: asked once, never again, and never when the browser already decided. */
function shouldAskToNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'default' && !localStorage.getItem(ASKED_KEY);
}

/** Must run inside the person's click on Download, or the browser ignores the request. */
function askToNotify() {
  if (!shouldAskToNotify()) return;
  localStorage.setItem(ASKED_KEY, '1');
  void Notification.requestPermission();
}

function notify(text: string) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification('Your creatives are ready', { body: text });
}

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
 * The cart's download, from any page. The studio only submits the render jobs; from then on the job ids are kept in the
 * browser and followed here, so a refresh or a reloaded tab picks the renders up again. When every video is ready the
 * file is handed to the browser, the person is told (on the page, and by the browser if they allowed it) and the items
 * that were downloaded leave the cart. A failure keeps the cart.
 */
export function useCartDownload({ token, cart, onDelivered }: { token: string; cart: Cart; onDelivered: () => void }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [message, setMessage] = useState<DownloadMessage | null>(null);
  const running = useRef(false);
  const latest = useRef({ token, cart, onDelivered });
  latest.current = { token, cart, onDelivered };

  async function follow(pending: PendingDownload) {
    const total = pending.jobs.length;
    let done = 0;
    const show = () => setProgress({
      label: total > 1 ? `Made ${done} of ${total}` : 'Making your creative…',
      percent: estimatedPercent(done, total, Date.now() - pending.startedAt),
    });
    show();
    const ticking = setInterval(show, 1000);
    // One render failing does not end the wait for the others: the ones that are made are delivered, the rest stay in the cart.
    type Result = { job: PendingDownload['jobs'][number]; video: Blob } | { job: PendingDownload['jobs'][number]; cause: unknown };
    const results = await Promise.all(pending.jobs.map(async (job): Promise<Result> => {
      try {
        return { job, video: await awaitCloudJob(latest.current.token, job.jobId) };
      } catch (cause) {
        return { job, cause };
      } finally {
        done += 1;
        show();
      }
    })).finally(() => clearInterval(ticking));
    const made = results.flatMap(result => ('video' in result ? [{ job: result.job, video: result.video }] : []));
    const failed = results.flatMap(result => ('cause' in result ? [result.cause] : []));
    if (!made.length) throw failed[0];
    setProgress({ label: 'Getting your download ready…', percent: 100 });
    // The renders are done: from here a failure is the download's (the file could not be put together or saved), not a render's.
    try {
      const { file, name } = await bundle(made.map(entry => entry.video));
      saveFile(file, name);
    } catch (cause) {
      throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), { problemKind: 'download' });
    }
    localStorage.removeItem(PENDING_KEY);
    const signedIn = await import('./account').then(account => account.sessionToken()).then(Boolean).catch(() => false);
    const count = made.length;
    const delivered = made.map(entry => entry.job.itemId);
    const ready = `${count === 1 ? 'Your creative is' : `Your ${count} creatives are`} ready${signedIn ? ' and in your History.' : ' and downloaded.'}`;
    let text = ready;
    if (failed.length) {
      const reason = friendlyError(failed[0], 'The creatives could not be exported.');
      reportProblem('render', reason);
      text = `${ready} ${failed.length === 1 ? '1 could not be made' : `${failed.length} could not be made`} (${reason.replace(/\.$/, '')}) and ${failed.length === 1 ? 'is' : 'are'} still in your cart: press Download to try again.`;
    }
    latest.current.cart.removeFrom(pending.songKey, delivered);
    reportDelivered(latest.current.token, pending.songKey.split(':')[0], delivered);
    setMessage({ kind: failed.length ? 'error' : 'ready', text });
    notify(text);
    latest.current.onDelivered();
  }

  async function run(begin: () => Promise<PendingDownload>) {
    running.current = true;
    setMessage(null);
    try {
      await follow(await begin());
    } catch (cause) {
      localStorage.removeItem(PENDING_KEY);
      const text = friendlyError(cause, 'The creatives could not be exported.');
      reportProblem((cause as { problemKind?: 'download' }).problemKind ?? 'render', text);
      setMessage({ kind: 'error', text: `${text} Your cart is kept.` });
    } finally {
      running.current = false;
      setProgress(null);
    }
  }

  /** `submit` starts one render per item (in order) and returns their ids; it may report what it is doing. */
  function start(songKey: string, items: readonly CartItem[], submit: (report: (label: string) => void) => Promise<string[]>) {
    if (running.current) return;
    askToNotify();
    setProgress({ label: 'Starting…', percent: 0 });
    void run(async () => {
      const ids = await submit(label => setProgress({ label, percent: 0 }));
      const pending: PendingDownload = { songKey, startedAt: Date.now(), jobs: items.map((item, index) => ({ itemId: item.id, jobId: ids[index] })) };
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
    if (!pending || expired(pending, Date.now(), JOB_TIMEOUT_MS)) {
      localStorage.removeItem(PENDING_KEY);
      reportProblem('download', 'A download that was in progress did not finish.');
      setMessage({ kind: 'error', text: 'A download that was in progress did not finish. Your cart is kept, press Download to try again.' });
      return;
    }
    void run(async () => pending);
  }, [token]);

  return { progress, message, dismiss: () => setMessage(null), start };
}

export type CartDownload = ReturnType<typeof useCartDownload>;
