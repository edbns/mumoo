import { personFrom, recordPerson } from '../../lib/person.mjs';
import { storageReady } from '../../lib/storage.mjs';
import { entries, listUploads, MAX_PHOTO_BYTES, motionArrived, removeAllExcept, removeUpload, reserveMotion, saveUpload, USES } from '../../lib/uploads.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFUSALS = {
  format: [415, 'Use a JPEG, PNG or WebP photo, or an MP4, MOV, WebM or GIF.'],
  size: [413, 'That file is too large.'],
  busy: [409, 'Your last picture is still being prepared. Try again in a moment.'],
  full: [409, 'Your storage is full. Delete some files or creatives to make room.'],
};
const refuse = (reason) => reply(...REFUSALS[reason]);
/** Every change answers with the person's pictures as they now are, so the page needs no second request. */
/** A failure on our side is logged and becomes `fallback`, so the person gets a plain answer and we keep the reason. */
const guarded = (work, fallback) => work.catch((cause) => { console.error('uploads:', cause); return fallback; });
const pictures = async (status, userId) => reply(status, { uploads: await entries(userId) });

/**
 * Your own pictures: at most one for each row of the shelf, and a new one replaces the old.
 *   GET    lists them (a picture still being prepared is settled first)
 *   POST   ?kind=photo&use=dust|filter|riso|window  a JPEG body (Dust, Riso and Window have its subject cut out)
 *   POST   ?kind=motion JSON {use, type, bytes}: reserves room (Filters and Window only), returns {id, putUrl} to send the video or GIF to
 *   PUT    ?id=…        the video or GIF has been sent: start preparing it
 *   DELETE ?id=…        removes it and everything made from it
 *   DELETE ?except=a,b  removes every picture but those (a new run starts clean; the ones a cart still uses stay). `except=` alone removes all.
 * Adding a picture is the person's confirmation that they own the rights to it; the time is kept with it.
 */
export default async function handler(request) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return reply(405, { error: 'Use GET, POST, PUT or DELETE.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.MUMOO_MUSIC_BRIDGE_SECRET || !storageReady()) return reply(503, { error: 'Uploads are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  await recordPerson(person);
  const params = new URL(request.url).searchParams;
  if (request.method === 'GET') return reply(200, { uploads: await listUploads(person.id) });
  if (request.method === 'POST') {
    if (params.get('kind') === 'motion') {
      const { use, type, bytes } = await request.json().catch(() => ({}));
      if (typeof use !== 'string' || typeof type !== 'string' || !Number.isInteger(bytes) || bytes < 1) return reply(400, { error: 'Say what the file is for, what it is and how big.' });
      const result = await reserveMotion(person.id, use, type, bytes);
      return result.refused ? refuse(result.refused) : reply(201, result);
    }
    if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return refuse('size');
    const use = params.get('use') ?? '';
    if (!USES.includes(use)) return reply(400, { error: 'Say whether the photo is for Dust, Riso, Window or Our photography.' });
    const result = await guarded(saveUpload(person.id, use, new Uint8Array(await request.arrayBuffer())), { failed: true });
    if (result.failed) return reply(502, { error: 'We could not start preparing that photo. Try again.' });
    return result.refused ? refuse(result.refused) : pictures(201, person.id);
  }
  if (request.method === 'DELETE' && params.has('except')) {
    const keep = (params.get('except') ?? '').split(',').filter(Boolean);
    if (keep.length > 100 || !keep.every(value => UUID.test(value))) return reply(400, { error: 'Invalid id.' });
    await guarded(removeAllExcept(person.id, keep), 0);
    return pictures(200, person.id);
  }
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply(400, { error: 'Invalid id.' });
  if (request.method === 'PUT') {
    const started = await guarded(motionArrived(person.id, id), false);
    return started ? pictures(202, person.id) : reply(404, { error: 'That file has not arrived, or could not be prepared.' });
  }
  return (await removeUpload(person.id, id)) ? pictures(200, person.id) : reply(404, { error: 'Not found.' });
}

export const config = { path: '/api/uploads', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
