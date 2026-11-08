import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

/**
 * Live check of Neon Auth + Neon Postgres together: a real person signs up, Neon Auth issues a token,
 * and /api/account verifies it and writes to the database. Needs the Neon variables from `neon deploy`
 * (.env.local); skipped without them.
 */
const READY = Boolean(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_JWKS_URL);
const BASE = process.env.NEON_AUTH_BASE_URL;
const ORIGIN = 'http://localhost:5173';

async function signUp(email, password) {
  const response = await fetch(`${BASE}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ email, password, name: 'Test' }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.getSetCookie().map(line => line.split(';')[0]).join('; ');
  const token = await (await fetch(`${BASE}/token`, { headers: { Cookie: cookie, Origin: ORIGIN } })).json();
  return { userId: (await response.json()).user.id, token: token.token };
}

const call = async (token) => {
  const { default: handler } = await import('../netlify/functions/account/account.mjs');
  return handler(new Request('https://example.test/api/account', { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
};

test('a signed-up person is verified by the server and recorded in Postgres', { skip: !READY, timeout: 60000 }, async () => {
  const sql = neon(process.env.DATABASE_URL);
  const email = `test-${randomUUID()}@example.com`;
  let userId;
  try {
    assert.equal((await call(null)).status, 401, 'no token');
    assert.equal((await call('not.a.token')).status, 401, 'garbage token');

    const session = await signUp(email, `pw-${randomUUID()}`);
    userId = session.userId;
    assert.ok(session.token, 'Neon Auth issued a token');

    const first = await call(session.token);
    assert.equal(first.status, 200);
    const person = await first.json();
    assert.equal(person.email, email);
    assert.equal(person.id, userId);
    assert.deepEqual((await sql`select email from app_users where id = ${userId}`).map(row => row.email), [email], 'row is in Postgres');

    const second = await (await call(session.token)).json();
    assert.equal(second.createdAt, person.createdAt, 'same person, not a second row');
    assert.ok(new Date(second.lastSeenAt) >= new Date(person.lastSeenAt), 'last seen moves forward');
    assert.equal((await sql`select count(*)::int as n from app_users where id = ${userId}`)[0].n, 1);
  } finally {
    if (userId) {
      await sql`delete from app_users where id = ${userId}`;
      await sql`delete from neon_auth."user" where id = ${userId}`;
    }
  }
});
