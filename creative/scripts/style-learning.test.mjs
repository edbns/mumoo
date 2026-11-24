import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import ANCHORS from '../netlify/lib/genre-anchors.mjs';
import { db } from '../netlify/lib/person.mjs';
import { LEARNING, agreed, batchTest, judge, promote, submitLabel, testClips, voterOf } from '../netlify/lib/style-learning.mjs';
import { storePrint } from '../netlify/lib/style-prints.mjs';

const READY = Boolean(process.env.DATABASE_URL);
const HIP_HOP = 'Hip-Hop & Rap';
const lane = id => ANCHORS.lanes.find(item => item.id === id).vector;
/** A unit print a little off `vector` along `axis`. */
const toward = (vector, axis, by = 0.05) => {
  const values = [...vector];
  values[axis] += by;
  const length = Math.hypot(...values);
  return values.map(x => x / length);
};
const sha = () => randomBytes(32).toString('hex');
const kept = (genre, print, over = {}) => ({ source_sha256: sha(), offset_ms: 0, style: genre, genre, sub_genre: genre, print, licensed: false, ...over });
let ids = 0;
const answer = (genre, print, over = {}) => ({
  id: (ids += 1), created_at: new Date().toISOString(), source_sha256: sha(), offset_ms: 30_000, style: genre, genre, sub_genre: genre,
  source: 'creator', voter: null, model: 'test', print, ...over,
});
const vote = (item, voter, genre = item.genre) => ({ source_sha256: item.source_sha256, voter, genre, created_at: item.created_at });
const hipHopSongs = n => Array.from({ length: n }, (_, i) => kept(HIP_HOP, toward(lane('hip-hop'), 100 + i)));
const decided = (result, item) => result.decisions.find(d => d.item.id === item.id);

test('an account is one voice per song, and its code differs on every song', () => {
  const key = 'k'.repeat(40);
  const [a, b] = [sha(), sha()];
  assert.equal(voterOf({ id: 'person-1' }, a, key), voterOf({ id: 'person-1' }, a, key));
  assert.notEqual(voterOf({ id: 'person-1' }, a, key), voterOf({ id: 'person-1' }, b, key), 'no code follows an account across songs');
  assert.notEqual(voterOf({ id: 'person-1' }, a, key), voterOf({ id: 'person-2' }, a, key));
  assert.equal(voterOf(null, a, key), null, 'signed out: no voice');
  assert.equal(voterOf({ id: 'person-1' }, a, 'short'), null);

  const voices = genre => new Map(Object.entries(genre));
  assert.equal(agreed(voices({ a: 'Pop', b: 'Pop', c: 'Pop' }), 'Pop'), true);
  assert.equal(agreed(voices({ a: 'Pop', b: 'Pop' }), 'Pop'), false, `fewer than ${LEARNING.agree} accounts`);
  assert.equal(agreed(voices({ a: 'Pop', b: 'Pop', c: 'Pop', d: 'Rock', e: 'Rock' }), 'Pop'), false, 'not most of those who answered');
  assert.equal(agreed(undefined, 'Pop'), false);
});

test('the brain learns an answer it already hears, or one several accounts agree on that sounds like it could be', () => {
  const trusted = hipHopSongs(5);
  const hears = answer(HIP_HOP, toward(lane('hip-hop'), 300));
  const reggae = answer('Reggae & Dancehall', toward(lane('reggae'), 301));
  const others = [1, 2].map(n => ({ ...reggae, id: reggae.id + 1000 * n, voter: `v${n}` }));
  const nowhere = answer('Zz nowhere', toward(lane('reggae'), 302));
  const result = judge({
    trusted, waiting: [hears, { ...reggae, voter: 'v0' }, ...others, nowhere],
    votes: [vote(reggae, 'v0'), vote(reggae, 'v1'), vote(reggae, 'v2'), ...['v0', 'v1', 'v2'].map(v => vote(nowhere, v))],
  });
  assert.deepEqual(decided(result, hears), { item: hears, status: 'accepted', reason: 'the brain hears it', keep: true });
  const reggaes = [reggae, ...others].map(item => decided(result, item));
  assert.equal(reggaes.filter(d => d.keep).length, 1, 'one answer per clip goes in');
  assert.equal(reggaes.find(d => d.keep).reason, 'accounts agree');
  assert.deepEqual(reggaes.filter(d => !d.keep).map(d => d.reason), ['same as another answer', 'same as another answer']);
  assert.equal(decided(result, nowhere).status, 'held');
  assert.equal(decided(result, nowhere).reason, 'does not sound like it', 'agreement alone is not enough');
});

test('one account answering many times, or a lone answer the brain does not hear, teaches nothing', () => {
  const trusted = hipHopSongs(5);
  const lone = answer('Pop', toward(lane('hip-hop'), 300), { voter: 'v0' });
  const old = answer('Pop', toward(lane('hip-hop'), 301), { created_at: new Date(Date.now() - (LEARNING.expireDays + 1) * 86_400_000).toISOString() });
  const result = judge({ trusted, waiting: [lone, old], votes: Array.from({ length: 5 }, () => vote(lone, 'v0')) });
  assert.equal(decided(result, lone), undefined, 'still waiting for others');
  assert.deepEqual([decided(result, old).status, decided(result, old).reason], ['rejected', 'never confirmed']);
});

