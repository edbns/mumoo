import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { confirmVideo, reserveVideo } from '../netlify/lib/credits.mjs';
import { deleteAccount } from '../netlify/lib/delete-account.mjs';
import { welcomeOnce } from '../netlify/lib/welcome.mjs';
import { db } from '../netlify/lib/person.mjs';

/** The welcome letter. Live: throwaway people in the database, letters caught instead of sent. */
const READY = Boolean(process.env.DATABASE_URL);

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
