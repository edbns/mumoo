import { validAccess } from '../lib/access.mjs';
import { personFrom, recordPerson } from '../lib/person.mjs';
import { refusalOf } from '../lib/render-outbound.mjs';
import { enqueue } from '../lib/render-queue.mjs';
import { storageReady } from '../lib/storage.mjs';

/**
 * Queue creatives to be made (`render-queue.mjs`), up to `BATCH` per request (one `meta` each): returns their queue ids at once, and
 * the order they joined. The first request of an order sends the song's audio (≈960 KB WAV), later ones name the order (`order`).
 * Every video is made for a signed-in person and takes one credit when it is queued (`credits.mjs`): their free first video, else
 * one they bought. When the credits run out part way, the ones queued are returned with `noCredits`; with none at all it answers 402.
 * A video that fails gives its credit back. The picture is named, never sent: the queue reads it from the library or from that
 * person's own storage when the render starts.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const BODY_LIMIT = 4_000_000;
/** The most videos queued by one request; a bigger order comes in several. */
const BATCH = 10;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function encodeCreative(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Cloud render is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) {
    return error(403, 'Open MUMOO Staging to render a creative.');
  }
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if ((process.env.MUMOO_MUSIC_BRIDGE_SECRET || '').length < 32 || !storageReady()) return error(503, 'Cloud render is not configured.');
  if (!process.env.DATABASE_URL) return error(503, 'Accounts are unavailable.');
  const person = await personFrom(request);
  if (!person || !await recordPerson(person)) return error(401, 'Sign in to make a video.');

  try {
    if (Number(request.headers.get('content-length') || 0) > BODY_LIMIT) return error(413, 'Render request is too large.');
    const incoming = await request.formData();
    const audio = incoming.get('audio');
    const order = incoming.get('order');
    const raws = incoming.getAll('meta');
    if (!raws.length || raws.length > BATCH || !raws.every(raw => typeof raw === 'string' && raw.length <= 400_000)) return error(400, 'Expected the creatives’ settings.');
    if (typeof order === 'string' ? audio !== null : !(audio instanceof Blob)) return error(400, 'Send the song’s audio, or the order it joins.');
    if (audio instanceof Blob && audio.size < 1000) return error(400, 'Audio file is too small.');
    const metas = raws.map(raw => JSON.parse(raw));
    for (const meta of metas) {
      const refused = refusalOf(meta);
      if (refused) return error(400, refused);
    }

    const queued = await enqueue(person.id, typeof order === 'string'
      ? { order, metas }
      : { audio: new Uint8Array(await audio.arrayBuffer()), metas });
    if (queued.refused) return error(410, queued.refused);
    if (!queued.ids.length) return Response.json({ error: 'You’re out of credits. Buy a pack to make this video.', code: 'no_credits' }, { status: 402, headers });
    return Response.json(queued, { status: 202, headers });
  } catch (cause) {
    if (cause instanceof SyntaxError) return error(400, 'Expected the creative’s settings.');
    console.error('encode-creative:', cause);
    return error(503, 'Your creative could not be queued. Try again in a moment.');
  }
}
