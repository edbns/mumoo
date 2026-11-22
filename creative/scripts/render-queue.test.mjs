import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { allowanceOf, reserveVideo, releaseReservation } from '../netlify/lib/credits.mjs';
import { db } from '../netlify/lib/person.mjs';
import { cancelWaiting, enqueue, pickNext, settleRunning, startWaiting, statesOf } from '../netlify/lib/render-queue.mjs';
import { deleteObject, objectSize, storageReady } from '../netlify/lib/storage.mjs';

/** The render queue: turns (always), and a live order against Postgres and storage with a stand-in worker (needs .env.local). */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);

const rows = (spec) => spec.flatMap(([userId, count]) => Array.from({ length: count }, (_, i) => ({ id: `${userId}${i + 1}`, userId })));

test('everyone’s first waiting video starts before anyone’s second', () => {
  const picked = pickNext(rows([['a', 10], ['b', 1], ['c', 2]]), new Map(), { perPerson: 4, runningMax: 5, spare: 0 });
  assert.deepEqual(picked, ['a1', 'b1', 'c1', 'a2', 'c2']);
});

test('one person’s huge order only ever has a few being made', () => {
  assert.deepEqual(pickNext(rows([['a', 5000]]), new Map(), { perPerson: 4, runningMax: 24 }), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(pickNext(rows([['a', 5000]]), new Map([['a', 4]]), { perPerson: 4, runningMax: 24 }), []);
});

test('a person with nothing being made still starts when the worker is busy, up to the spare room', () => {
  const busy = new Map([['a', 4], ['b', 4]]);
  assert.deepEqual(pickNext(rows([['a', 3], ['c', 2], ['d', 1]]), busy, { perPerson: 4, runningMax: 8, spare: 1 }), ['c1']);
  assert.deepEqual(pickNext(rows([['c', 1]]), new Map([['a', 4], ['b', 5]]), { perPerson: 4, runningMax: 8, spare: 1 }), []);
  assert.deepEqual(pickNext(rows([['a', 9]]), new Map(), { limit: 2 }), ['a1', 'a2']);
});

test('a big order is queued in one go, made in turns, kept, and failed videos give their credits back', { skip: !READY, timeout: 120000 }, async () => {
  const sql = db();
  const big = `test-${randomUUID()}`;
  const single = `test-${randomUUID()}`;
  const users = [big, single];
  const keys = [];
  for (const id of users) await sql`insert into app_users (id, email) values (${id}, ${`${id}@example.com`})`;
  try {
    await sql`insert into credit_orders (id, user_id, videos, amount, currency, status) values (${`test-order-${randomUUID()}`}, ${big}, 30, 500, 'USD', 'paid')`;
    const audio = new Uint8Array(4000).fill(7);
    const meta = { opts: { style: 'type' } };

    const first = await enqueue(big, { audio, metas: Array.from({ length: 12 }, () => meta) });
    assert.equal(first.ids.length, 12);
    assert.equal(first.noCredits, false);
    assert.equal(first.free, true, 'the free first video is one of them');
    keys.push(`render-queue/${big}/${first.order}.wav`);
    const more = await enqueue(big, { order: first.order, metas: [meta, meta] });
    assert.equal(more.order, first.order);
    assert.equal(more.ids.length, 2);
    assert.deepEqual(await allowanceOf(big), { credits: 30 - 13, freeVideo: false });
    assert.ok((await enqueue(big, { order: randomUUID(), metas: [meta] })).refused, 'an order that is not theirs');

    const one = await enqueue(single, { audio, metas: [meta] });
    keys.push(`render-queue/${single}/${one.order}.wav`);
    // Out of credits: nothing is queued and no audio is left behind.
    const none = await enqueue(single, { audio, metas: [meta, meta] });
    assert.deepEqual(none.ids, []);
    assert.equal(none.noCredits, true);
    assert.equal(await objectSize(`render-queue/${single}/${none.order}.wav`), null);

    // Waiting longer than an unconfirmed reservation lives does not lose the queued videos' credits.
    await sql`update credit_spends set created_at = now() - interval '1 hour' where user_id = any(${users})`;
    const probe = await reserveVideo(big);
    await releaseReservation(big, probe.id);
    assert.equal((await allowanceOf(big)).credits, 30 - 13);

    const sent = [];
    const answers = new Map();
    const worker = {
      async submit(form) {
        assert.ok(form.get('audio') instanceof Blob);
        assert.equal(JSON.parse(form.get('meta')).opts.style, 'type');
        const id = `fake-${sent.length}`;
        sent.push(id);
        answers.set(id, { state: 'running' });
        return { id };
      },
      async status(callId) { return answers.get(callId); },
    };
    assert.equal(await startWaiting({ worker, limit: 50, users }), 5, 'four of the big order and the single one');
    const running = await sql`select id, user_id, call_id from render_queue where user_id = any(${users}) and status = 'running' order by created_at`;
    assert.equal(running.filter(row => row.user_id === big).length, 4);
    assert.equal(running.filter(row => row.user_id === single).length, 1);
    assert.equal(await startWaiting({ worker, limit: 50, users }), 0, 'nobody gets more than their turn');

    const [made, broke, full] = running.filter(row => row.user_id === big);
    const singleRow = running.find(row => row.user_id === single);
    const mp4 = new Uint8Array(5000).fill(1);
    answers.set(made.call_id, { state: 'done', mp4 });
    answers.set(full.call_id, { state: 'done', mp4 });
    answers.set(singleRow.call_id, { state: 'done', mp4 });
    answers.set(broke.call_id, { state: 'failed', error: 'The worker broke.' });
    const kept = [];
    const keep = async (userId, jobId) => {
      if (jobId === full.id) return false;
      kept.push(jobId);
      return true;
    };
    await sql`update render_queue set checked_at = now() - interval '1 minute' where user_id = any(${users})`;
    assert.equal(await settleRunning({ worker, keep, limit: 50, users }), 5);
    keys.push(`render-queue/${big}/${full.id}.mp4`);
    assert.deepEqual(kept.sort(), [made.id, singleRow.id].sort());

    const states = await statesOf(big, [made.id, broke.id, full.id, singleRow.id]);
    assert.deepEqual(states[made.id], { status: 'done' });
    assert.deepEqual(states[broke.id], { status: 'failed', error: 'The worker broke.' });
    assert.equal(states[full.id].status, 'done');
    assert.match(states[full.id].download, /^https:/, 'a video Media had no room for can still be fetched');
    assert.deepEqual(states[singleRow.id], { status: 'missing' }, 'nobody sees another person’s videos');
    assert.equal(await objectSize(`render-queue/${big}/${full.id}.mp4`), 5000);
    assert.equal((await allowanceOf(big)).credits, 30 - 12, 'the failed one gave its credit back');
    assert.equal(await objectSize(`render-queue/${single}/${one.order}.wav`), null, 'a finished order’s audio is cleared');
    assert.equal(await objectSize(`render-queue/${big}/${first.order}.wav`), 4000, 'an order still going keeps its audio');

    assert.equal(await startWaiting({ worker, limit: 50, users }), 3, 'the big order’s next ones take the free turns');

    // Cancel: the ones not started are taken back with their credits; the ones being made carry on.
    const before = (await allowanceOf(big)).credits;
    const all = [...first.ids, ...more.ids];
    const waitingNow = await sql`select id from render_queue where user_id = ${big} and status = 'queued'`;
    assert.equal(await cancelWaiting(big, all), waitingNow.length);
    assert.equal(await cancelWaiting(single, all), 0, 'nobody takes back another person’s videos');
    assert.equal((await allowanceOf(big)).credits, before + waitingNow.length);
    const after = await statesOf(big, all);
    assert.ok(waitingNow.every(row => after[row.id].status === 'cancelled'));
    assert.equal(Object.values(after).filter(state => state.status === 'running').length, 4, 'the ones being made are not stopped');
    assert.equal(await objectSize(`render-queue/${big}/${first.order}.wav`), 4000, 'the order still being made keeps its audio');
  } finally {
    await Promise.all(keys.map(key => deleteObject(key).catch(() => undefined)));
    for (const id of users) await sql`delete from app_users where id = ${id}`;
  }
});
