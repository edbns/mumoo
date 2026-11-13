import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { storePrint, validLabel, validPrint } from '../netlify/lib/style-prints.mjs';
import { db } from '../netlify/lib/person.mjs';
import printHandler from '../netlify/functions/style-print.mjs';
import statusHandler from '../netlify/functions/style-print-status.mjs';
import accessHandler from '../netlify/functions/brain-tester-access.mjs';

const READY = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'https://mumoo-staging.netlify.app';
const label = (over = {}) => ({ sourceSha256: randomBytes(32).toString('hex'), offsetMs: 42_000, style: 'Amapiano', genre: 'African', subGenre: 'Amapiano', source: 'creator', ...over });
const print = (over = {}) => ({ version: 1, status: 'ready', model: 'laion-clap music_audioset_epoch_15_esc_90.14', values: Array.from({ length: 512 }, (_, i) => Math.round(Math.sin(i) * 1e5) / 2e6), ...over });

test('a clip\'s label and a print are accepted only in their exact shape', () => {
  assert.equal(validLabel(label()), true);
  for (const source of ['confirmed', 'corrected', 'seeded']) assert.equal(validLabel(label({ source })), true);
  for (const bad of [null, label({ sourceSha256: 'nope' }), label({ offsetMs: -1 }), label({ offsetMs: 1.5 }), label({ style: ' ' }),
    label({ genre: 'x'.repeat(81) }), label({ subGenre: undefined }), label({ source: 'guess' })]) {
    assert.equal(validLabel(bad), false, JSON.stringify(bad)?.slice(0, 80));
  }
  assert.equal(validPrint(print()), true);
  for (const bad of [null, print({ version: 2 }), print({ status: 'unavailable' }), print({ values: print().values.slice(1) }),
    print({ values: [...print().values.slice(1), Number.NaN] }), print({ values: [...print().values.slice(1), 2] }), print({ model: 7 })]) {
    assert.equal(validPrint(bad), false);
  }
});

test('a clip keeps its latest answer, and the print as it was sent', { skip: !READY, timeout: 60000 }, async () => {
  const clip = label();
  try {
    await storePrint(clip, print());
    await storePrint({ ...clip, style: 'Afro house', subGenre: 'Afro House' }, print());
    const rows = await db()`select style, sub_genre, source, print from style_prints where source_sha256 = ${clip.sourceSha256}`;
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].style, rows[0].sub_genre, rows[0].source], ['Afro house', 'Afro House', 'creator']);
    assert.equal(rows[0].print.length, 512);
    assert.ok(rows[0].print.every((x, i) => Math.abs(x - print().values[i]) < 1e-6), 'the 512 numbers survive');
  } finally {
    await db()`delete from style_prints where source_sha256 = ${clip.sourceSha256}`;
  }
});

test('the endpoints start a print, keep it with the creator\'s style, and count "I don\'t know"', { skip: !READY, timeout: 60000 }, async () => {
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', MUMOO_BRAIN_TESTER_KEY: 'a'.repeat(40), MUMOO_MUSIC_BRIDGE_SECRET: 'b'.repeat(40) });
  const clip = label();
  const seen = [];
  let running = true;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes('mumoo-sound-print-staging')) return realFetch(url, init);
    seen.push({ url: String(url), auth: init.headers?.Authorization, size: init.body?.byteLength });
    if (String(url).includes('-submit.')) return Response.json({ id: 'fc-abcdefgh1234' });
    if (running) return Response.json({ status: 'running' }, { status: 202 });
    return Response.json(print());
  };
  const before = (await db()`select count from style_unknowns where day = current_date`)[0]?.count ?? 0;
  try {
    const { token } = await (await accessHandler(new Request(`${ORIGIN}/api/brain-tester-access`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }))).json();
    const send = (handler, path, type, body, access = token) => handler(new Request(`${ORIGIN}/.netlify/functions/${path}`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': type, 'x-mumoo-brain-access': access }, body,
    }));
    const wav = new Uint8Array(44 + 15 * 48_000 * 2);

    assert.equal((await send(printHandler, 'style-print', 'audio/wav', wav, 'wrong')).status, 401);
    assert.equal((await send(printHandler, 'style-print', 'audio/wav', wav.slice(0, 1000))).status, 400, 'only the 15 s at 48 kHz');
    const started = await send(printHandler, 'style-print', 'audio/wav', wav);
    assert.equal(started.status, 202);
    assert.deepEqual(await started.json(), { id: 'fc-abcdefgh1234' });
    assert.equal(seen[0].auth, `Bearer ${'b'.repeat(40)}`);
    assert.equal(seen[0].size, wav.byteLength);

    const ask = body => send(statusHandler, 'style-print-status', 'application/json', JSON.stringify(body));
    const job = { version: 1, id: 'fc-abcdefgh1234', label: clip };
    assert.equal((await ask(job)).status, 202);
    assert.equal((await ask({ ...job, label: { ...clip, source: 'seeded' } })).status, 400, 'only a creator\'s pick comes from the browser');
    running = false;
    assert.deepEqual(await (await ask(job)).json(), { status: 'stored' });
    const rows = await db()`select style, source from style_prints where source_sha256 = ${clip.sourceSha256}`;
    assert.deepEqual(rows.map(row => [row.style, row.source]), [['Amapiano', 'creator']]);

    assert.equal((await send(printHandler, 'style-print', 'application/json', JSON.stringify({ version: 1, unknown: true }))).status, 204);
    const after = (await db()`select count from style_unknowns where day = current_date`)[0].count;
    assert.equal(after, before + 1);
  } finally {
    globalThis.fetch = realFetch;
    await db()`delete from style_prints where source_sha256 = ${clip.sourceSha256}`;
    await db()`update style_unknowns set count = count - 1 where day = current_date and count > ${before}`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
