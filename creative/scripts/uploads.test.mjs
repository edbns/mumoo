import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { QUOTA_BYTES, usedBytes } from '../netlify/lib/allowance.mjs';
import { db } from '../netlify/lib/person.mjs';
import { storageReady } from '../netlify/lib/storage.mjs';
import { listUploads, removeUpload, saveUpload, uploadBytes } from '../netlify/lib/uploads.mjs';

/** Live check of Cloudflare R2 + Postgres for people's own photos. Needs .env.local; skipped without it. */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);
const jpeg = (size) => Uint8Array.from({ length: size }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 7);

async function withPerson(run) {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try { await run(sql, userId); } finally { await sql`delete from app_users where id = ${userId}`; }
}

test('a photo is stored privately, handed back to its owner only, and removed', { skip: !READY, timeout: 60000 }, () => withPerson(async (_sql, userId) => {
  const { id } = await saveUpload(userId, jpeg(4096));
  assert.ok(id);
  assert.equal((await uploadBytes(userId, id)).length, 4096, 'the owner can read it back');
  assert.equal(await uploadBytes(`test-${randomUUID()}`, id), null, 'someone else cannot');

  const [item] = await listUploads(userId);
  assert.equal(item.id, id);
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

test('only JPEGs of a sensible size are accepted', { skip: !READY, timeout: 60000 }, () => withPerson(async (_sql, userId) => {
  assert.deepEqual(await saveUpload(userId, new Uint8Array(100).fill(1)), { refused: 'format' });
  assert.deepEqual(await saveUpload(userId, jpeg(3_000_001)), { refused: 'size' });
}));

test('photos and finished creatives share one storage allowance', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  for (let part = 0; part < 5; part++) {
    await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${userId}, ${`fc-SHARE000000${part}`}, ${part < 4 ? 1_000_000_000 : QUOTA_BYTES - 4_000_000_000 - 1000})`;
  }
  assert.deepEqual(await saveUpload(userId, jpeg(2000)), { refused: 'full' }, 'creatives fill the room photos need');
}));
