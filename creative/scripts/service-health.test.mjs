import { test } from 'node:test';
import assert from 'node:assert/strict';
import status from '../netlify/functions/status.mjs';
import { db } from '../netlify/lib/person.mjs';
import { judgeCalls, judgeRenders, note, renderCounts } from '../netlify/lib/service-health.mjs';

const READY = Boolean(process.env.DATABASE_URL);
const calls = pattern => [...pattern].map(mark => ({ ok: mark === 'y' }));

test('a part is up through a quiet hour and the odd failure, and down when half its calls fail or the last ones all did', () => {
  assert.equal(judgeCalls([]).up, true);
  assert.equal(judgeCalls(calls('nyyyyy')).up, true);
  assert.equal(judgeCalls(calls('nny')).up, true, 'two failures in a row, then one that worked');
  assert.equal(judgeCalls(calls('nnn')).up, false, 'three in a row, nothing working since');
  assert.equal(judgeCalls(calls('nynyny')).up, false, 'half of six failed');
  assert.equal(judgeCalls(calls('nynyyy')).up, true);
  assert.match(judgeCalls(calls('nnnn')).note, /4 of the last 4/);
});

test('the renderer is down when videos wait too long with none finishing, or half the hour’s videos failed', () => {
  assert.equal(judgeRenders({ stuck: 0, done: 0, failed: 0, doneLately: 0 }).up, true);
  assert.equal(judgeRenders({ stuck: 2, done: 3, failed: 0, doneLately: 0 }).up, false);
  assert.equal(judgeRenders({ stuck: 2, done: 3, failed: 0, doneLately: 1 }).up, true, 'a long queue that is still moving');
  assert.equal(judgeRenders({ stuck: 0, done: 2, failed: 2, doneLately: 2 }).up, false);
  assert.equal(judgeRenders({ stuck: 0, done: 3, failed: 1, doneLately: 3 }).up, true);
});

test('a note is kept after the reply when the platform allows it', async () => {
  const kept = [];
  assert.equal(note({ waitUntil: promise => kept.push(promise) }, 'analysis', true, Date.now()), undefined);
  assert.equal(kept.length, 1);
  await kept[0];
});

test('the status address answers per part, and refuses an unknown one', { skip: !READY, timeout: 30000 }, async () => {
  const ask = part => status(new Request(`https://mumoo.test/api/status?part=${part}`));
  const unknown = await ask('everything');
  assert.equal(unknown.status, 400);
  for (const part of ['analysis', 'lyrics', 'renders']) {
    const answer = await ask(part);
    assert.ok([200, 503].includes(answer.status), part);
    const body = await answer.json();
    assert.deepEqual(Object.keys(body), ['part', 'state', 'note']);
    assert.equal(body.state, answer.status === 200 ? 'up' : 'down');
  }
  const counts = await renderCounts();
  for (const key of ['stuck', 'done', 'failed', 'doneLately']) assert.equal(typeof counts[key], 'number');
});

test('a call that worked is kept with how long it took', { skip: !READY, timeout: 30000 }, async () => {
  const sql = db();
  const startedAt = Date.now() - 1234;
  await note(null, 'genre', true, startedAt);
  const [row] = await sql`select ok, ms from service_events where service = 'genre' and ms between 1200 and 2500 order by at desc limit 1`;
  assert.equal(row.ok, true);
  await sql`delete from service_events where service = 'genre' and ms = ${row.ms} and at > now() - interval '1 minute'`;
});
