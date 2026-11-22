import { validAccess } from '../lib/access.mjs';
import { personFrom, recordPerson } from '../lib/person.mjs';
import { QUEUE_ID, pump, statesOf } from '../lib/render-queue.mjs';
import { storageReady } from '../lib/storage.mjs';

/**
 * How a person's queued creatives are doing (POST `{ ids }`): for each, queued, running, done or failed (`render-queue.mjs`
 * `statesOf`). Asking also moves the queue on a turn, so videos start and are kept in Media while the page is open; the scheduled
 * `render-queue` does the same when it is not.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
/** The most a person can have in one order: the largest pack. */
const MAX_IDS = 300;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function encodeCreativeStatus(request, context) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Cloud render is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if ((process.env.MUMOO_MUSIC_BRIDGE_SECRET || '').length < 32 || !storageReady()) return error(503, 'Cloud render is not configured.');
  if (!process.env.DATABASE_URL) return error(503, 'Accounts are unavailable.');
  const person = await personFrom(request);
  if (!person || !await recordPerson(person)) return error(401, 'Sign in to see your videos.');

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > MAX_IDS || !ids.every(id => typeof id === 'string' && QUEUE_ID.test(id))) return error(400, 'Invalid video ids.');
  try {
    const jobs = await statesOf(person.id, ids);
    // The queue moves on after the answer, so asking stays quick; a turn cut short is picked up again by the next one.
    const turn = pump({ limit: 2 }).catch(cause => console.error('render queue turn:', cause));
    if (typeof context?.waitUntil === 'function') context.waitUntil(turn);
    else await turn;
    return Response.json({ jobs }, { headers });
  } catch (cause) {
    console.error('encode-creative-status:', cause);
    return error(503, 'Couldn’t check your videos. Trying again.');
  }
}
