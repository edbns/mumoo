import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { storageReady, putObject, objectSize } from '../netlify/lib/storage.mjs';
import { changeItem, itemArrived, libraryMedia, listApproved, listLibrary, removeItem, reserveItem } from '../netlify/lib/library.mjs';
import { TAG } from '../netlify/lib/library.mjs';
import libraryHandler from '../netlify/functions/library-approved.mjs';

const READY = storageReady() && Boolean(process.env.DATABASE_URL);

/* ---------- the brain's choice (no network) ---------- */

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, pick: await server.ssrLoadModule('/src/library-pick.ts'), pack: await server.ssrLoadModule('/src/creatives-pack.ts') };
}

const item = (id, over = {}) => ({ id, kind: 'photo', attitudes: ['tender'], tags: [], genre: null, subGenre: null, url: `https://x/${id}`, ...over });
const ids = list => list.map(entry => entry.id);

function profile(genre = 'Pop', subGenre, attitude = 'tender', sha = 'b'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' }, ...(subGenre ? { subGenre: { value: subGenre, source: 'creator' } } : {}) },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude, sadness: 1, intensity: 3 } },
  };
}

test('the attitude is the main match; neutral fits any song; a song with no feeling takes anything', async () => {
  const { server, pick } = await load();
  try {
    const items = [item('a', { attitudes: ['tender'] }), item('b', { attitudes: ['angry'] }), item('c', { attitudes: ['neutral'] })];
    const tender = { attitude: 'tender', genre: 'Pop', subGenre: '' };
    assert.deepEqual(ids(pick.pickLibrary(items, tender, 's', 0, 4)), ['a', 'c'], 'exact match first, neutral next, the wrong feeling never');
    assert.deepEqual(ids(pick.pickLibrary(items, { ...tender, attitude: 'neutral' }, 's', 0, 4)).sort(), ['a', 'b', 'c'], 'a neutral song takes anything');
    assert.deepEqual(ids(pick.pickLibrary(items, { ...tender, attitude: null }, 's', 0, 4)).sort(), ['a', 'b', 'c'], 'unread lyrics take anything');
  } finally { await server.close(); }
});

test('a genre is preferred when set, kept for its own genre, and an item with none is free for any', async () => {
  const { server, pick } = await load();
  try {
    const items = [
      item('free'),
      item('pop', { genre: 'Pop' }),
      item('indie', { genre: 'Pop', subGenre: 'Indie Pop' }),
      item('dance', { genre: 'Pop', subGenre: 'Dance-Pop' }),
      item('rock', { genre: 'Rock' }),
    ];
    const wanted = { attitude: 'tender', genre: 'Pop', subGenre: 'Indie Pop' };
    assert.deepEqual(ids(pick.pickLibrary(items, wanted, 's', 0, 4)), ['indie', 'pop', 'free'], 'sub-genre first, then genre, then free; other genres and sub-genres never');
    assert.deepEqual(ids(pick.pickLibrary(items, { ...wanted, genre: 'pop', subGenre: ' indie pop ' }, 's', 0, 4)), ['indie', 'pop', 'free'], 'case and spaces do not matter');
    assert.deepEqual(ids(pick.pickLibrary(items, { attitude: 'tender', genre: 'Jazz, Soul & Blues', subGenre: '' }, 's', 0, 4)), ['free'], 'only the free one fits another genre');
  } finally { await server.close(); }
});

test('the same song gets the same order; Refresh moves on to the next hand and wraps round', async () => {
  const { server, pick } = await load();
  try {
    const items = Array.from({ length: 6 }, (_, index) => item(`i${index}`));
    const wanted = { attitude: 'tender', genre: 'Pop', subGenre: '' };
    const hand = generation => ids(pick.pickLibrary(items, wanted, 'song', generation, 4));
    assert.deepEqual(hand(0), hand(0));
    assert.equal(new Set(hand(0)).size, 4);
    assert.notDeepEqual(hand(0), hand(1));
    assert.deepEqual(hand(0), hand(3), 'six items in hands of four come round after three hands');
    assert.deepEqual(ids(pick.pickLibrary(items.slice(0, 2), wanted, 'song', 5, 4)).sort(), ['i0', 'i1'], 'fewer fitting items than cards give fewer cards, the same each time');
    assert.deepEqual(pick.pickLibrary([], wanted, 'song', 0, 4), []);
  } finally { await server.close(); }
});

