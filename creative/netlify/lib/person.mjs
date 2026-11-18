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

/**
 * Records that this person was here (restarts the inactivity clock) and returns their row. Undefined for an account that was
 * deleted: its token works for a few minutes more, and must not bring the account back.
 */
export async function recordPerson(person) {
  const [row] = await db()`
    insert into app_users (id, email)
    select ${person.id}, ${person.email}
    where exists (select 1 from neon_auth."user" where id::text = ${person.id}) or exists (select 1 from app_users where id = ${person.id})
    on conflict (id) do update set email = excluded.email, last_seen_at = now(), reminded_60_at = null, reminded_83_at = null
    returning id, email, created_at, last_seen_at, member_no`;
  return row;
}
