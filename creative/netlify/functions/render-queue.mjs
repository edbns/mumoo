import { pump, sweep } from '../lib/render-queue.mjs';
import { storageReady } from '../lib/storage.mjs';
import { thisSite } from '../lib/sites.mjs';

/** Kept under the scheduled function's 30 seconds. */
const BUDGET_MS = 22_000;
const PAUSE_MS = 3_000;

/**
 * Runs every minute: moves the render queue on for as long as it may, so videos start, are kept in Media and give back the credits
 * of failed ones even when nobody's page is open; then clears what is no longer needed.
 */
export default async function renderQueue() {
  if (!thisSite() || !process.env.DATABASE_URL || !storageReady()) return;
  const end = Date.now() + BUDGET_MS;
  while (Date.now() < end) {
    const moved = await pump({ limit: 8 }).catch(cause => { console.error('render queue turn:', cause); return 0; });
    if (!moved) await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
  }
  await sweep().catch(cause => console.error('render queue sweep:', cause));
}

export const config = { schedule: '* * * * *' };
