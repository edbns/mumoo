import { webcrypto } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// The functions runtime can be older than Node 20, where `crypto` is not a global; jose needs it.
globalThis.crypto ??= webcrypto;

let keys;

/** One shared database connection for every function in this process. */
let sql;
export const db = () => (sql ??= neon(process.env.DATABASE_URL));

/** The person behind a Neon Auth token, or null. The token is checked against Neon Auth's published signing keys. */
export async function personFrom(request) {
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

/** Records that this person was here (powers history and reminders) and returns their row. */
export async function recordPerson(person) {
  const [row] = await db()`
    insert into app_users (id, email) values (${person.id}, ${person.email})
    on conflict (id) do update set email = excluded.email, last_seen_at = now()
    returning id, email, created_at, last_seen_at`;
  return row;
}
