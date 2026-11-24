import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BLEND, GUARDRAILS, blendGuess, checkPick, genreChances, guardrailsOn, guessStyle, houseOrTechno, storePrint, storeTempo, tempoNudge, validLabel, validPrint, validTempo } from '../netlify/lib/style-prints.mjs';
import ANCHORS from '../netlify/lib/genre-anchors.mjs';
import { db } from '../netlify/lib/person.mjs';
import printHandler from '../netlify/functions/style-print.mjs';
import statusHandler from '../netlify/functions/style-print-status.mjs';
import accessHandler from '../netlify/functions/brain-tester-access.mjs';

const READY = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'https://mumoo-staging.netlify.app';
/** A silent clip of `ms` as the browser writes it: mono 16-bit 48 kHz WAV. */
function silentWav(ms) {
  const data = 48 * ms * 2;
  const wav = new Uint8Array(44 + data);
  const view = new DataView(wav.buffer);
  wav.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, 36 + data, true); wav.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
  view.setUint32(28, 96_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wav.set(new TextEncoder().encode('data'), 36); view.setUint32(40, data, true);
  return wav;
}
const label = (over = {}) => ({ sourceSha256: randomBytes(32).toString('hex'), offsetMs: 42_000, style: 'Amapiano', genre: 'African', subGenre: 'Amapiano', source: 'creator', ...over });
const print = (over = {}) => ({ version: 1, status: 'ready', model: 'laion-clap music_audioset_epoch_15_esc_90.14', values: Array.from({ length: 512 }, (_, i) => Math.round(Math.sin(i) * 1e5) / 2e6), ...over });

