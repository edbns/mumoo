import { webcrypto } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// The functions runtime can be older than Node 20, where `crypto` is not a global; jose needs it.
globalThis.crypto ??= webcrypto;

let keys;
let sql;

/** The person behind a Neon Auth token, or null. The token is checked against Neon Auth's published signing keys. */
async function personFrom(request) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) return null;
  keys ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin });
    return typeof payload.sub === 'string' && typeof payload.email === 'string' ? { id: payload.sub, email: payload.email } : null;
  } catch {
    return null;
  }
}

/** GET /api/account — who is signed in. Also records that they were here (powers history and reminders). */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  sql ??= neon(process.env.DATABASE_URL);
  const [row] = await sql`
    insert into app_users (id, email) values (${person.id}, ${person.email})
    on conflict (id) do update set email = excluded.email, last_seen_at = now()
    returning id, email, created_at, last_seen_at`;
  return reply(200, { id: row.id, email: row.email, createdAt: row.created_at, lastSeenAt: row.last_seen_at });
}

export const config = { path: '/api/account', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