test('Our photography is dealt from the library, topped up with our baked effects; no library changes nothing', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop', 'Indie Pop');
    const none = pack.recommendRow('photography', person, 0, []);
    assert.equal(none.length, 4);
    assert.ok(none.every(slot => slot.effectId && !slot.libraryId));

    const library = [item('lib-1', { tags: ['sunset'] }), item('lib-2', { genre: 'Pop' }), item('lib-3', { genre: 'Rock' }), item('lib-4', { attitudes: ['angry'] })];
    const some = pack.recommendRow('photography', person, 0, [], null, library);
    assert.equal(some.length, 4);
    assert.deepEqual(some.filter(slot => slot.libraryId).map(slot => slot.libraryId).sort(), ['lib-1', 'lib-2'], 'only items that fit this song: not the other genre, not the other feeling');
    assert.equal(some.filter(slot => slot.effectId).length, 2, 'the rest are our baked effects');
    assert.equal(new Set(some.map(slot => slot.id)).size, 4);
    assert.equal(new Set(some.map(slot => slot.typeStyle)).size, 4, 'each card keeps its own lyric type');
    assert.ok(some.filter(slot => slot.libraryId).every(slot => slot.style === 'filter' && !slot.effectId && !slot.plateId));
    assert.deepEqual(some, pack.recommendRow('photography', person, 0, [], null, library), 'the same deal every time');

    const many = Array.from({ length: 6 }, (_, index) => item(`m${index}`));
    const full = pack.recommendRow('photography', person, 0, [], null, many);
    assert.equal(full.filter(slot => slot.libraryId).length, 4);
    assert.ok(full.every(slot => !slot.effectId));
    assert.notDeepEqual(full.map(slot => slot.libraryId), pack.recommendRow('photography', person, 1, [], null, many).map(slot => slot.libraryId), 'Refresh brings other pictures');

    for (const row of ['riso', 'spray', 'window', 'pulise', 'dust']) {
      assert.deepEqual(pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }], null, library), pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }]), `${row} does not use the library yet`);
    }
  } finally { await server.close(); }
});

/* ---------- the genre guidance ---------- */

test('every genre of the app is guided; every theme is a short, valid tag', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const guide = await server.ssrLoadModule('/src/genre-guide.ts');
    const { GENRES } = await server.ssrLoadModule('/src/genres.ts');
    const unguided = [];
    for (const group of GENRES) {
      for (const sub of group.subGenres) {
        const themes = guide.themesFor(group.name, sub);
        if (themes.length === 0) unguided.push(sub);
        assert.ok(themes.length <= 5, `${sub}: few themes, so the choice stays fast`);
        for (const theme of themes) {
          assert.ok(guide.THEME_TAGS.includes(theme), `${sub}: "${theme}" is not in the shared vocabulary`);
          assert.match(theme, TAG, `${theme} is not a tag the server would accept`);
        }
      }
    }
    assert.deepEqual(unguided, [], 'every sub-genre of the app has themes');
    assert.ok(guide.THEME_TAGS.length <= 40, 'the whole vocabulary fits in the tag list (40)');
    assert.equal(new Set(guide.THEME_TAGS).size, guide.THEME_TAGS.length);
    assert.deepEqual(guide.themesFor(' techno-nope', ''), []);
    assert.deepEqual(guide.themesFor('electronic & dance (edm)', ' techno '), guide.themesFor('Electronic & Dance (EDM)', 'Techno'), 'case and spaces do not matter');
    assert.deepEqual(guide.themesFor('Country & Folk', 'Modern Country'), guide.themesFor('Country & Folk', 'Americana / Folk'), 'a group described as a whole gives all its sub-genres the same themes');
  } finally { await server.close(); }
});