test('a kept answer is never replaced: a different genre for the song is held for a person', () => {
  const trusted = hipHopSongs(5);
  const song = trusted[0];
  const same = answer(HIP_HOP, song.print, { source_sha256: song.source_sha256, offset_ms: 0 });
  const clash = answer('Pop', song.print, { source_sha256: song.source_sha256, offset_ms: 0 });
  const otherClip = answer('Pop', song.print, { source_sha256: song.source_sha256, offset_ms: 60_000 });
  const result = judge({ trusted, waiting: [same, clash, otherClip], votes: [] });
  assert.deepEqual([decided(result, same).status, decided(result, same).keep], ['accepted', false]);
  assert.deepEqual([decided(result, clash).status, decided(result, clash).reason], ['held', 'differs from the kept answer']);
  assert.deepEqual([decided(result, otherClip).status, decided(result, otherClip).reason], ['held', 'differs from the kept answer']);
});

test('fake answers that would make the brain wrong on songs it knows are held, even when accounts agree on them', () => {
  const trusted = hipHopSongs(3);
  const clips = testClips(trusted);
  assert.ok(clips.every(clip => clip.now === 'right'), 'it knows these songs');
  // A ring of accounts calls six hip-hop songs pop: each song alone does no harm, together they would.
  const fakes = Array.from({ length: 6 }, (_, i) => answer('Pop', toward(lane('hip-hop'), 200 + i, 0.03)));
  const votes = fakes.flatMap(item => ['r1', 'r2', 'r3'].map(v => vote(item, v)));
  assert.equal(batchTest(clips, trusted, fakes.slice(0, 1)).harmless, true);
  const together = batchTest(clips, trusted, fakes);
  assert.equal(together.harmless, false);
  assert.ok(together.after.right < together.before.right);

  const result = judge({ trusted, waiting: fakes.map((item, i) => ({ ...item, voter: `r${(i % 3) + 1}` })), votes });
  assert.ok(result.decisions.every(d => d.status === 'held' && !d.keep), 'none of them teaches the brain');
  assert.match(result.decisions[0].reason, /made the brain worse on known songs/);
});

test('answers wait in their own table, one per account and song, and the daily check lets the right ones in', { skip: !READY, timeout: 120000 }, async () => {
  // Drill, not hip-hop: the endpoint tests seed songs along the hip-hop words at the same time.
  const hipHop = lane('drill');
  const seeds = Array.from({ length: 7 }, () => ({ sourceSha256: sha(), offsetMs: 0, style: 'Zz learn', genre: HIP_HOP, subGenre: 'Zz sub', source: 'seeded' }));
  const heard = { sourceSha256: sha(), offsetMs: 30_000, style: 'Zz learn', genre: HIP_HOP, subGenre: 'Zz sub', source: 'creator' };
  const wrong = { ...heard, sourceSha256: sha(), style: 'Zz wrong', genre: 'Zz nowhere', subGenre: 'Zz far' };
  const print = values => ({ model: 'laion-clap music_audioset_epoch_15_esc_90.14', values });
  const key = 'k'.repeat(40);
  const shas = [...seeds.map(s => s.sourceSha256), heard.sourceSha256, wrong.sourceSha256];
  try {
    for (const [i, seed] of seeds.entries()) await storePrint(seed, print(toward(hipHop, 401, 0.1 * (i + 1))));
    const voter = voterOf({ id: 'zz-person' }, heard.sourceSha256, key);
    await submitLabel({ ...heard, style: 'Zz first' }, print(toward(hipHop, 402)), voter);
    await submitLabel(heard, print(toward(hipHop, 402)), voter);
    await submitLabel(wrong, print(toward(hipHop, 403)));
    await submitLabel(wrong, print(toward(hipHop, 403)));
    const waiting = await db()`select style, status from style_print_candidates where source_sha256 = any(${shas}) order by style`;
    assert.deepEqual(waiting.map(r => [r.style, r.status]), [['Zz learn', 'waiting'], ['Zz wrong', 'waiting']], 'an account\'s later answer replaces its own');

    const dry = await promote({ only: shas });
    assert.equal(dry.learned, 1);
    assert.deepEqual(await db()`select 1 from style_prints where source_sha256 = ${heard.sourceSha256}`, [], 'a dry run changes nothing');

    const run = await promote({ write: true, only: shas });
    assert.equal(run.learned, 1);
    const learned = await db()`select style, source from style_prints where source_sha256 = ${heard.sourceSha256}`;
    assert.deepEqual(learned.map(r => [r.style, r.source]), [['Zz learn', 'creator']]);
    const after = await db()`select style, status, reason from style_print_candidates where source_sha256 = any(${shas}) order by style`;
    assert.deepEqual(after.map(r => [r.style, r.status, r.reason]), [['Zz learn', 'accepted', 'the brain hears it'], ['Zz wrong', 'waiting', null]]);
    assert.deepEqual(await db()`select 1 from style_prints where source_sha256 = ${wrong.sourceSha256}`, []);

    await submitLabel({ ...heard, style: 'Zz later' }, print(toward(hipHop, 402)), voter);
    assert.deepEqual((await db()`select style from style_print_candidates where source_sha256 = ${heard.sourceSha256}`).map(r => r.style), ['Zz learn'], 'a decided answer is not changed');
  } finally {
    for (const item of shas) {
      await db()`delete from style_prints where source_sha256 = ${item}`;
      await db()`delete from style_print_candidates where source_sha256 = ${item}`;
    }
  }
});
