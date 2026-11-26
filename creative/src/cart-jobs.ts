/**
 * A download in progress: the render queue ids of the cart items being made. They are kept in this browser, so
 * after a refresh or a reloaded tab the page picks the renders up again instead of losing them.
 */
export const PENDING_KEY = 'mumoo-pending-download';
const VERSION = 2;

export type PendingJob = { itemId: string; jobId: string };

export type PendingDownload = {
  /** The cart (song and clip) the items came from. */
  songKey: string;
  startedAt: number;
  jobs: PendingJob[];
};

type Stored = { version: number } & PendingDownload;

const isJob = (value: unknown): value is PendingJob => {
  const job = value as PendingJob | null;
  return typeof job === 'object' && job !== null
    && typeof job.itemId === 'string' && job.itemId !== '' && typeof job.jobId === 'string' && job.jobId !== '';
};

export function writePending(pending: PendingDownload): string {
  const stored: Stored = { version: VERSION, ...pending };
  return JSON.stringify(stored);
}

/** The saved download, or null when there is none or it is damaged. */
export function readPending(raw: string | null): PendingDownload | null {
  if (!raw) return null;
  let stored: Stored;
  try {
    stored = JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
  if (stored?.version !== VERSION || typeof stored.songKey !== 'string' || stored.songKey === ''
      || !Number.isFinite(stored.startedAt) || !Array.isArray(stored.jobs) || stored.jobs.length === 0
      || !stored.jobs.every(isJob)) return null;
  return { songKey: stored.songKey, startedAt: stored.startedAt, jobs: stored.jobs };
}

/** Renders are given up on after `waitMs`; a download older than that cannot be waited for any more. */
export function expired(pending: PendingDownload, now: number, waitMs: number): boolean {
  return now - pending.startedAt > waitMs;
}

/** About how long one render takes; the worker says only "not yet", so the bar is a guess between finished videos. */
export const RENDER_PACE_MS = 70_000;

/**
 * How far along the download looks, a whole number, 0–95 until every video is in: the renders run side by side, so each
 * unfinished one creeps on a slowing curve that never passes 95%, and a finished one counts in full. Only the `making` ones (by
 * default every unfinished one) creep: the rest are still waiting their turn in the queue.
 */
export function estimatedPercent(done: number, total: number, elapsedMs: number, making = total - done): number {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  const guess = Math.min(0.95, 1 - Math.exp(-Math.max(0, elapsedMs) / RENDER_PACE_MS));
  return Math.min(95, Math.floor(((done + Math.min(making, total - done) * guess) / total) * 100));
}

/** What the bar says while an order is made: how many of the ones still wanted are made, and how many wait their turn. */
export function orderLabel({ total, done, takenBack, waiting }: { total: number; done: number; takenBack: number; waiting: number }): string {
  if (total <= 1) return waiting ? 'In queue…' : 'Rendering video…';
  return `Rendered ${done - takenBack} of ${total - takenBack}${waiting ? ` · ${waiting} in queue` : ''}`;
}

/**
 * What the bar adds when `slow` videos are taking longer than usual: that they are being seen to, and that the person need not
 * wait on the page (a finished video is kept in their Media, a failed one gives its credit back). Empty when none are.
 */
export function slowNote(slow: number, total: number): string {
  if (slow <= 0) return '';
  const which = total <= 1 ? 'This video is' : slow === 1 ? '1 video is' : `${slow} videos are`;
  return `${which} taking a little extra time—we’ll automatically retry if it stalls. You can safely leave this page; finished videos go straight to your Media, and any failed renders refund your credits.`;
}
