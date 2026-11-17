import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { QUOTA_BYTES, usedBytes } from '../netlify/lib/allowance.mjs';
import { db } from '../netlify/lib/person.mjs';
import { putObject, storageReady } from '../netlify/lib/storage.mjs';
import { listUploads, MAX_SHELF_PICTURES, removeAllExcept, removeUpload, reserveMotion, saveUpload, uploadMedia } from '../netlify/lib/uploads.mjs';

/** Live check of Cloudflare R2 + Postgres for people's own pictures. Needs .env.local; skipped without it. */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);
const jpeg = (size) => Uint8Array.from({ length: size }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 7);

async function withPerson(run) {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try { await run(sql, userId); } finally { await sql`delete from app_users where id = ${userId}`; }
}

/**
 * Stands in for our preparing worker, which a test cannot reach: starting a job answers with an id, and asking
 * how it is getting on answers with `outcome()` (the worker's result, or 'running'). Everything else (R2 above all) goes through for real.
 */
async function withWorker(outcome, run) {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://edbns-mumoo-staging--mumoo-prepare-media-staging-submit')) return Promise.resolve(Response.json({ id: 'fc-TESTJOB00001' }));
    if (url.startsWith('https://edbns-mumoo-staging--mumoo-prepare-media-staging-status')) {
      const answer = outcome();
      return Promise.resolve(answer === 'running' ? Response.json({ status: 'running' }, { status: 202 }) : Response.json(answer));
    }
    return real(input, init);
  };
  try { await run(); } finally { globalThis.fetch = real; }
}

const ready = { ok: true, bytes: { cutout: 500 } };

test('a photo is cut out on our worker, private to its owner, and removed with its files', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  await withWorker(() => ready, async () => {
    const { id } = await saveUpload(userId, jpeg(4096));
    assert.ok(id);
    // The stand-in worker only answers; the cut-out file it would have written is put where the real one puts it.
    await putObject(`uploads/${userId}/${id}.cut.png`, new Uint8Array(500).fill(7), 'image/png');
    const [item] = await listUploads(userId);
    assert.equal(item.id, id);
    assert.equal(item.status, 'ready');
    assert.ok(item.cutoutUrl, 'every photo gets its cut-out');
    const media = await uploadMedia(userId, id);
    assert.equal(media.photo.length, 4096, 'the owner can read it back');
    assert.equal(media.cutout.length, 500);
    assert.equal(await uploadMedia(`test-${randomUUID()}`, id), null, 'someone else cannot');
    const [{ stamped }] = await sql`select (rights_confirmed_at is not null) as stamped from uploads where id = ${id}`;
    assert.equal(stamped, true, 'uploading is the confirmation of the rights, and the time is kept');

    const shown = await fetch(item.url);
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get('content-disposition'), null, 'a preview link shows the photo rather than saving it');
    const bare = await fetch(item.url.split('?')[0]);
    assert.ok(bare.status === 400 || bare.status === 403, `without a signature it is refused, got ${bare.status}`);

    assert.equal(await usedBytes(userId), 4596);
    assert.equal(await removeUpload(randomUUID(), id), false, 'someone else cannot delete it');
    assert.equal(await removeUpload(userId, id), true);
    assert.equal((await fetch(item.url)).status, 404, 'object is gone from storage');
    assert.equal(await usedBytes(userId), 0);
  });
}));

test('a new run clears every picture but the ones a cart still uses, and never touches anyone else', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  await withWorker(() => ready, async () => {
    const stranger = `test-${randomUUID()}`;
    await _sql`insert into app_users (id, email) values (${stranger}, ${`${stranger}@example.com`})`;
    try {
      const kept = await saveUpload(userId, jpeg(2048));
      const gone = await saveUpload(userId, jpeg(1000));
      const also = await saveUpload(userId, jpeg(1200));
      const theirs = await saveUpload(stranger, jpeg(512));
      const [shown] = (await listUploads(userId)).filter(row => row.id === gone.id);
      assert.equal(await removeAllExcept(userId, [kept.id, also.id]), 1);
      assert.deepEqual((await listUploads(userId)).map(row => row.id).sort(), [also.id, kept.id].sort());
      assert.equal((await fetch(shown.url)).status, 404, 'the removed picture is gone from storage');
      assert.equal((await listUploads(stranger)).length, 1, 'another person keeps theirs');
      assert.equal(await removeAllExcept(userId, []), 2, 'nothing kept removes the rest');
      assert.deepEqual(await listUploads(userId), []);
      assert.equal(await removeUpload(stranger, theirs.id), true);
    } finally {
      await _sql`delete from app_users where id = ${stranger}`;
    }
  });
}));

test('the shelf keeps ten pictures side by side, and turns the eleventh away', { skip: !READY, timeout: 120000 }, () => withPerson(async (_sql, userId) => {
  await withWorker(() => ready, async () => {
    for (let n = 0; n < MAX_SHELF_PICTURES; n++) assert.ok((await saveUpload(userId, jpeg(300))).id);
    assert.deepEqual(await saveUpload(userId, jpeg(300)), { refused: 'many' });
    assert.deepEqual(await reserveMotion(userId, 'video/mp4', 1000), { refused: 'many' });
    assert.equal((await listUploads(userId)).filter(row => row.status === 'ready').length, MAX_SHELF_PICTURES, 'none replaces another');
  });
}));

test('a photo the worker cannot prepare is removed and reported once; the others stay', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  let outcome = ready;
  await withWorker(() => outcome, async () => {
    const first = await saveUpload(userId, jpeg(1000));
    await listUploads(userId);
    outcome = { ok: false, error: 'That photo has nothing to cut out.' };
    const second = await saveUpload(userId, jpeg(1500));
    const answer = await listUploads(userId);
    assert.deepEqual(answer.map(row => [row.id, row.status, row.error]), [[second.id, 'failed', 'That photo has nothing to cut out.'], [first.id, 'ready', undefined]]);
    const later = await listUploads(userId);
    assert.deepEqual(later.map(row => row.id), [first.id], 'told once, then gone');
    assert.equal(await uploadMedia(userId, second.id), null);
  });
}));

test('only JPEG photos and known video types of a sensible size are accepted', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  assert.deepEqual(await saveUpload(userId, new Uint8Array(100).fill(1)), { refused: 'format' });
  assert.deepEqual(await saveUpload(userId, jpeg(3_000_001)), { refused: 'size' });
  assert.deepEqual(await reserveMotion(userId, 'application/pdf', 100), { refused: 'format' });
  assert.deepEqual(await reserveMotion(userId, 'image/gif', 25_000_001), { refused: 'size' });
  const reserved = await reserveMotion(userId, 'video/mp4', 1000);
  assert.ok(reserved.id && reserved.putUrl);
  const [row] = await sql`select use, kind, status from uploads where id = ${reserved.id}`;
  assert.deepEqual({ ...row }, { use: 'any', kind: 'motion', status: 'preparing' });
}));

test('a video reservation that never arrived gives its room back after an hour', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
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
  assert.deepEqual(await saveUpload(userId, jpeg(2000)), { refused: 'full' }, 'creatives fill the room photos need');
}));
