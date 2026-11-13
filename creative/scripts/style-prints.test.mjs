import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { guessStyle, storePrint, validLabel, validPrint } from '../netlify/lib/style-prints.mjs';
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

/** A unit print pointing mostly along `axis`, a little along `lean`. */
const near = (axis, lean = (axis + 1) % 512, by = 0.2) => {
  const values = Array(512).fill(0);
  values[axis] = 1; values[lean] = by;
  const length = Math.hypot(1, by);
  return values.map(x => x / length);
};
const row = (sha, style, sub, print, genre = 'African') => ({ source_sha256: sha.repeat(64).slice(0, 64), style, genre, sub_genre: sub, print });

test('the brain guesses only when the nearest songs agree, and never from the clip\'s own song', () => {
  const rows = [
    row('a', 'Amapiano', 'Amapiano', near(0, 1)), row('b', 'Private school amapiano', 'Amapiano', near(0, 2)),
    row('c', 'Amapiano', 'Amapiano', near(0, 3)), row('d', 'Drill', 'Drill', near(9), 'Hip hop'),
  ];
  assert.deepEqual(guessStyle(near(0), rows, 'e'.repeat(64), { nearest: 3, agree: 2, share: 0.6 }),
    { style: 'Amapiano', genre: 'African', subGenre: 'Amapiano' }, 'the sub-genre\'s most voted style');

  const split = [row('a', 'Amapiano', 'Amapiano', near(0, 1)), row('b', 'Afro house', 'Afro House', near(0, 2))];
  assert.equal(guessStyle(near(0), split, 'e'.repeat(64), { nearest: 2, agree: 2, share: 0.6 }), null, 'two songs that disagree: not sure');
  assert.equal(guessStyle(near(0), rows.slice(0, 1), 'e'.repeat(64)), null, 'one song is not enough');
  assert.equal(guessStyle(near(0), [], 'e'.repeat(64)), null);
  const own = rows.slice(0, 2).map(r => ({ ...r, source_sha256: 'f'.repeat(64) }));
  assert.equal(guessStyle(near(0), own, 'f'.repeat(64)), null, 'its own song is left out');
  const twoClips = [row('a', 'Amapiano', 'Amapiano', near(0, 1)), row('a', 'Amapiano', 'Amapiano', near(0, 2))];
  assert.equal(guessStyle(near(0), twoClips, 'e'.repeat(64), { nearest: 3, agree: 2, share: 0.6 }), null, 'a song votes once, however many clips');
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

test('"We think it sounds like…": the guess is made by the server, and only a yes keeps the print', { skip: !READY, timeout: 60000 }, async () => {
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', MUMOO_BRAIN_TESTER_KEY: 'a'.repeat(40), MUMOO_MUSIC_BRIDGE_SECRET: 'b'.repeat(40) });
  const seeds = [label({ offsetMs: 0, source: 'seeded' }), label({ offsetMs: 0, source: 'seeded', style: 'Private school amapiano' })];
  const clip = { sourceSha256: randomBytes(32).toString('hex'), offsetMs: 30_000 };
  let running = true;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes('mumoo-sound-print-staging')) return realFetch(url, init);
    if (running) return Response.json({ status: 'running' }, { status: 202 });
    return Response.json(print({ values: near(500) }));
  };
  const answered = async answer => (await db()`select coalesce(sum(count), 0)::int as count from style_guess_answers where day = current_date and style = 'Amapiano' and answer = ${answer}`)[0].count;
  const before = { yes: await answered('yes'), no: await answered('no') };
  try {
    await storePrint(seeds[0], print({ values: near(500, 501) }));
    await storePrint(seeds[1], print({ values: near(500, 502) }));
    const { token } = await (await accessHandler(new Request(`${ORIGIN}/api/brain-tester-access`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }))).json();
    const ask = body => statusHandler(new Request(`${ORIGIN}/.netlify/functions/style-print-status`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-mumoo-brain-access': token }, body: JSON.stringify({ version: 1, id: 'fc-abcdefgh1234', ...body }),
    }));
    const kept = async () => (await db()`select style, source from style_prints where source_sha256 = ${clip.sourceSha256}`).map(r => [r.style, r.source]);

    assert.equal((await ask({ guess: clip })).status, 202);
    running = false;
    assert.deepEqual(await (await ask({ guess: clip })).json(), { status: 'guessed', guess: { style: 'Amapiano', genre: 'African', subGenre: 'Amapiano' } });
    assert.deepEqual(await kept(), [], 'guessing keeps nothing');

    assert.equal((await ask({ label: { ...clip, style: 'Amapiano', genre: 'African', subGenre: 'Amapiano', source: 'confirmed' } })).status, 400, 'the browser cannot say a guess was confirmed');
    assert.equal((await ask({ answer: 'maybe', style: 'Amapiano', clip })).status, 400);
    assert.equal((await ask({ answer: 'yes', style: 'Drill', clip })).status, 409, 'only the guess the server would make');

    assert.deepEqual(await (await ask({ answer: 'no', style: 'Amapiano', clip })).json(), { status: 'counted' });
    assert.deepEqual(await kept(), [], 'a no teaches nothing');
    assert.equal(await answered('no'), before.no + 1);

    assert.deepEqual(await (await ask({ answer: 'yes', style: 'Amapiano', clip })).json(), { status: 'stored' });
    assert.deepEqual(await kept(), [['Amapiano', 'confirmed']]);
    assert.equal(await answered('yes'), before.yes + 1);
  } finally {
    globalThis.fetch = realFetch;
    for (const sha of [clip.sourceSha256, ...seeds.map(seed => seed.sourceSha256)]) await db()`delete from style_prints where source_sha256 = ${sha}`;
    for (const answer of ['yes', 'no']) {
      await db()`update style_guess_answers set count = count - 1 where day = current_date and style = 'Amapiano' and answer = ${answer} and count > ${before[answer]}`;
    }
    await db()`delete from style_guess_answers where count = 0`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
