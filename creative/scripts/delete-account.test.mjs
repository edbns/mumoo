import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { allowanceOf, confirmVideo, reserveVideo } from '../netlify/lib/credits.mjs';
import { deleteAccount } from '../netlify/lib/delete-account.mjs';
import { db, recordPerson } from '../netlify/lib/person.mjs';
import { listKeys, objectSize, putObject, storageReady } from '../netlify/lib/storage.mjs';
import handler from '../netlify/functions/account/account.mjs';

/** Deleting an account completely. Live: a throwaway person with files in storage and rows everywhere a person leaves them. */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);

test('/api/account will not delete anything for someone not signed in', async () => {
  const response = await handler(new Request('https://example.test/api/account', { method: 'DELETE', body: '{}' }));
  assert.ok([401, 503].includes(response.status));
});

test('the free video is once per address: a deleted account signed up again with it, a "+tag" or Gmail dots gets none', { skip: !process.env.DATABASE_URL, timeout: 60000 }, async () => {
  const sql = db();
  const tag = randomUUID().slice(0, 8);
  const used = `free.${tag}@gmail.com`;
  const unused = `never-${tag}@example.test`;
  const olden = `older-${tag}@example.test`;
  const comeBack = [used, `FREE${tag}+again@googlemail.com`, `f.r.e.e.${tag}@gmail.com`];
  const ids = [];
  const signUp = async email => {
    const id = randomUUID();
    ids.push(id);
    await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${id}, '', ${email}, true, now(), now())`;
    await sql`insert into app_users (id, email) values (${id}, ${email})`;
    return id;
  };
  try {
    const first = await signUp(used);
    assert.equal((await allowanceOf(first)).freeVideo, true, 'a new address has its free video');
    const spend = await reserveVideo(first);
    assert.equal(spend?.free, true);
    await confirmVideo(first, spend.id, randomUUID());
    await deleteAccount({ id: first, email: used }, async () => {});
    const kept = await sql`select email_key from free_videos_used where email_key = free_video_key(${used})`;
    assert.equal(kept.length, 1, 'a code of the address is kept');
    assert.ok(!kept[0].email_key.includes(tag), 'not the address itself');
    for (const email of comeBack) {
      const again = await signUp(email);
      assert.deepEqual(await allowanceOf(again), { credits: 0, freeVideo: false }, `${email} gets no second free video`);
      assert.equal(await reserveVideo(again), null, `${email} cannot make a video without credits`);
      await deleteAccount({ id: again, email }, async () => {});
    }

    // An older account: its videos were made before free videos were counted, so it has renders but no free spend.
    const older = await signUp(olden);
    await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${older}, ${randomUUID()}, 3)`;
    assert.equal((await allowanceOf(older)).freeVideo, false, 'an account that made videos has had its free one');
    await deleteAccount({ id: older, email: olden }, async () => {});
    const olderAgain = await signUp(olden);
    assert.deepEqual(await allowanceOf(olderAgain), { credits: 0, freeVideo: false }, 'deleting an older account does not bring a free video');

    const never = await signUp(unused);
    await deleteAccount({ id: never, email: unused }, async () => {});
    const back = await signUp(unused);
    assert.equal((await allowanceOf(back)).freeVideo, true, 'an address that never used it still has it');
  } finally {
    await sql`delete from free_videos_used where email_key in (select free_video_key(e) from unnest(${[used, unused, olden]}::text[]) as e)`;
    for (const id of ids) {
      await sql`delete from neon_auth."user" where id = ${id}`;
      await sql`delete from app_users where id = ${id}`;
    }
  }
});

test('deleting an account removes every file, row and the sign-in, and the brain keeps only codes nobody can trace', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const id = randomUUID();
  const email = `delivered+gone-${id.slice(0, 8)}@resend.dev`;
  const upload = randomUUID();
  const render = randomUUID();
  const keys = [`uploads/${id}/${upload}.jpg`, `uploads/${id}/${upload}.cut.png`, `renders/${id}/${render}.mp4`, `uploads/${id}/${randomUUID()}.src`];
  const clip = randomBytes(32).toString('hex');
  try {
    await sql`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${id}, '', ${email}, true, now(), now())`;
    await sql`insert into neon_auth.session (id, "userId", token, "expiresAt", "createdAt", "updatedAt") values (${randomUUID()}, ${id}, ${randomUUID()}, now() + interval '1 day', now(), now())`;
    await sql`insert into app_users (id, email) values (${id}, ${email})`;
    await sql`insert into uploads (id, user_id, kind, bytes, rights_confirmed_at) values (${upload}, ${id}, 'photo', 3, now())`;
    await sql`insert into renders (id, user_id, job_id, bytes) values (${render}, ${id}, ${randomUUID()}, 3)`;
    await sql`insert into email_changes (user_id, new_email, code_hash) values (${id}, ${`x${email}`}, 'h')`;
    await sql`insert into problems (kind, user_id, email, message) values ('download', ${id}, ${email}, 'test')`;
    await sql`insert into brain_feedback (event, user_id, clip_sha256, genre, lane) values ('play', ${id}, ${clip}, 'Pop', 'party')`;
    // The last one an unfinished upload left behind: no row knows it.
    for (const key of keys) await putObject(key, new Uint8Array([1, 2, 3]), 'application/octet-stream');

    const letters = [];
    await deleteAccount({ id, email }, async (mail) => { letters.push(mail); });
    assert.equal(letters.length, 1, 'they are told it is done');
    assert.equal(letters[0].to, email);
    assert.equal(letters[0].subject, 'Your mumoo account has been deleted');
    assert.ok(!letters[0].text.includes(email), 'the letter does not show their address');

    for (const key of keys) assert.equal(await objectSize(key), null, `${key} is gone`);
    assert.deepEqual([...await listKeys(`uploads/${id}/`), ...await listKeys(`renders/${id}/`)], []);
    for (const [table, rows] of Object.entries({
      'neon_auth user': await sql`select 1 from neon_auth."user" where id = ${id}`,
      'neon_auth session': await sql`select 1 from neon_auth.session where "userId" = ${id}`,
      app_users: await sql`select 1 from app_users where id = ${id}`,
      uploads: await sql`select 1 from uploads where user_id = ${id}`,
      renders: await sql`select 1 from renders where user_id = ${id}`,
      email_changes: await sql`select 1 from email_changes where user_id = ${id}`,
      problems: await sql`select 1 from problems where user_id = ${id} or email = ${email}`,
    })) assert.equal(rows.length, 0, `nothing left in ${table}`);
    assert.equal(await recordPerson({ id, email }), undefined, 'a token still in use does not bring the account back');
    assert.equal((await sql`select 1 from app_users where id = ${id}`).length, 0);
    const [kept] = await sql`select user_id from brain_feedback where clip_sha256 = ${clip}`;
    assert.equal(kept.user_id, null, 'the feedback stays, but forgets whose it was');
  } finally {
    await sql`delete from brain_feedback where clip_sha256 = ${clip}`;
    await sql`delete from neon_auth."user" where id = ${id}`;
    await sql`delete from app_users where id = ${id}`;
    await sql`delete from problems where email = ${email}`;
  }
});
