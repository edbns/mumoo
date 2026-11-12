import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { storeFeedback, validFeedback } from '../netlify/lib/feedback.mjs';
import { db } from '../netlify/lib/person.mjs';
import feedbackHandler from '../netlify/functions/pack-feedback.mjs';
import accessHandler from '../netlify/functions/brain-tester-access.mjs';

const READY = Boolean(process.env.DATABASE_URL);

const card = (over = {}) => ({
  version: 1, event: 'download', clipSha256: randomBytes(32).toString('hex'), primaryGenre: 'Latin & Urbano', subGenre: 'Reggaeton',
  vibe: 'Dark/Cinematic', lane: 'dark', language: 'es', lyricsOrigin: 'typed', lyricAttitude: 'confident', lyricSadness: 1, lyricIntensity: 4,
  row: 'photography', slot: { id: 'ad-photography-x', style: 'filter', font: 'Anton', fontSecondary: 'Inter', typeStyle: 'punch', libraryId: randomUUID(), look: 'thermal' },
  ownPicture: false, generation: 2, ...over,
});

test('a body is accepted only when the brain understands it', () => {
  assert.equal(validFeedback(card()), true);
  assert.equal(validFeedback(card({ event: 'play' })), true);
  assert.equal(validFeedback({ ...card({ event: 'refresh' }), slot: undefined }), true, 'a refresh is about a row, not a card');
  assert.equal(validFeedback({ ...card({ event: 'refresh' }), slot: undefined, row: undefined }), false, 'a refresh must say which row');
  assert.equal(validFeedback({ ...card(), slot: undefined }), false, 'a download must say which card');
  for (const bad of [null, {}, card({ version: 2 }), card({ event: 'sell' }), card({ clipSha256: 'nope' }), card({ lyricSadness: 4 }), card({ lyricAttitude: 'Not A Code!' }),
    card({ ownPicture: 'yes' }), card({ generation: -1 }), card({ primaryGenre: ' ' }), card({ slot: { ...card().slot, libraryId: 'x'.repeat(40) } }), card({ row: 'x'.repeat(30) }), card({ slot: { ...card().slot, look: 'x'.repeat(41) } })]) {
    assert.equal(validFeedback(bad), false, JSON.stringify(bad)?.slice(0, 80));
  }
  // The words themselves have no place in it: only these fields are ever read.
  const keys = Object.keys(card());
  assert.ok(!keys.some(key => /lyric(s)?$|words|text/i.test(key)), 'no field can carry the lyrics');
});

test('the fuller telling: the whole reel and its seed, the watch, the delivery, and the song\'s moods, themes, drive and key', () => {
  const reel = { ...card().slot, reelIds: [randomUUID(), randomUUID(), randomUUID()], cutSeed: 41 };
  const fuller = card({ slot: reel, lyricMoods: ['fun', 'love'], lyricThemes: ['party', 'romance', 'nightlife'], drive: 0.77, mode: 'minor' });
  assert.equal(validFeedback(fuller), true);
  assert.equal(validFeedback(card({ drive: null, mode: null })), true, 'an older analysis has neither');
  assert.equal(validFeedback(card({ event: 'watch', watchMs: 4200 })), true);
  assert.equal(validFeedback({ version: 1, event: 'delivered', clipSha256: card().clipSha256, slotIds: ['ad-photography-x', 'ad-riso-y'] }), true, 'a delivery names only the song and its cards');
  for (const bad of [
    card({ event: 'watch' }), card({ event: 'watch', watchMs: 0 }), card({ event: 'watch', watchMs: 600_001 }), card({ event: 'watch', watchMs: 1.5 }),
    card({ watchMs: 4200 }),
    card({ slot: { ...reel, reelIds: [randomUUID()] } }), card({ slot: { ...reel, reelIds: Array.from({ length: 9 }, randomUUID) } }), card({ slot: { ...reel, reelIds: ['x', 'y'] } }),
    card({ slot: { ...reel, cutSeed: -1 } }), card({ slot: { ...reel, cutSeed: 1_000_000 } }),
    card({ lyricMoods: ['fun', 'love', 'sad'] }), card({ lyricThemes: ['Party'] }), card({ lyricThemes: ['the whole chorus goes here'] }),
    card({ drive: 1.2 }), card({ mode: 'dorian' }),
    { version: 1, event: 'delivered', clipSha256: card().clipSha256, slotIds: [] },
    { version: 1, event: 'delivered', clipSha256: card().clipSha256, slotIds: Array.from({ length: 21 }, (_, i) => `s${i}`) },
    { version: 1, event: 'delivered', clipSha256: 'nope', slotIds: ['s'] },
  ]) {
    assert.equal(validFeedback(bad), false, JSON.stringify(bad)?.slice(0, 120));
  }
});

