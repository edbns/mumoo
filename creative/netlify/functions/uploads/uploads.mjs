import { personFrom, recordPerson } from '../../lib/person.mjs';
import { storageReady } from '../../lib/storage.mjs';
import { LIMITS, listUploads, MAX_PHOTO_BYTES, motionArrived, removeUpload, reserveMotion, saveUpload, USES } from '../../lib/uploads.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFUSALS = {
  format: [415, 'Use a JPEG, PNG or WebP photo, or an MP4, MOV, WebM or GIF.'],
  size: [413, 'That file is too large.'],
  full: [409, 'Your storage is full. Delete some files or creatives to make room.'],
};
const COUNT = {
  dust: `Dust uses one photo. Remove yours to add another.`,
  filter: `Filters keep up to ${LIMITS.filter} pictures. Remove one to add another.`,
};
const refuse = (reason, use = 'filter') => (reason === 'count' ? reply(409, { error: COUNT[use] }) : reply(...REFUSALS[reason]));

/**
 * Your own pictures.
 *   GET    lists them (a picture still being prepared is settled first)
 *   POST   ?kind=photo&use=dust|filter  a JPEG body (Dust has its subject cut out)
 *   POST   ?kind=motion JSON {type, bytes}: reserves room (Filters only), returns {id, putUrl} to send the video or GIF to
 *   PUT    ?id=…        the video or GIF has been sent: start preparing it
 *   DELETE ?id=…        removes it and everything made from it
 * Adding anything needs the rights confirmation header.
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
    if (request.headers.get('x-mumoo-rights') !== 'confirmed') return reply(400, { error: 'Confirm that you have the rights to this file.' });
    if (params.get('kind') === 'motion') {
      const { type, bytes } = await request.json().catch(() => ({}));
      if (typeof type !== 'string' || !Number.isInteger(bytes) || bytes < 1) return reply(400, { error: 'Say what the file is and how big.' });
      const result = await reserveMotion(person.id, type, bytes);
      return result.refused ? refuse(result.refused) : reply(201, result);
    }
    if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return refuse('size');
    const use = params.get('use') ?? '';
    if (!USES.includes(use)) return reply(400, { error: 'Say whether the photo is for Dust or Filters.' });
    const result = await saveUpload(person.id, use, new Uint8Array(await request.arrayBuffer()));
    return result.refused ? refuse(result.refused, use) : reply(201, { id: result.id });
  }
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply(400, { error: 'Invalid id.' });
  if (request.method === 'PUT') return (await motionArrived(person.id, id)) ? reply(202, { id }) : reply(404, { error: 'That file has not arrived.' });
  return (await removeUpload(person.id, id)) ? reply(200, { removed: id }) : reply(404, { error: 'Not found.' });
}

export const config = { path: '/api/uploads', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
