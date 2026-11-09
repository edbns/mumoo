/**
 * A download in progress: the cloud render ids of the cart items being made. They are kept in this browser, so
 * after a refresh or a reloaded tab the page picks the renders up again instead of losing them.
 */
export const PENDING_KEY = 'mumoo-pending-download';
const VERSION = 1;

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