test('a genre theme in an item\'s tags is a small plus: it breaks a tie, but never beats a better attitude or genre, and never refuses', async () => {
  const { server, pick } = await load();
  try {
    const wanted = { attitude: 'tender', genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' };
    const items = [item('plain'), item('club', { tags: ['club'] }), item('both', { tags: ['club', 'dark', 'neon'] }), item('neutral-club', { attitudes: ['neutral'], tags: ['club', 'dark'] }), item('beach', { tags: ['beach'] })];
    const order = ids(pick.pickLibrary(items, wanted, 's', 0, 5));
    assert.equal(order[0], 'both', 'Techno: three themes count as two (the most a theme can add)');
    assert.ok(order.indexOf('club') < order.indexOf('plain'), 'one theme beats none');
    assert.ok(order.indexOf('neutral-club') > order.indexOf('beach'), 'the exact attitude still beats a neutral item with themes');
    assert.ok(order.includes('beach'), 'an off-theme tag is not a reason to refuse');
    const house = ids(pick.pickLibrary(items, { ...wanted, subGenre: 'House' }, 's', 0, 5));
    assert.deepEqual(new Set(house.slice(0, 2)), new Set(['club', 'both']), 'House likes club, and does not count dark or neon');
  } finally { await server.close(); }
});

/* ---------- the server (live storage and database) ---------- */

const jpeg = size => Uint8Array.from({ length: size }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 7);
const ADMIN = { email: 'moo@mumoo.app' };

/**
 * Stands in for our preparing worker, which a test cannot reach (as in uploads.test.mjs). It answers only for the items
 * this test made (`mine`): the real library shares this database, and a pretend worker must never touch the admin's own files.
 */
async function withWorker(mine, outcome, run) {
  const real = globalThis.fetch;
  const calls = { started: 0, asked: 0 };
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://edbns-mumoo-staging--mumoo-prepare-media-staging-submit')) {
      if (!mine.some(id => String(init?.body).includes(`library/${id}`))) return Promise.resolve(Response.json({ error: 'busy' }, { status: 503 }));
      calls.started++;
      return Promise.resolve(Response.json({ id: 'fc-LIBRARYJOB1' }));
    }
    if (url.startsWith('https://edbns-mumoo-staging--mumoo-prepare-media-staging-status')) {
      calls.asked++;
      const answer = outcome();
      return Promise.resolve(answer === 'running' ? Response.json({ status: 'running' }, { status: 202 }) : Response.json(answer));
    }
    return real(input, init);
  };
  try { await run(calls); } finally { globalThis.fetch = real; }
}

