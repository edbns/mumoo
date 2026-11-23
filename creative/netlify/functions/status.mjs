import { db } from '../lib/person.mjs';
import { polar, polarReady } from '../lib/polar.mjs';
import { judgeCalls, judgeRenders, recentCalls, renderCounts } from '../lib/service-health.mjs';
import { objectSize, storageReady } from '../lib/storage.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' };
/** A small file that need not exist: storage answering for it at all is what is checked. */
const STORAGE_PROBE = 'status/probe.txt';
const TIMEOUT_MS = 8000;

const within = (promise, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not answer in time.`)), TIMEOUT_MS))]);

/** Each part the status page shows, judged without waking any worker: from the real requests of the last hour, or one cheap check. */
const PARTS = {
  analysis: async () => judgeCalls(await recentCalls(['analysis', 'genre'])),
  lyrics: async () => judgeCalls(await recentCalls(['lyrics', 'meaning'])),
  renders: async () => judgeRenders(await renderCounts()),
  payments: async () => {
    if (!polarReady()) return { up: false, note: 'Payments are not set up.' };
    await within(polar('/v1/products/?limit=1'), 'Polar');
    return judgeCalls(await recentCalls(['checkout', 'payments']));
  },
  accounts: async () => {
    if (!process.env.NEON_AUTH_BASE_URL) return { up: false, note: 'Sign-in is not set up.' };
    await within(db()`select 1`, 'The database');
    const auth = await within(fetch(`${process.env.NEON_AUTH_BASE_URL.replace(/\/+$/, '')}/ok`, { redirect: 'manual' }), 'Sign-in');
    if (auth.status >= 500) return { up: false, note: 'Sign-in is not answering.' };
    return { up: true, note: 'Sign-in and accounts are answering.' };
  },
  storage: async () => {
    if (!storageReady()) return { up: false, note: 'Storage is not set up.' };
    await within(objectSize(STORAGE_PROBE), 'Storage');
    return { up: true, note: 'Storage is answering.' };
  },
};

/**
 * GET /api/status?part=… — whether one part of mumoo works right now: 200 when it does, 503 when it does not, with a short note.
 * Public, for the status page; it says nothing about anyone's account or songs.
 */
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return Response.json({ error: 'Use GET.' }, { status: 405, headers });
  const part = new URL(request.url).searchParams.get('part') ?? '';
  if (!Object.hasOwn(PARTS, part)) return Response.json({ error: `Ask for one of: ${Object.keys(PARTS).join(', ')}.` }, { status: 400, headers });
  let state;
  try {
    state = await PARTS[part]();
  } catch (cause) {
    console.error('status', part, cause.message);
    state = { up: false, note: 'Not answering right now.' };
  }
  return Response.json({ part, state: state.up ? 'up' : 'down', note: state.note }, { status: state.up ? 200 : 503, headers });
}

export const config = { path: '/api/status', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
