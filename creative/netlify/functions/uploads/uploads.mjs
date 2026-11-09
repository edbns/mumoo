import { personFrom, recordPerson } from '../../lib/person.mjs';
import { storageReady } from '../../lib/storage.mjs';
import { listUploads, MAX_UPLOAD_BYTES, removeUpload, saveUpload } from '../../lib/uploads.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFUSALS = {
  format: [415, 'Photos must be JPEG.'],
  size: [413, 'That photo is too large.'],
  count: [409, 'You have reached the limit of 100 photos. Delete some to add more.'],
  full: [409, 'Your storage is full. Delete some photos or creatives to make room.'],
};

/**
 * GET /api/uploads lists the signed-in person's photos; POST adds one (a JPEG body, only with the rights
 * confirmation header); DELETE /api/uploads?id=… removes one.
 */
export default async function handler(request) {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return reply(405, { error: 'Use GET, POST or DELETE.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !storageReady()) return reply(503, { error: 'Uploads are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  await recordPerson(person);
  if (request.method === 'GET') return reply(200, { uploads: await listUploads(person.id) });
  if (request.method === 'POST') {
    if (request.headers.get('x-mumoo-rights') !== 'confirmed') return reply(400, { error: 'Confirm that you have the rights to this photo.' });
    if (Number(request.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES) return reply(...REFUSALS.size);
    const result = await saveUpload(person.id, new Uint8Array(await request.arrayBuffer()));
    return result.refused ? reply(...REFUSALS[result.refused]) : reply(201, { id: result.id });
  }
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return reply(400, { error: 'Invalid id.' });
  return (await removeUpload(person.id, id)) ? reply(200, { removed: id }) : reply(404, { error: 'Not found.' });
}

export const config = { path: '/api/uploads', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
