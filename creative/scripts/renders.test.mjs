import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../netlify/lib/person.mjs';
import { QUOTA_BYTES } from '../netlify/lib/allowance.mjs';
import { listRenders, removeRender, saveRender } from '../netlify/lib/renders.mjs';
import { storageReady } from '../netlify/lib/storage.mjs';

/**
 * Live check of Cloudflare R2 + Postgres: a finished render is kept for its owner, handed back through a
 * signed link, kept private from everyone else, and removed from both places. Needs .env.local; skipped without it.
 */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);

test('a render is stored privately, listed with a signed link, and removed', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  const mp4 = new Uint8Array(4096).fill(7);
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try {
    assert.equal(await saveRender(userId, 'fc-TESTJOB0001', mp4), true);
    assert.equal(await saveRender(userId, 'fc-TESTJOB0001', mp4), true, 'same job twice');
    const [{ n }] = await sql`select count(*)::int as n from renders where user_id = ${userId}`;
    assert.equal(n, 1, 'same job is one history entry');

    const [item] = await listRenders(userId);
    assert.equal(item.bytes, 4096);
    const download = await fetch(item.url);
    assert.equal(download.status, 200);
    assert.equal((await download.arrayBuffer()).byteLength, 4096, 'signed link returns the stored bytes');

    const bare = await fetch(item.url.split('?')[0]);
    assert.ok(bare.status === 400 || bare.status === 403, `the same object without a signature is refused, got ${bare.status}`);

    assert.equal(await removeRender(randomUUID(), item.id), false, 'someone else cannot delete it');
    assert.equal(await removeRender(userId, item.id), true);
    assert.equal((await fetch(item.url)).status, 404, 'object is gone from storage');
    assert.deepEqual(await listRenders(userId), []);
  } finally {
    await sql`delete from app_users where id = ${userId}`;
  }
});

test('a person at their storage allowance is not given more room', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try {
    // A single row holds at most about 2 GB, so the allowance is filled with several.
    for (let part = 0; part < 5; part++) {
      await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${userId}, ${`fc-FULL0000000${part}`}, ${part < 4 ? 1_000_000_000 : QUOTA_BYTES - 4_000_000_100})`;
    }
    assert.equal(await saveRender(userId, 'fc-FULL00000002', new Uint8Array(4096)), false);
  } finally {
    await sql`delete from app_users where id = ${userId}`;
  }
});
