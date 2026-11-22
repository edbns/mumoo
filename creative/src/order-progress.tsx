import { useEffect, useRef, useState } from 'react';
import { ChosenBar } from './cart-panel';
import { PENDING_KEY, estimatedPercent, expired, orderLabel, readPending } from './cart-jobs';
import { ORDER_WAIT_MS, cancelCloudJobs, followCloudJobs } from './pack-cloud-export';
import type { DownloadProgress } from './use-cart-download';

/**
 * The bottom bar on pages outside the app (pricing, legal): while an order is being made it shows how far along it is, and Cancel
 * takes back the videos not started yet. It only watches: the app delivers the videos when the person goes back to it.
 */
export function OrderProgress() {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const ids = useRef<string[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    const pending = readPending(localStorage.getItem(PENDING_KEY));
    if (!pending || !pending.jobs.length || expired(pending, Date.now(), ORDER_WAIT_MS)) return;
    ids.current = pending.jobs.map(job => job.jobId);
    const controller = new AbortController();
    const total = ids.current.length;
    let done = 0;
    let takenBack = 0;
    let waiting = 0;
    let making = total;
    const show = () => setProgress({
      label: orderLabel({ total, done, takenBack, waiting }),
      percent: estimatedPercent(done, total, Date.now() - pending.startedAt, making),
      cancellable: waiting > 0 && !cancelled.current,
      cancelling: cancelled.current && waiting > 0,
    });
    show();
    const ticking = setInterval(show, 1000);
    void followCloudJobs('', ids.current, {
      onUpdate: (queued, rendering) => { waiting = queued; making = rendering; show(); },
      onEnd: (_id, end) => {
        done += 1;
        if ('cancelled' in end) takenBack += 1;
        show();
      },
    }, controller.signal).catch(() => undefined).finally(() => {
      clearInterval(ticking);
      if (!controller.signal.aborted) setProgress(null);
    });
    return () => { controller.abort(); clearInterval(ticking); };
  }, []);

  function cancel() {
    if (cancelled.current || !ids.current.length) return;
    cancelled.current = true;
    setProgress(current => current && { ...current, cancellable: false, cancelling: true });
    void cancelCloudJobs('', ids.current).catch(() => { cancelled.current = false; });
  }

  return <ChosenBar count={0} progress={progress} onOpen={() => {}} onCancel={cancel} />;
}
