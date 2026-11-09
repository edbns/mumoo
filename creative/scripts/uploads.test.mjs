import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { QUOTA_BYTES, usedBytes } from '../netlify/lib/allowance.mjs';
import { db } from '../netlify/lib/person.mjs';
import { putObject, storageReady } from '../netlify/lib/storage.mjs';
import { listUploads, removeUpload, reserveMotion, saveUpload, uploadMedia } from '../netlify/lib/uploads.mjs';

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

test('a new Filter picture replaces the old one at once, rows and files', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  const first = await saveUpload(userId, 'filter', jpeg(1000));
  const [before] = await listUploads(userId);
  const second = await saveUpload(userId, 'filter', jpeg(2000));
  const rows = await listUploads(userId);
  assert.deepEqual(rows.map(row => row.id), [second.id], 'one picture is kept');
  assert.equal((await fetch(before.url)).status, 404, 'the old photo is gone from storage');
  assert.equal(await uploadMedia(userId, first.id), null);
  assert.equal(await usedBytes(userId), 2000);
  const [{ stamped }] = await sql`select (rights_confirmed_at is not null) as stamped from uploads where id = ${second.id}`;
  assert.equal(stamped, true, 'uploading is the confirmation of the rights, and the time is kept');
}));

test('a Dust photo keeps the old one drawn until the new one is ready, then replaces it', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  let outcome = { ok: true, bytes: { cutout: 500 } };
  await withWorker(() => outcome, async () => {
    const first = await saveUpload(userId, 'dust', jpeg(1000));
    const [old] = await listUploads(userId);
    assert.equal(old.status, 'ready');
    assert.ok(old.cutoutUrl, 'Dust gets its cut-out');

    outcome = 'running';
    const second = await saveUpload(userId, 'dust', jpeg(1500));
    assert.deepEqual(await saveUpload(userId, 'dust', jpeg(300)), { refused: 'busy' }, 'one at a time');
    const meanwhile = await listUploads(userId);
    assert.deepEqual(meanwhile.map(row => [row.id, row.status]), [[second.id, 'preparing'], [first.id, 'ready']], 'the old one is still there to draw');
    assert.equal((await fetch(old.url)).status, 200);

    outcome = { ok: true, bytes: { cutout: 500 } };
    const settled = await listUploads(userId);
    assert.deepEqual(settled.map(row => [row.id, row.status]), [[second.id, 'ready']], 'now only the new one');
    assert.equal((await fetch(old.url)).status, 404, 'the old photo is gone from storage');
  });
}));

test('a Riso photo is cut out like a Dust one, and each row keeps its own', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  await withWorker(() => ({ ok: true, bytes: { cutout: 500 } }), async () => {
    const riso = await saveUpload(userId, 'riso', jpeg(1000));
    const dust = await saveUpload(userId, 'dust', jpeg(1200));
    const rows = await listUploads(userId);
    assert.deepEqual(rows.map(row => [row.id, row.use, row.status]).sort(), [[dust.id, 'dust', 'ready'], [riso.id, 'riso', 'ready']].sort(), 'one photo per row');
    assert.ok(rows.every(row => row.cutoutUrl), 'both get a cut-out');
  });
}));

test('a Window photo is cut out like a Dust one, a Window video is kept as a clip, and each row keeps its own', { skip: !READY, timeout: 90000 }, () => withPerson(async (sql, userId) => {
  await withWorker(() => ({ ok: true, bytes: { cutout: 500 } }), async () => {
    const photo = await saveUpload(userId, 'window', jpeg(1000));
    const riso = await saveUpload(userId, 'riso', jpeg(1100));
    const rows = await listUploads(userId);
    assert.deepEqual(rows.map(row => [row.id, row.use, row.status]).sort(), [[photo.id, 'window', 'ready'], [riso.id, 'riso', 'ready']].sort(), 'one picture per row');
    assert.ok(rows.every(row => row.cutoutUrl), 'a Window photo gets a cut-out, so a person can stand in front of the word');
    // The stand-in worker only answers; the cut-out file it would have written is put where the real one puts it.
    await putObject(`uploads/${userId}/${photo.id}.cut.png`, new Uint8Array(500).fill(7), 'image/png');
    const media = await uploadMedia(userId, photo.id);
    assert.equal(media.use, 'window');
    assert.equal(media.photo.length, 1000);
    assert.equal(media.cutout.length, 500);
  });
  const reserved = await reserveMotion(userId, 'window', 'video/mp4', 1000);
  assert.ok(reserved.id && reserved.putUrl);
  const [row] = await sql`select use, kind, status from uploads where id = ${reserved.id}`;
  assert.deepEqual({ ...row }, { use: 'window', kind: 'motion', status: 'preparing' });
  const next = await reserveMotion(userId, 'window', 'image/gif', 1000);
  assert.ok(next.id, 'a new Window picture replaces the old reservation');
  assert.equal((await sql`select 1 from uploads where id = ${reserved.id}`).length, 0, 'one Window picture is kept');
  assert.equal((await sql`select 1 from uploads where user_id = ${userId} and use = 'riso'`).length, 1, 'the Riso photo is not touched');
}));