test('a clip\'s label and a print are accepted only in their exact shape', () => {
  assert.equal(validLabel(label()), true);
  for (const source of ['confirmed', 'corrected', 'seeded']) assert.equal(validLabel(label({ source })), true);
  for (const bad of [null, label({ sourceSha256: 'nope' }), label({ offsetMs: -1 }), label({ offsetMs: 1.5 }), label({ style: ' ' }),
    label({ genre: 'x'.repeat(81) }), label({ subGenre: undefined }), label({ source: 'guess' })]) {
    assert.equal(validLabel(bad), false, JSON.stringify(bad)?.slice(0, 80));
  }
  assert.equal(validTempo({ sourceSha256: 'a'.repeat(64), offsetMs: 0, bpm: 140, energy: null }), true);
  assert.equal(validTempo({ sourceSha256: 'a'.repeat(64), offsetMs: 0, bpm: 401, energy: null }), false);
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
/** A unit print a little off `vector` along `axis`. */
const toward = (vector, axis, by = 0.2) => {
  const values = [...vector];
  values[axis] += by;
  const length = Math.hypot(...values);
  return values.map(x => x / length);
};
const lane = id => ANCHORS.lanes.find(item => item.id === id).vector;
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

test('the guess blends the nearest songs with the words describing each genre', () => {
  const hipHop = lane('hip-hop');
  const rows = ['a', 'b', 'c', 'd'].map((sha, i) => row(sha, i ? 'trap' : 'hip-hop', i ? 'Trap' : 'Hip-Hop', toward(hipHop, 1, 0.1 * (i + 1)), 'Hip-Hop & Rap'));
  const heard = { style: 'hip-hop', genre: 'Hip-Hop & Rap', subGenre: 'Hip-Hop' };
  assert.deepEqual(blendGuess(hipHop, rows, 'e'.repeat(64)), heard, 'the genre from the blend, the style from its nearest song');
  assert.equal(blendGuess(hipHop, [], 'e'.repeat(64)), null, 'the words alone never guess');
  const own = rows.map(item => ({ ...item, source_sha256: 'f'.repeat(64) }));
  assert.equal(blendGuess(hipHop, own, 'f'.repeat(64)), null, 'its own song is left out');

  const split = [row('a', 'hip-hop', 'Hip-Hop', toward(hipHop, 1), 'Hip-Hop & Rap'), row('b', 'pop music', 'Pop', toward(hipHop, 1), 'Pop')];
  assert.deepEqual(blendGuess(hipHop, split, 'e'.repeat(64)), heard, 'songs split evenly: the words settle it');
  assert.equal(blendGuess(lane('pop'), split, 'e'.repeat(64))?.genre, 'Pop');
  assert.ok(BLEND.words + (1 - BLEND.words) / 2 < BLEND.checkAt, 'though not surely enough to question a creator');
});

test('a creator\'s pick is questioned only when the brain is very sure it is another genre', () => {
  const hipHop = lane('hip-hop');
  const rows = ['a', 'b', 'c', 'd'].map((sha, i) => row(sha, 'hip-hop', 'Hip-Hop', toward(hipHop, i + 1), 'Hip-Hop & Rap'));
  const jazzPop = { style: 'jazz pop', genre: 'Jazz, Soul & Blues', subGenre: 'Smooth Jazz / Soul' };
  assert.deepEqual(checkPick(hipHop, rows, 'e'.repeat(64), jazzPop), { style: 'hip-hop', genre: 'Hip-Hop & Rap', subGenre: 'Hip-Hop' });
  assert.equal(checkPick(hipHop, rows, 'e'.repeat(64), { style: 'trap music', genre: 'Hip-Hop & Rap', subGenre: 'Trap' }), null, 'another style of the same genre is not questioned');
  const split = [...rows.slice(0, 2), ...['e', 'f'].map((sha, i) => row(sha, 'jazz pop', 'Smooth Jazz / Soul', toward(hipHop, i + 1), 'Jazz, Soul & Blues'))];
  assert.equal(checkPick(hipHop, split, '0'.repeat(64), jazzPop), null, 'songs of the pick\'s genre as near: not sure enough');
  assert.ok(blendGuess(hipHop, split, '0'.repeat(64)), 'though enough to guess for "I don\'t know"');
});

test('tempo only nudges: trap and drum and bass heard at half time, techno below 126 BPM, house above 132, a quiet slow clip', () => {
  const { nudge } = GUARDRAILS;
  const at = (bpm, energy = 0.4) => ({ bpm, energy });
  assert.equal(tempoNudge(at(70), { id: 'trap', subGenre: 'Trap' }), 0, '140 heard as 70');
  assert.equal(tempoNudge(at(100), { id: 'trap', subGenre: 'Trap' }), -nudge);
  assert.equal(tempoNudge(at(87), { id: 'drum-and-bass', subGenre: 'General Electronic' }), 0, '174 heard as 87');
  assert.equal(tempoNudge(at(120), { id: 'drum-and-bass', subGenre: 'General Electronic' }), -nudge);
  assert.equal(tempoNudge(at(118), { id: 'techno', subGenre: 'Techno' }), -nudge);
  assert.equal(tempoNudge(at(140), { id: 'techno', subGenre: 'Techno' }), 0);
  assert.equal(tempoNudge(at(140), { subGenre: 'Slap House' }), -nudge, 'a kept house song, at techno tempo');
  assert.equal(tempoNudge(at(122), { subGenre: 'House' }), 0);
  assert.equal(tempoNudge(at(80, 0.1), { id: 'lo-fi', subGenre: 'Boom Bap / Lo-Fi' }), nudge);
  assert.equal(tempoNudge(at(70, 0.5), { id: 'lo-fi', subGenre: 'Boom Bap / Lo-Fi' }), 0, 'loud half-time trap is never quiet');
  assert.equal(tempoNudge(at(120, 0.1), { id: 'ambient', subGenre: 'Ambient / Downtempo' }), 0);
  assert.equal(tempoNudge({ bpm: 80, energy: null }, { id: 'ambient', subGenre: 'Ambient / Downtempo' }), 0);
  assert.equal(tempoNudge(null, { id: 'techno', subGenre: 'Techno' }), 0);

  const previous = { ...process.env };
  try {
    Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5' });
    delete process.env.ENABLE_BPM_GUARDRAILS;
    assert.equal(guardrailsOn(), true, 'on for staging');
    process.env.ENABLE_BPM_GUARDRAILS = 'false';
    assert.equal(guardrailsOn(), false);
    process.env.SITE_ID = 'production';
    delete process.env.ENABLE_BPM_GUARDRAILS;
    assert.equal(guardrailsOn(), false, 'off elsewhere');
  } finally {
    for (const key of ['SITE_ID', 'ENABLE_BPM_GUARDRAILS']) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test('lo-fi and ambient are guessed by their words while no song of theirs is kept', () => {
  const loFi = lane('lo-fi');
  const rows = ['a', 'b', 'c'].map((sha, i) => row(sha, 'trap music', 'Trap', toward(loFi, 1, 0.1 * (i + 1)), 'Hip-Hop & Rap'));
  assert.deepEqual(blendGuess(loFi, rows, 'e'.repeat(64)), { style: 'lofi hip-hop', genre: 'Hip-Hop & Rap', subGenre: 'Boom Bap / Lo-Fi' });
  const kept = [...rows, row('d', 'lo-fi music', 'Boom Bap / Lo-Fi', toward(loFi, 1, 0.4), 'Hip-Hop & Rap')];
  assert.equal(blendGuess(loFi, kept, 'e'.repeat(64)).style, 'trap music', 'once one is kept, the nearest song names the style');
  const hipHop = lane('hip-hop');
  assert.equal(blendGuess(hipHop, rows.map(item => ({ ...item, print: toward(hipHop, 1) })), 'e'.repeat(64)).style, 'trap music', 'only for those two lanes');
});

test('house or techno: an electronic pick is questioned only with the guardrails on, and tempo tips an even split', () => {
  const techno = lane('techno');
  const rows = ['a', 'b', 'c', 'd'].map((sha, i) => row(sha, 'techno', 'Techno', toward(techno, 1, 0.1 * (i + 1)), 'Electronic & Dance (EDM)'));
  const house = { style: 'house music', genre: 'Electronic & Dance (EDM)', subGenre: 'House' };
  assert.equal(checkPick(techno, rows, 'e'.repeat(64), house), null, 'off: the same genre is never questioned');
  assert.deepEqual(checkPick(techno, rows, 'e'.repeat(64), house, { guardrails: true }), { style: 'techno', genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' });
  assert.equal(checkPick(techno, rows, 'e'.repeat(64), { ...house, style: 'techno', subGenre: 'Techno' }, { guardrails: true }), null);
  assert.equal(checkPick(techno, rows, 'e'.repeat(64), { ...house, style: 'synthwave', subGenre: 'Synthwave / Vaporwave' }, { guardrails: true }), null, 'only house against techno');

  const between = toward(lane('house'), 0, 0);
  const even = [row('a', 'techno', 'Techno', between, 'Electronic & Dance (EDM)'), row('b', 'house music', 'House', between, 'Electronic & Dance (EDM)')];
  const split = tempo => {
    const { songs, likeness } = genreChances(between, even, 'e'.repeat(64), BLEND, tempo);
    return houseOrTechno(songs, likeness, tempo);
  };
  assert.ok(split({ bpm: 140, energy: 0.4 }).techno > split(null).techno, 'at 140 BPM techno gains');
  assert.ok(split({ bpm: 118, energy: 0.4 }).techno < split(null).techno, 'below 126 it loses');
  assert.equal(houseOrTechno([], genreChances(between, [], 'e'.repeat(64)).likeness), null, 'the words alone never decide');
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
    const wav = silentWav(15_000);

    assert.equal((await send(printHandler, 'style-print', 'audio/wav', wav, 'wrong')).status, 401);
    assert.equal((await send(printHandler, 'style-print', 'audio/wav', wav.slice(0, 1000))).status, 400, 'only a clip at 48 kHz');
    assert.equal((await send(printHandler, 'style-print', 'audio/wav', silentWav(9_900))).status, 400, 'a clip is at least 10 s');
    assert.equal((await send(printHandler, 'style-print', 'audio/wav', new Uint8Array(wav.byteLength))).status, 400, 'a clip is WAV');
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
    assert.deepEqual(await (await ask(job)).json(), { status: 'waiting' });
    const rows = await db()`select style, source, status from style_print_candidates where source_sha256 = ${clip.sourceSha256}`;
    assert.deepEqual(rows.map(row => [row.style, row.source, row.status]), [['Amapiano', 'creator', 'waiting']]);
    assert.deepEqual(await db()`select 1 from style_prints where source_sha256 = ${clip.sourceSha256}`, [], 'nothing teaches the brain before the daily check');

    assert.equal((await send(printHandler, 'style-print', 'application/json', JSON.stringify({ version: 1, unknown: true }))).status, 204);
    const after = (await db()`select count from style_unknowns where day = current_date`)[0].count;
    assert.equal(after, before + 1);

    const tempo = { sourceSha256: clip.sourceSha256, offsetMs: 42_000, bpm: 140, energy: 0.18 };
    const sendTempo = value => send(printHandler, 'style-print', 'application/json', JSON.stringify({ version: 1, tempo: value }));
    for (const bad of [{ ...tempo, bpm: 0 }, { ...tempo, energy: 1.5 }, { ...tempo, bpm: null, energy: null }, { ...tempo, offsetMs: 1.5 }]) {
      assert.equal((await sendTempo(bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await sendTempo({ ...tempo, bpm: 70 })).status, 204);
    assert.equal((await sendTempo(tempo)).status, 204);
    const tempos = await db()`select bpm, energy from style_clip_tempos where source_sha256 = ${clip.sourceSha256}`;
    assert.deepEqual(tempos.map(item => [item.bpm, Math.round(item.energy * 100) / 100]), [[140, 0.18]], 'a clip keeps its latest reading');
  } finally {
    globalThis.fetch = realFetch;
    await db()`delete from style_prints where source_sha256 = ${clip.sourceSha256}`;
    await db()`delete from style_print_candidates where source_sha256 = ${clip.sourceSha256}`;
    await db()`delete from style_clip_tempos where source_sha256 = ${clip.sourceSha256}`;
    await db()`update style_unknowns set count = count - 1 where day = current_date and count > ${before}`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('"We think it sounds like…": the guess is made by the server, and only a yes leaves the print for the daily check', { skip: !READY, timeout: 60000 }, async () => {
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
    const kept = async () => (await db()`select style, source from style_print_candidates where source_sha256 = ${clip.sourceSha256}`).map(r => [r.style, r.source]);

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

    assert.deepEqual(await (await ask({ answer: 'yes', style: 'Amapiano', clip })).json(), { status: 'waiting' });
    assert.deepEqual(await kept(), [['Amapiano', 'confirmed']]);
    assert.equal(await answered('yes'), before.yes + 1);
  } finally {
    globalThis.fetch = realFetch;
    for (const sha of [clip.sourceSha256, ...seeds.map(seed => seed.sourceSha256)]) { await db()`delete from style_prints where source_sha256 = ${sha}`; await db()`delete from style_print_candidates where source_sha256 = ${sha}`; }
    for (const answer of ['yes', 'no']) {
      await db()`update style_guess_answers set count = count - 1 where day = current_date and style = 'Amapiano' and answer = ${answer} and count > ${before[answer]}`;
    }
    await db()`delete from style_guess_answers where count = 0`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('"Sounds more like techno": a house pick the server hears as techno at the clip\'s tempo is questioned on staging', { skip: !READY, timeout: 60000 }, async () => {
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', MUMOO_BRAIN_TESTER_KEY: 'a'.repeat(40), MUMOO_MUSIC_BRIDGE_SECRET: 'b'.repeat(40) });
  delete process.env.ENABLE_BPM_GUARDRAILS;
  const techno = lane('techno');
  const seeds = Array.from({ length: 5 }, () => label({ offsetMs: 0, source: 'seeded', style: 'Zz techno', genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' }));
  const picked = { style: 'Zz house', genre: 'Electronic & Dance (EDM)', subGenre: 'House' };
  const clip = { sourceSha256: randomBytes(32).toString('hex'), offsetMs: 30_000 };
  globalThis.fetch = async (url, init = {}) => String(url).includes('mumoo-sound-print-staging') ? Response.json(print({ values: techno })) : realFetch(url, init);
  try {
    for (const [i, seed] of seeds.entries()) await storePrint(seed, print({ values: toward(techno, 402, 0.1 * (i + 1)) }));
    await storeTempo({ ...clip, bpm: 140, energy: 0.4 });
    const { token } = await (await accessHandler(new Request(`${ORIGIN}/api/brain-tester-access`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }))).json();
    const ask = body => statusHandler(new Request(`${ORIGIN}/.netlify/functions/style-print-status`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-mumoo-brain-access': token }, body: JSON.stringify({ version: 1, id: 'fc-abcdefgh1234', ...body }),
    }));
    const heard = { style: 'Zz techno', genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' };
    assert.deepEqual(await (await ask({ guess: clip, picked })).json(), { status: 'guessed', guess: heard });
    assert.deepEqual(await (await ask({ answer: 'yes', style: 'Zz techno', clip, picked })).json(), { status: 'waiting' });
    const kept = await db()`select style, sub_genre, source from style_print_candidates where source_sha256 = ${clip.sourceSha256}`;
    assert.deepEqual(kept.map(r => [r.style, r.sub_genre, r.source]), [['Zz techno', 'Techno', 'corrected']]);
    process.env.ENABLE_BPM_GUARDRAILS = 'false';
    const other = { sourceSha256: randomBytes(32).toString('hex'), offsetMs: 30_000 };
    assert.deepEqual(await (await ask({ guess: other, picked })).json(), { status: 'guessed', guess: null }, 'with the guardrails off the pick is kept');
    await db()`delete from style_print_candidates where source_sha256 = ${other.sourceSha256}`;
  } finally {
    globalThis.fetch = realFetch;
    for (const sha of [clip, ...seeds].map(item => item.sourceSha256)) { await db()`delete from style_prints where source_sha256 = ${sha}`; await db()`delete from style_print_candidates where source_sha256 = ${sha}`; }
    await db()`delete from style_clip_tempos where source_sha256 = ${clip.sourceSha256}`;
    await db()`delete from style_check_answers where picked = 'Zz house'`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET', 'ENABLE_BPM_GUARDRAILS']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('"Sounds more like…": a pick the brain is sure of is kept at once; a questioned one is kept as the creator answers', { skip: !READY, timeout: 60000 }, async () => {
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', MUMOO_BRAIN_TESTER_KEY: 'a'.repeat(40), MUMOO_MUSIC_BRIDGE_SECRET: 'b'.repeat(40) });
  // Seven songs that sound exactly like the words for hip-hop, which no real song comes near.
  const hipHop = lane('hip-hop');
  const seeds = Array.from({ length: 7 }, () => label({ offsetMs: 0, source: 'seeded', style: 'Zz check', genre: 'Hip-Hop & Rap', subGenre: 'Zz sub' }));
  const picked = { style: 'Zz other', genre: 'Zz elsewhere', subGenre: 'Zz far' };
  const clips = [0, 1, 2, 3].map(() => ({ sourceSha256: randomBytes(32).toString('hex'), offsetMs: 30_000 }));
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes('mumoo-sound-print-staging')) return realFetch(url, init);
    return Response.json(print({ values: hipHop }));
  };
  const counted = async answer => (await db()`select coalesce(sum(count), 0)::int as count from style_check_answers where day = current_date and picked = 'Zz other' and answer = ${answer}`)[0].count;
  try {
    for (const [i, seed] of seeds.entries()) await storePrint(seed, print({ values: toward(hipHop, 401, 0.1 * (i + 1)) }));
    const { token } = await (await accessHandler(new Request(`${ORIGIN}/api/brain-tester-access`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }))).json();
    const ask = body => statusHandler(new Request(`${ORIGIN}/.netlify/functions/style-print-status`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-mumoo-brain-access': token }, body: JSON.stringify({ version: 1, id: 'fc-abcdefgh1234', ...body }),
    }));
    const kept = async clip => (await db()`select style, genre, source from style_print_candidates where source_sha256 = ${clip.sourceSha256}`).map(r => [r.style, r.genre, r.source]);
    const heard = { style: 'Zz check', genre: 'Hip-Hop & Rap', subGenre: 'Zz sub' };

    assert.equal((await ask({ guess: clips[0], picked: { ...picked, style: ' ' } })).status, 400);

    assert.deepEqual(await (await ask({ guess: clips[1], picked })).json(), { status: 'guessed', guess: heard });
    assert.deepEqual(await kept(clips[1]), [], 'a questioned pick waits for the answer');
    assert.equal((await ask({ answer: 'yes', style: 'Drill', clip: clips[1], picked })).status, 409);
    assert.deepEqual(await (await ask({ answer: 'yes', style: 'Zz check', clip: clips[1], picked })).json(), { status: 'waiting' });
    assert.deepEqual(await kept(clips[1]), [['Zz check', 'Hip-Hop & Rap', 'corrected']]);
    assert.deepEqual(await (await ask({ answer: 'no', style: 'Zz check', clip: clips[2], picked })).json(), { status: 'waiting' });
    assert.deepEqual(await kept(clips[2]), [['Zz other', 'Zz elsewhere', 'creator']], 'kept: the creator knows');
    assert.deepEqual(await (await ask({ answer: 'unsure', style: 'Zz check', clip: clips[3], picked })).json(), { status: 'counted' });
    assert.deepEqual(await kept(clips[3]), [], 'not sure teaches nothing');
    assert.deepEqual([await counted('switch'), await counted('keep'), await counted('unsure')], [1, 1, 1]);
    assert.deepEqual(await (await ask({ guess: clips[0], picked: { ...heard, style: 'Zz cousin' } })).json(), { status: 'guessed', guess: null });
    assert.deepEqual(await kept(clips[0]), [['Zz cousin', 'Hip-Hop & Rap', 'creator']], 'a pick of the genre it hears is kept straight away');
  } finally {
    globalThis.fetch = realFetch;
    for (const sha of [...clips, ...seeds].map(item => item.sourceSha256)) { await db()`delete from style_prints where source_sha256 = ${sha}`; await db()`delete from style_print_candidates where source_sha256 = ${sha}`; }
    await db()`delete from style_check_answers where picked = 'Zz other'`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
