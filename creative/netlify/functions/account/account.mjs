import { QUOTA_BYTES, usedBytes } from '../../lib/allowance.mjs';
import { personFrom, recordPerson } from '../../lib/person.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** GET /api/account — who is signed in and how much of their storage is used. Also records that they were here (powers history and reminders). */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  const row = await recordPerson(person);
  return reply(200, {
    id: row.id, email: row.email, createdAt: row.created_at, lastSeenAt: row.last_seen_at,
    storage: { used: await usedBytes(person.id), quota: QUOTA_BYTES },
  });
}

export const config = { path: '/api/account', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
