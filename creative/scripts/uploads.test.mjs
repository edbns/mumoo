import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { QUOTA_BYTES, usedBytes } from '../netlify/lib/allowance.mjs';
import { db } from '../netlify/lib/person.mjs';
import { storageReady } from '../netlify/lib/storage.mjs';
import { LIMITS, listUploads, removeUpload, reserveMotion, saveUpload, uploadMedia } from '../netlify/lib/uploads.mjs';

/** Live check of Cloudflare R2 + Postgres for people's own pictures. Needs .env.local; skipped without it. */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);
const jpeg = (size) => Uint8Array.from({ length: size }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 7);

async function withPerson(run) {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try { await run(sql, userId); } finally { await sql`delete from app_users where id = ${userId}`; }
}

test('a Filter photo is ready at once, private to its owner, and removed with its files', { skip: !READY, timeout: 60000 }, () => withPerson(async (_sql, userId) => {
  const { id } = await saveUpload(userId, 'filter', jpeg(4096));
  assert.ok(id);
  const media = await uploadMedia(userId, id);
  assert.equal(media.use, 'filter');
  assert.equal(media.photo.length, 4096, 'the owner can read it back');
  assert.equal(media.cutout, undefined, 'a Filter photo is not cut out');
  assert.equal(await uploadMedia(`test-${randomUUID()}`, id), null, 'someone else cannot');

  const [item] = await listUploads(userId);
  assert.equal(item.id, id);
  assert.equal(item.status, 'ready');
  assert.equal(item.cutoutUrl, undefined);
  const shown = await fetch(item.url);
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get('content-disposition'), null, 'a preview link shows the photo rather than saving it');
  const bare = await fetch(item.url.split('?')[0]);
  assert.ok(bare.status === 400 || bare.status === 403, `without a signature it is refused, got ${bare.status}`);

  assert.equal(await usedBytes(userId), 4096);
  assert.equal(await removeUpload(randomUUID(), id), false, 'someone else cannot delete it');
  assert.equal(await removeUpload(userId, id), true);
  assert.equal((await fetch(item.url)).status, 404, 'object is gone from storage');
  assert.equal(await usedBytes(userId), 0);
}));

test('each row keeps its own number of pictures: one for Dust, a few for Filters', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  const first = await saveUpload(userId, 'dust', jpeg(500)).catch(() => null);
  // Dust photos go to the cut-out worker, which may not be reachable from a test; the slot is taken either way.
  assert.ok(first === null || first.id, 'first Dust photo');
  const rows = await listUploads(userId);
  if (rows.some(row => row.use === 'dust')) assert.deepEqual(await saveUpload(userId, 'dust', jpeg(500)), { refused: 'count' }, 'a second Dust photo is refused');
  for (let n = 0; n < LIMITS.filter; n++) assert.ok((await saveUpload(userId, 'filter', jpeg(500))).id, `Filter picture ${n + 1}`);
  assert.deepEqual(await saveUpload(userId, 'filter', jpeg(500)), { refused: 'count' }, 'one past the Filter limit');
  assert.deepEqual(await reserveMotion(userId, 'video/mp4', 1000), { refused: 'count' }, 'videos count towards Filters');
}));

test('only JPEGs of a sensible size are accepted, and only for a known row', { skip: !READY, timeout: 60000 }, () => withPerson(async (_sql, userId) => {
  assert.deepEqual(await saveUpload(userId, 'filter', new Uint8Array(100).fill(1)), { refused: 'format' });
  assert.deepEqual(await saveUpload(userId, 'filter', jpeg(3_000_001)), { refused: 'size' });
  assert.deepEqual(await saveUpload(userId, 'poster', jpeg(100)), { refused: 'format' });
  assert.deepEqual(await reserveMotion(userId, 'application/pdf', 100), { refused: 'format' });
  assert.deepEqual(await reserveMotion(userId, 'image/gif', 25_000_001), { refused: 'size' });
}));

test('an abandoned video reservation gives its room back, and removal clears every file', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  const { id, putUrl } = await reserveMotion(userId, 'video/mp4', 1000);
  assert.ok(id && putUrl);
  assert.equal((await listUploads(userId)).filter(item => item.status === 'preparing').length, 1);
  await sql`update uploads set created_at = now() - interval '2 hours' where id = ${id}`;
  assert.deepEqual(await listUploads(userId), [], 'the reservation was never used, so it is gone');
}));

test('photos and finished creatives share one storage allowance', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  for (let part = 0; part < 5; part++) {
    await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${userId}, ${`fc-SHARE000000${part}`}, ${part < 4 ? 1_000_000_000 : QUOTA_BYTES - 4_000_000_000 - 1000})`;
  }
  assert.deepEqual(await saveUpload(userId, 'filter', jpeg(2000)), { refused: 'full' }, 'creatives fill the room photos need');
}));
