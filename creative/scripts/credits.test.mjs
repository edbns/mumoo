import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { allowanceOf, confirmVideo, releaseReservation, releaseVideo, reserveVideo } from '../netlify/lib/credits.mjs';
import { db } from '../netlify/lib/person.mjs';

/** Live check of spending credits against Postgres. Needs .env.local; skipped without it. */
const READY = Boolean(process.env.DATABASE_URL);

test('the first video is free, then each takes a credit, none are left after, and a failed one gives its credit back', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const id = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${id}, ${`${id}@example.com`})`;
  try {
    assert.deepEqual(await allowanceOf(id), { credits: 0, freeVideo: true });
    const free = await reserveVideo(id);
    assert.equal(free.free, true, 'the first video is the free one');
    await confirmVideo(id, free.id, `fc-test-${randomUUID()}`);
    assert.deepEqual(await allowanceOf(id), { credits: 0, freeVideo: false });
    assert.equal(await reserveVideo(id), null, 'nothing is made without credits');

    await sql`insert into credit_orders (id, user_id, videos, amount, currency, status) values (${`test-order-${randomUUID()}`}, ${id}, 2, 500, 'USD', 'paid')`;
    assert.deepEqual(await allowanceOf(id), { credits: 2, freeVideo: false });

    // Three started at once with two credits: two start, one is refused, never all three.
    const started = await Promise.all([reserveVideo(id), reserveVideo(id), reserveVideo(id)]);
    assert.equal(started.filter(Boolean).length, 2);
    assert.ok(started.filter(Boolean).every(spend => !spend.free));
    assert.equal((await allowanceOf(id)).credits, 0);

    // One never reached the worker, one failed there: both credits come back.
    const [first, second] = started.filter(Boolean);
    await releaseReservation(id, first.id);
    const job = `fc-test-${randomUUID()}`;
    await confirmVideo(id, second.id, job);
    assert.equal((await allowanceOf(id)).credits, 1);
    await releaseVideo(id, job);
    assert.equal((await allowanceOf(id)).credits, 2);

    // A video that was made and kept is never given back, even if the worker later says the job is gone.
    const kept = await reserveVideo(id);
    const keptJob = `fc-test-${randomUUID()}`;
    await confirmVideo(id, kept.id, keptJob);
    await sql`insert into renders (id, user_id, job_id, bytes) values (${randomUUID()}, ${id}, ${keptJob}, 1000)`;
    await releaseVideo(id, keptJob);
    assert.equal((await allowanceOf(id)).credits, 1);
  } finally {
    await sql`delete from app_users where id = ${id}`;
  }
});