async function arrive(type, size, bytes) {
  const { id, putUrl } = await reserveItem(ADMIN, { type, bytes: size, rights: true });
  const sent = await fetch(putUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': type } });
  assert.equal(sent.status, 200);
  return id;
}

test('only approved, ready items reach the templates; a video waits for our worker', { skip: !READY, timeout: 90000 }, async () => {
  const made = [];
  try {
    await withWorker(made, () => 'running', async (calls) => {
      const photo = await arrive('image/jpeg', 2048, jpeg(2048));
      made.push(photo);
      const arrived = await itemArrived(photo);
      assert.equal(arrived.ready, true, 'a JPEG photo is ready at once');

      const video = await arrive('video/mp4', 3000, new Uint8Array(3000).fill(1));
      made.push(video);
      const first = await itemArrived(video);
      assert.equal(first.ready, false, 'a video is not ready until our worker has made its clip');
      assert.equal(calls.started, 1);

      const hidden = await arrive('image/jpeg', 1024, jpeg(1024));
      made.push(hidden);
      await itemArrived(hidden);

      for (const id of [photo, video]) assert.equal((await changeItem(id, { attitudes: ['tender'], status: 'approved', genre: 'Pop', subGenre: 'Indie Pop', tags: [] })).status, 'approved');

      let list = await listApproved();
      assert.deepEqual(list.filter(entry => made.includes(entry.id)).map(entry => entry.id), [photo], 'the pending photo and the unfinished video are not offered');
      const offered = list.find(entry => entry.id === photo);
      assert.deepEqual(Object.keys(offered).sort(), ['attitudes', 'genre', 'id', 'kind', 'subGenre', 'tags', 'url'], 'only what the brain needs: nothing about who cleared it or where it came from');
      assert.equal((await fetch(offered.url)).status, 200, 'its link works');
      assert.equal(await libraryMedia(video), null, 'a render cannot read an unfinished video');
      assert.equal(await libraryMedia(hidden), null, 'nor one that is not approved');
      assert.equal((await libraryMedia(photo)).photo.length, 2048);
      assert.ok(calls.asked >= 1, 'the worker was asked how it is getting on');
    });

    // The worker finishes: its files are in place and it says how many shots the clip has.
    await withWorker(made, () => ({ ok: true, bytes: { motion: 40, poster: 30 }, shots: [[0, 1200], [1200, 3000]] }), async () => {
      const video = made[1];
      await putObject(`library/${video}.mp4`, new Uint8Array(40).fill(2), 'video/mp4');
      await putObject(`library/${video}.poster.jpg`, jpeg(30), 'image/jpeg');
      const list = await listApproved();
      const offered = list.find(entry => entry.id === video);
      assert.ok(offered, 'once prepared and approved it is offered');
      assert.deepEqual(offered.shots, [[0, 1200], [1200, 3000]]);
      assert.equal((await fetch(offered.url)).status, 200, 'its poster');
      assert.equal((await fetch(offered.motionUrl)).status, 200, 'its clip');
      assert.equal((await libraryMedia(video)).motion.length, 40, 'a render reads the prepared clip, not the original');
      assert.equal((await listLibrary()).items.find(entry => entry.id === video).ready, true);
    });
  } finally {
    for (const id of made) await removeItem(id).catch(() => undefined);
  }
  for (const id of made) {
    assert.equal(await objectSize(`library/${id}`), null);
    assert.equal(await objectSize(`library/${id}.mp4`), null, 'every file made from it is removed too');
    assert.equal(await objectSize(`library/${id}.poster.jpg`), null);
  }
});

test('a video our worker cannot prepare says why and is never offered', { skip: !READY, timeout: 60000 }, async () => {
  const made = [];
  try {
    await withWorker(made, () => ({ ok: false, error: 'That video is longer than a minute.' }), async () => {
      const video = await arrive('video/mp4', 500, new Uint8Array(500).fill(1));
      made.push(video);
      await itemArrived(video);
      await changeItem(video, { attitudes: ['joyful'], status: 'approved' });
      const looked = (await listLibrary()).items.find(entry => entry.id === video);
      assert.equal(looked.ready, false);
      assert.equal(looked.problem, 'That video is longer than a minute.');
      assert.equal((await listApproved()).some(entry => entry.id === video), false);
    });
  } finally {
    for (const id of made) await removeItem(id).catch(() => undefined);
  }
});

test('a photo that is not a JPEG is not used, and says so', { skip: !READY, timeout: 60000 }, async () => {
  const id = await arrive('image/jpeg', 300, new Uint8Array(300).fill(9));
  try {
    const looked = await itemArrived(id);
    assert.equal(looked.ready, false);
    assert.match(looked.problem, /not a JPEG/);
    assert.match((await reserveItem(ADMIN, { type: 'image/png', bytes: 100, rights: true })).refused, /JPEG/, 'a PNG is turned away: the page sends photos as JPEG');
  } finally { await removeItem(id).catch(() => undefined); }
});

test('the public library answers GET only, and only with what is approved and ready', { skip: !READY, timeout: 60000 }, async () => {
  assert.equal((await libraryHandler(new Request('https://example.test/api/library', { method: 'POST' }))).status, 405);
  const id = await arrive('image/jpeg', 700, jpeg(700));
  try {
    await itemArrived(id);
    const before = await (await libraryHandler(new Request('https://example.test/api/library'))).json();
    assert.equal(before.items.some(entry => entry.id === id), false, 'a waiting photo is not offered');
    await changeItem(id, { attitudes: ['playful'], status: 'approved' });
    const response = await libraryHandler(new Request('https://example.test/api/library'));
    assert.equal(response.status, 200);
    const after = await response.json();
    const offered = after.items.find(entry => entry.id === id);
    assert.ok(offered && offered.kind === 'photo' && offered.attitudes[0] === 'playful');
    assert.equal(JSON.stringify(offered).includes('moo@mumoo.app'), false, 'who cleared it is not for everyone to see');
    await changeItem(id, { status: 'hidden' });
    assert.equal((await (await libraryHandler(new Request('https://example.test/api/library'))).json()).items.some(entry => entry.id === id), false, 'hiding takes it out at once');
  } finally {
    await removeItem(id).catch(() => undefined);
  }
});

test('the video worker keeps the first frame for its scene detector, so a video of one shot is not refused', () => {
  const worker = readFileSync(new URL('../../audio-intelligence/modal_prepare_media_staging.py', import.meta.url), 'utf8');
  // A single-shot video has no scene change; with no frame reaching the detector's output, ffmpeg exits with an error and the video is marked unreadable.
  assert.match(worker, /select='gt\(scene,\{SCENE_THRESHOLD\}\)\+eq\(n,0\)'/);
});
