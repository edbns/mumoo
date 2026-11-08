import { personFrom, recordPerson } from '../../lib/person.mjs';
import { listRenders, removeRender } from '../../lib/renders.mjs';
import { storageReady } from '../../lib/storage.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** GET /api/renders lists the signed-in person's finished creatives; DELETE /api/renders?id=… removes one. */
export default async function handler(request) {
  if (!['GET', 'DELETE'].includes(request.method)) return reply(405, { error: 'Use GET or DELETE.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !storageReady()) return reply(503, { error: 'History is unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  await recordPerson(person);
  if (request.method === 'GET') return reply(200, { renders: await listRenders(person.id) });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return reply(400, { error: 'Invalid id.' });
  return (await removeRender(person.id, id)) ? reply(200, { removed: id }) : reply(404, { error: 'Not found.' });
}

export const config = { path: '/api/renders', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
