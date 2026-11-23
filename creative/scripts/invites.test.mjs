import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { confirmVideo, reserveVideo } from '../netlify/lib/credits.mjs';
import { deleteAccount } from '../netlify/lib/delete-account.mjs';
import { INVITES_A_DAY, inviteByEmail, welcomeOnce } from '../netlify/lib/invites.mjs';
import { db } from '../netlify/lib/person.mjs';

/** The welcome letter and invites sent by email. Live: throwaway people in the database, letters caught instead of sent. */
const READY = Boolean(process.env.DATABASE_URL);
const LINK = 'https://mumoo-staging.netlify.app/?ref=abcd2345';

async function withPeople(run) {
  const sql = db();
  const ids = [];
  const person = async (email) => {
    const id = randomUUID();
    ids.push(id);
    await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${id}, '', ${email}, true, now(), now())`;
    await sql`insert into app_users (id, email) values (${id}, ${email})`;
    return { id, email };
  };
  try {
    await run(sql, person);
  } finally {
    for (const id of ids) {
      await sql`delete from neon_auth."user" where id = ${id}`;
      await sql`delete from app_users where id = ${id}`;
    }
  }
}

test('a new account is welcomed once; an address that had its free video before is not welcomed again', { skip: !READY, timeout: 60000 }, () => withPeople(async (sql, person) => {
  const tag = randomUUID().slice(0, 8);
  const letters = [];
  const send = async (mail) => { letters.push(mail); };
  const first = await person(`welcome-${tag}@example.test`);
  assert.equal(await welcomeOnce(first.id, send), true);
  assert.equal(await welcomeOnce(first.id, send), false, 'not twice');
  assert.equal(letters.length, 1);
  assert.equal(letters[0].to, first.email);
  assert.equal(letters[0].subject, 'Welcome to mumoo — your first video is on us');
  assert.equal(letters[0].once, `welcome-${first.id}`);

  const spend = await reserveVideo(first.id);
  await confirmVideo(first.id, spend.id, randomUUID());
  await deleteAccount(first, async () => {});
  const again = await person(first.email);
  assert.equal(await welcomeOnce(again.id, send), false, 'signing up again with the address is not welcomed');
  assert.equal(letters.length, 1);
  await sql`delete from free_videos_used where email_key = free_video_key(${first.email})`;
}));

test('an invite by email goes once a month to an address, never to someone with an account, a few a day per person', { skip: !READY, timeout: 60000 }, () => withPeople(async (sql, person) => {
  const tag = randomUUID().slice(0, 8);
  const letters = [];
  const send = async (mail) => { letters.push(mail); };
  const inviter = await person(`inviter-${tag}@example.test`);
  const member = await person(`member-${tag}@example.test`);
  const friend = `friend-${tag}@example.test`;
  try {
    assert.deepEqual(await inviteByEmail(inviter, 'not an email', LINK, send), { status: 400, error: 'Check the email address and try again.' });
    assert.equal((await inviteByEmail(inviter, inviter.email.replace('@', '+me@'), LINK, send)).status, 400, 'not their own address');

    assert.deepEqual(await inviteByEmail(inviter, ` ${friend.toUpperCase()} `, LINK, send), { status: 200 });
    assert.equal(letters.length, 1);
    assert.equal(letters[0].to, friend);
    assert.match(letters[0].text, /Accept invite: https:\/\/mumoo-staging\.netlify\.app\/\?ref=abcd2345/);
    assert.ok(!letters[0].text.includes(inviter.email) && !letters[0].html.includes(inviter.email), 'the inviter’s address is not shown');
    const kept = await sql`select email_key from invite_emails where inviter_id = ${inviter.id}`;
    assert.equal(kept.length, 1);
    assert.ok(!kept[0].email_key.includes(tag), 'only a code of the address is kept');

    assert.deepEqual(await inviteByEmail(inviter, friend.replace('@', '+again@'), LINK, send), { status: 200 }, 'told it went…');
    assert.deepEqual(await inviteByEmail(inviter, member.email, LINK, send), { status: 200 });
    assert.equal(letters.length, 1, '…but the same address within a month and an existing account get nothing');

    for (let n = 1; n < INVITES_A_DAY; n++) await sql`insert into invite_emails (email_key, inviter_id) values (${`k${n}${tag}`}, ${inviter.id})`;
    const over = await inviteByEmail(inviter, `other-${tag}@example.test`, LINK, send);
    assert.equal(over.status, 429, 'a day’s invites run out');
    assert.equal(letters.length, 1);
  } finally {
    await sql`delete from invite_emails where inviter_id = ${inviter.id}`;
  }
}));
