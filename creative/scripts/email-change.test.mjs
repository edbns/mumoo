import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { confirmEmailChange, requestEmailChange } from '../netlify/lib/email-change.mjs';
import { db } from '../netlify/lib/person.mjs';
import handler from '../netlify/functions/account-email.mjs';

/**
 * Changing the email ourselves (Neon's managed sign-in refuses it). Live: a throwaway person in Neon's user table, codes mailed to
 * Resend's test inbox. The code itself only reaches the inbox, so the test swaps in a code of its own the same way it is stored.
 */
const READY = Boolean(process.env.DATABASE_URL && process.env.RESEND_API_KEY);

test('/api/account/email turns away anyone not signed in', async () => {
  const response = await handler(new Request('https://example.test/api/account/email', { method: 'POST', body: '{}' }));
  assert.ok([401, 503].includes(response.status));
});

test('a code sent to the new address changes the email in Neon and in ours, and nothing else about the account', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const old = `delivered+old-${tag}@resend.dev`;
  const next = `delivered+new-${tag}@resend.dev`;
  const other = `delivered+other-${tag}@resend.dev`;
  const person = { id, email: old };
  const otherId = randomUUID();
  await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${id}, '', ${old}, true, now(), now())`;
  await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${otherId}, '', ${other}, true, now(), now())`;
  const useCode = code => sql`update email_changes set code_hash = ${createHash('sha256').update(`${id}:${next}:${code}`).digest('hex')} where user_id = ${id}`;
  try {
    assert.equal((await requestEmailChange(person, 'not an email')).status, 400);
    assert.equal((await requestEmailChange(person, old.toUpperCase())).error, 'That is already your email.');
    assert.equal((await requestEmailChange(person, other)).status, 409, 'an address with an account of its own');

    assert.equal((await requestEmailChange(person, ` ${next.toUpperCase()} `)).status, 200, 'sent, and the address is read in lower case');
    assert.equal((await requestEmailChange(person, next)).status, 429, 'not again straight away');
    await useCode('123456');
    assert.equal((await confirmEmailChange(person, next, '654321')).status, 400, 'a wrong code');
    assert.equal((await confirmEmailChange(person, other, '123456')).status, 400, 'the code is for the address it was sent to');
    const done = await confirmEmailChange(person, next, '123456');
    assert.deepEqual(done, { status: 200, email: next });
    const [user] = await sql`select email, "emailVerified" from neon_auth."user" where id = ${id}`;
    assert.deepEqual(user, { email: next, emailVerified: true });
    const [mine] = await sql`select email from app_users where id = ${id}`;
    assert.equal(mine.email, next, 'the same account, under the new address');
    assert.equal((await confirmEmailChange(person, next, '123456')).status, 400, 'a code works once');
  } finally {
    await sql`delete from neon_auth."user" where id in (${id}, ${otherId})`;
    await sql`delete from app_users where id = ${id}`;
  }
});

test('guesses run out: after five wrong codes even the right one is refused', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const id = randomUUID();
  const next = `delivered+guess-${id.slice(0, 8)}@resend.dev`;
  const person = { id, email: `delivered+was-${id.slice(0, 8)}@resend.dev` };
  await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${id}, '', ${person.email}, true, now(), now())`;
  try {
    assert.equal((await requestEmailChange(person, next)).status, 200);
    await sql`update email_changes set code_hash = ${createHash('sha256').update(`${id}:${next}:111111`).digest('hex')} where user_id = ${id}`;
    for (let i = 0; i < 5; i++) assert.equal((await confirmEmailChange(person, next, '999999')).status, 400);
    assert.equal((await confirmEmailChange(person, next, '111111')).status, 400);
    const [user] = await sql`select email from neon_auth."user" where id = ${id}`;
    assert.equal(user.email, person.email, 'unchanged');
  } finally {
    await sql`delete from neon_auth."user" where id = ${id}`;
    await sql`delete from app_users where id = ${id}`;
  }
});