async function withPerson(run) {
  const sql = db();
  const userId = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email) values (${userId}, ${`${userId}@example.com`})`;
  try { await run(sql, userId); } finally {
    await sql`delete from app_users where id = ${userId}`;
  }
}

test('actions are kept; a signed-in person\'s downloads are numbered, and deleting the account forgets whose they were', { skip: !READY, timeout: 60000 }, () => withPerson(async (sql, userId) => {
  const first = card();
  const sha = first.clipSha256;
  assert.equal(await storeFeedback(first, userId), true);
  assert.equal(await storeFeedback({ ...card({ clipSha256: sha }), event: 'select' }, userId), true);
  assert.equal(await storeFeedback(card({ clipSha256: sha }), userId), true);
  assert.equal(await storeFeedback({ ...card({ event: 'refresh', clipSha256: sha }), slot: undefined }, userId), true);
  assert.equal(await storeFeedback(card({ clipSha256: sha }), null), true, 'nobody signed in: kept, but not against anyone');

  const rows = await sql`select * from brain_feedback where clip_sha256 = ${sha} order by id`;
  assert.deepEqual(rows.map(row => row.event), ['download', 'select', 'download', 'refresh', 'download']);
  assert.deepEqual(rows.map(row => row.nth_download), [1, null, 2, null, null], 'their first download is 1 (the free one), the next 2');
  assert.equal(rows[4].user_id, null);
  const [kept] = rows;
  assert.equal(kept.genre, 'Latin & Urbano');
  assert.equal(kept.sub_genre, 'Reggaeton');
  assert.equal(kept.attitude, 'confident');
  assert.equal(kept.sadness, 1);
  assert.equal(kept.row_id, 'photography');
  assert.equal(kept.library_id, first.slot.libraryId);
  assert.equal(kept.look, 'thermal');
  assert.equal(kept.own_picture, false);
  assert.equal(rows[3].slot_id, null, 'a refresh has no card');
  assert.equal(rows[3].generation, 2);

  await sql`delete from app_users where id = ${userId}`;
  const after = await sql`select user_id from brain_feedback where clip_sha256 = ${sha}`;
  await sql`delete from brain_feedback where clip_sha256 = ${sha}`;
  assert.equal(after.length, 5, 'what was learned stays');
  assert.ok(after.every(row => row.user_id === null), 'but whose it was is forgotten');
}));

test('a watch keeps its time; a delivery is told as each card\'s own download, with its reel, seed and song', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const reelIds = [randomUUID(), randomUUID()];
  const pressed = card({ slot: { ...card().slot, id: 'ad-photography-reel', reelIds, cutSeed: 41 }, lyricMoods: ['fun'], lyricThemes: ['party'], drive: 0.7, mode: 'minor' });
  const sha = pressed.clipSha256;
  try {
    assert.equal(await storeFeedback(card({ event: 'watch', watchMs: 4200, clipSha256: sha }), null), true);
    assert.equal(await storeFeedback(pressed, null), true);
    assert.equal(await storeFeedback({ version: 1, event: 'delivered', clipSha256: sha, slotIds: ['ad-photography-reel', 'never-pressed'] }, null), true);
    const rows = await sql`select * from brain_feedback where clip_sha256 = ${sha} order by id`;
    assert.deepEqual(rows.map(row => row.event), ['watch', 'download', 'delivered'], 'a card that was never pressed is not delivered');
    assert.equal(rows[0].watch_ms, 4200);
    const delivered = rows[2];
    assert.deepEqual(delivered.reel_ids, reelIds);
    assert.equal(delivered.cut_seed, 41);
    assert.equal(delivered.genre, 'Latin & Urbano');
    assert.deepEqual(delivered.lyric_themes, ['party']);
    assert.equal(delivered.mode, 'minor');
  } finally { await sql`delete from brain_feedback where clip_sha256 = ${sha}`; }
});

test('the endpoint keeps what a tester sends and refuses the rest', { skip: !READY, timeout: 60000 }, async () => {
  const previous = { ...process.env };
  process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
  process.env.MUMOO_BRAIN_TESTER_KEY = 'a'.repeat(40);
  const origin = 'https://mumoo-staging.netlify.app';
  const body = card({ event: 'play' });
  try {
    const { token } = await (await accessHandler(new Request(`${origin}/api/brain-tester-access`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' }))).json();
    const post = (payload, access = token) => feedbackHandler(new Request(`${origin}/api/pack-feedback`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-mumoo-brain-access': access }, body: JSON.stringify(payload),
    }));
    assert.equal((await post(body)).status, 204);
    const rows = await db()`select event, user_id, lane from brain_feedback where clip_sha256 = ${body.clipSha256}`;
    assert.deepEqual(rows.map(row => [row.event, row.user_id, row.lane]), [['play', null, 'dark']], 'kept, and against nobody without a sign-in');
    assert.equal((await post(card({ lyricSadness: 9 }))).status, 400);
    assert.equal((await post(body, 'wrong')).status, 401);
    assert.equal((await db()`select count(*)::int as n from brain_feedback where clip_sha256 = ${body.clipSha256}`)[0].n, 1, 'a refused body is not kept');
  } finally {
    await db()`delete from brain_feedback where clip_sha256 = ${body.clipSha256}`;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