test('a photo the worker cannot prepare is removed and reported once; the old one stays', { skip: !READY, timeout: 90000 }, () => withPerson(async (_sql, userId) => {
  let outcome = { ok: true, bytes: { cutout: 500 } };
  await withWorker(() => outcome, async () => {
    const first = await saveUpload(userId, 'dust', jpeg(1000));
    await listUploads(userId);
    outcome = { ok: false, error: 'That photo has nothing to cut out.' };
    const second = await saveUpload(userId, 'dust', jpeg(1500));
    const answer = await listUploads(userId);
    assert.deepEqual(answer.map(row => [row.id, row.status, row.error]), [[second.id, 'failed', 'That photo has nothing to cut out.'], [first.id, 'ready', undefined]]);
    const later = await listUploads(userId);
    assert.deepEqual(later.map(row => row.id), [first.id], 'told once, then gone');
    assert.equal(await uploadMedia(userId, second.id), null);
  });
}));

test('only JPEGs of a sensible size are accepted, and only for a known row', { skip: !READY, timeout: 60000 }, () => withPerson(async (_sql, userId) => {
  assert.deepEqual(await saveUpload(userId, 'filter', new Uint8Array(100).fill(1)), { refused: 'format' });
  assert.deepEqual(await saveUpload(userId, 'filter', jpeg(3_000_001)), { refused: 'size' });
  assert.deepEqual(await saveUpload(userId, 'poster', jpeg(100)), { refused: 'format' });
  assert.deepEqual(await reserveMotion(userId, 'filter', 'application/pdf', 100), { refused: 'format' });
  assert.deepEqual(await reserveMotion(userId, 'filter', 'image/gif', 25_000_001), { refused: 'size' });
  assert.deepEqual(await reserveMotion(userId, 'window', 'image/gif', 25_000_001), { refused: 'size' });
  assert.deepEqual(await reserveMotion(userId, 'dust', 'video/mp4', 1000), { refused: 'format' }, 'Dust and Riso take photos only');
  assert.deepEqual(await reserveMotion(userId, 'riso', 'video/mp4', 1000), { refused: 'format' });
}));

test('a video reservation that never arrived gives its room back, by time or when the next picture is added', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  const { id, putUrl } = await reserveMotion(userId, 'filter', 'video/mp4', 1000);
  assert.ok(id && putUrl);
  assert.equal((await listUploads(userId)).filter(item => item.status === 'preparing').length, 1);
  await sql`update uploads set created_at = now() - interval '2 hours' where id = ${id}`;
  assert.deepEqual(await listUploads(userId), [], 'the reservation was never used, so it is gone');

  const abandoned = await reserveMotion(userId, 'filter', 'video/mp4', 1000);
  const next = await saveUpload(userId, 'filter', jpeg(500));
  assert.deepEqual((await listUploads(userId)).map(item => item.id), [next.id], `a new picture clears reservation ${abandoned.id}`);
}));

test('photos and finished creatives share one storage allowance', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  for (let part = 0; part < 5; part++) {
    await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${userId}, ${`fc-SHARE000000${part}`}, ${part < 4 ? 1_000_000_000 : QUOTA_BYTES - 4_000_000_000 - 1000})`;
  }
  assert.deepEqual(await saveUpload(userId, 'filter', jpeg(2000)), { refused: 'full' }, 'creatives fill the room photos need');
}));
