import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { storageReady, putObject, objectSize } from '../netlify/lib/storage.mjs';
import { changeItem, itemArrived, libraryMedia, listApproved, listLibrary, removeItem, reserveItem } from '../netlify/lib/library.mjs';
import { TAG, jpegSize, resolutionWarning } from '../netlify/lib/library.mjs';
import libraryHandler from '../netlify/functions/library-approved.mjs';

const READY = storageReady() && Boolean(process.env.DATABASE_URL);

/* ---------- the brain's choice (no network) ---------- */

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, pick: await server.ssrLoadModule('/src/library-pick.ts'), pack: await server.ssrLoadModule('/src/creatives-pack.ts'), look: await server.ssrLoadModule('/src/window-look.ts') };
}

const item = (id, over = {}) => ({ id, kind: 'photo', attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${id}`, ...over });
const ids = list => list.map(entry => entry.id);

function profile(genre = 'Pop', subGenre, attitude = 'love', sha = 'b'.repeat(64)) {
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

test('a picture fits by what its tags show, never by a mood of its own: a confident House song wants the cars and the club', async () => {
  const { server, pick } = await load();
  try {
    const wanted = { attitude: 'confident', genre: 'Electronic & Dance (EDM)', subGenre: 'House' };
    const items = [
      item('car', { attitudes: [], tags: ['car', 'luxury'] }),
      item('club', { attitudes: [], tags: ['club', 'girls'] }),
      item('beach', { attitudes: [], tags: ['beach'] }),
      item('plain', { attitudes: [], tags: [] }),
    ];
    const fit = id => pick.libraryFit(items.find(entry => entry.id === id), wanted);
    assert.ok(fit('car') > 0 && fit('club') > 0, 'money and cars for the feeling, the club for the genre');
    assert.equal(fit('beach'), 0);
    assert.equal(fit('plain'), 0);
    assert.equal(pick.libraryFit(item('sad-car', { attitudes: ['sad'], tags: ['car', 'luxury'] }), wanted), fit('car'), 'a mood written on an older item is not read');
    assert.deepEqual(new Set(ids(pick.pickLibrary(items, wanted, 's', 0, 2))), new Set(['car', 'club']), 'with enough that show something wanted, only they are dealt');
    assert.deepEqual(ids(pick.pickLibrary(items, wanted, 's', 0, 4)).slice(2).sort(), ['beach', 'plain'], 'the others only fill a short hand');
    const nothing = { attitude: null, genre: 'Nope', subGenre: '' };
    assert.deepEqual(ids(pick.pickLibrary(items, nothing, 's', 0, 4)).sort(), ['beach', 'car', 'club', 'plain'], 'a song the brain knows nothing about takes anything');
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
    const wanted = { attitude: 'love', genre: 'Pop', subGenre: 'Indie Pop' };
    assert.deepEqual(ids(pick.pickLibrary(items, wanted, 's', 0, 4)), ['indie', 'pop', 'free'], 'sub-genre first, then genre, then free; other genres and sub-genres never');
    assert.deepEqual(ids(pick.pickLibrary(items, { ...wanted, genre: 'pop', subGenre: ' indie pop ' }, 's', 0, 4)), ['indie', 'pop', 'free'], 'case and spaces do not matter');
    assert.deepEqual(ids(pick.pickLibrary(items, { attitude: 'love', genre: 'Jazz, Soul & Blues', subGenre: '' }, 's', 0, 4)), ['free'], 'only the free one fits another genre');
  } finally { await server.close(); }
});

test('the same song gets the same order; Refresh moves on to the next hand and wraps round', async () => {
  const { server, pick } = await load();
  try {
    const items = Array.from({ length: 6 }, (_, index) => item(`i${index}`));
    const wanted = { attitude: 'love', genre: 'Pop', subGenre: '' };
    const hand = generation => ids(pick.pickLibrary(items, wanted, 'song', generation, 4));
    assert.deepEqual(hand(0), hand(0));
    assert.equal(new Set(hand(0)).size, 4);
    assert.notDeepEqual(hand(0), hand(1));
    assert.deepEqual(hand(0), hand(3), 'six items in hands of four come round after three hands');
    assert.deepEqual(ids(pick.pickLibrary(items.slice(0, 2), wanted, 'song', 5, 4)).sort(), ['i0', 'i1'], 'fewer fitting items than cards give fewer cards, the same each time');
    assert.deepEqual(pick.pickLibrary([], wanted, 'song', 0, 4), []);
  } finally { await server.close(); }
});

test('Dust is dealt from library cut-out photos; Riso from those or library clips; both fall back to our approved photos', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop', 'Indie Pop');
    const plates = [{ id: 'burnnet-woman-1547507-1920', cutout: true }];
    const cut = id => item(id, { cutoutUrl: `https://x/${id}.cut.png` });
    const clip = id => ({ ...item(id), kind: 'video', motionUrl: `https://x/${id}.mp4`, shots: [[0, 1000]] });
    const library = [cut('p1'), cut('p2'), item('uncut'), clip('clip')];

    const dust = pack.recommendRow('dust', person, 0, plates, null, library);
    assert.equal(dust.length, 4);
    assert.ok(dust.every(slot => ['p1', 'p2'].includes(slot.libraryId) && !slot.plateId), 'Dust: only photos with a cut-out, never a video or an uncut photo');
    assert.equal(new Set(dust.map(slot => slot.libraryId)).size, 2, 'Dust: both photos are used');

    const riso = pack.recommendRow('riso', person, 0, plates, null, library);
    assert.equal(riso.length, 4);
    assert.ok(riso.every(slot => ['p1', 'p2', 'clip'].includes(slot.libraryId) && !slot.plateId), 'Riso: cut-out photos or clips, never an uncut photo');
    assert.ok(riso.some(slot => slot.libraryId === 'clip'), 'Riso deals a library video when one fits');
    assert.ok(riso.every(slot => slot.cutSeed !== undefined), 'Riso cuts each card’s clip differently');
    assert.notDeepEqual(riso.map(slot => slot.libraryId), pack.recommendRow('riso', person, 1, plates, null, library).map(slot => slot.libraryId), 'Riso: Refresh deals them again');

    const clipsOnly = pack.recommendRow('riso', person, 0, plates, null, [clip('c1'), clip('c2'), item('uncut')]);
    assert.ok(clipsOnly.every(slot => (slot.reelIds ?? [slot.libraryId]).every(id => ['c1', 'c2'].includes(id)) && !slot.plateId), 'Riso with only library clips does not fall back to plates');
    assert.ok(clipsOnly.every(slot => slot.reelIds?.length === 2), 'Riso edits two or more library clips into a reel');

    for (const row of ['riso', 'dust']) {
      const none = pack.recommendRow(row, person, 0, plates, null, [item('uncut')]);
      assert.ok(none.every(slot => slot.plateId === 'burnnet-woman-1547507-1920' && !slot.libraryId), `${row}: with nothing usable in the library it uses our approved photo`);
      assert.ok(pack.recommendRow(row, person, 0, [], null, []).every(slot => !slot.plateId && !slot.libraryId), `${row}: with no photo at all the card waits for the person's own`);
    }
  } finally { await server.close(); }
});

test('Window is dealt from library pictures: a photo with a cut-out, or a clip; never a baked effect or background beside them', async () => {
  const { server, pack, look } = await load();
  try {
    const person = profile('Pop', 'Indie Pop');
    const ids = look.WINDOW_PALETTE_IDS;
    const reading = { plain: ids.slice(0, 4), person: ids.slice(1, 5) };
    const photo = id => item(id, { cutoutUrl: `https://x/${id}.cut.png` });
    const clip = id => ({ ...item(id), kind: 'video', motionUrl: `https://x/${id}.mp4`, shots: [[0, 1000]] });
    const library = [photo('p1'), photo('p2'), clip('c1'), clip('c2'), item('uncut')];
    const hand = pack.windowHand(person, 0, library);
    assert.ok(hand.length === 4 && hand.every(entry => entry.id !== 'uncut'), 'a photo with no cut-out is not a Window picture');
    const readings = Object.fromEntries(hand.map(entry => [entry.id, entry.kind === 'photo' ? reading : { plain: reading.plain, person: null }]));
    const cards = pack.recommendRow('window', person, 0, [], null, library, readings);
    assert.equal(cards.length, 4);
    assert.ok(cards.every(card => card.libraryId && hand.some(entry => entry.id === card.libraryId) && !card.effectId && !card.bankId && !card.plateId), 'every card is a library picture');
    assert.ok(cards.every(card => (card.windowMode === 'person' ? readings[card.libraryId].person : true) && card.windowAllowed.includes(card.windowPalette)));
    const clipCards = cards.filter(card => hand.find(entry => entry.id === card.libraryId).kind !== 'photo');
    assert.ok(clipCards.every(card => card.windowMode === 'plain' && card.cutSeed !== undefined), 'a clip is seen plain, and cut differently for each card');
    assert.deepEqual(cards, pack.recommendRow('window', person, 0, [], null, library, readings), 'the same deal every time');
    // Nothing read yet, or no library: the baked pictures stand in (the page waits for the readings before it asks).
    assert.ok(pack.recommendRow('window', person, 0, [], null, library, {}).every(card => !card.libraryId));
    assert.ok(pack.recommendRow('window', person, 0, [], null, [], {}).every(card => !card.libraryId));
    // The person's own picture replaces the library.
    assert.ok(pack.recommendRow('window', person, 0, [], { reading, clip: false }, library, readings).every(card => !card.libraryId));
  } finally { await server.close(); }
});

test('Our photography is dealt from the library only; baked effects stand in just when nothing in the library fits', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop', 'Indie Pop');
    const none = pack.recommendRow('photography', person, 0, []);
    assert.equal(none.length, 4);
    assert.ok(none.every(slot => slot.effectId && !slot.libraryId));

    const library = [item('lib-1', { tags: ['sunset'] }), item('lib-2', { genre: 'Pop' }), item('lib-3', { genre: 'Rock' }), item('lib-4', { attitudes: ['angry'] })];
    const some = pack.recommendRow('photography', person, 0, [], null, library);
    assert.equal(some.length, 3, 'the pictures that fit, then the nearest other to fill the hand, and no baked filler');
    // Two or more pictures are edited into a reel (the Director); each card opens on a different one.
    assert.ok(some.every(slot => slot.reelIds?.length === 3 && !slot.libraryId), 'three pictures: every card is a reel of them');
    assert.deepEqual([...some.map(slot => slot.reelIds[0])].sort(), ['lib-1', 'lib-2', 'lib-4'], 'not the other genre; one showing nothing wanted only because the hand is short');
    assert.ok(some.every(slot => !slot.reelIds.includes('lib-3')));
    assert.ok(some.every(slot => !slot.effectId));
    assert.equal(new Set(some.map(slot => slot.id)).size, 3);
    assert.equal(new Set(some.map(slot => slot.typeStyle)).size, 3, 'each card keeps its own lyric type');
    assert.ok(some.every(slot => slot.style === 'filter' && !slot.effectId && !slot.plateId));
    // One picture alone is drawn as it is, not edited.
    const alone = pack.recommendRow('photography', person, 0, [], null, [item('lib-1')]);
    assert.ok(alone.length === 1 && alone[0].libraryId === 'lib-1' && !alone[0].reelIds);
    assert.deepEqual(some, pack.recommendRow('photography', person, 0, [], null, library), 'the same deal every time');

    const many = Array.from({ length: 6 }, (_, index) => item(`m${index}`));
    const full = pack.recommendRow('photography', person, 0, [], null, many);
    assert.equal(full.filter(slot => slot.reelIds).length, 4);
    assert.ok(full.every(slot => !slot.effectId));
    const again = pack.recommendRow('photography', person, 1, [], null, many);
    assert.notDeepEqual(full.map(slot => slot.id), again.map(slot => slot.id), 'Refresh brings other cards');
    assert.notDeepEqual(full.map(slot => slot.cutSeed), again.map(slot => slot.cutSeed), 'Refresh edits them another way');

    for (const row of ['spray', 'pulise']) {
      assert.deepEqual(pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }], null, library), pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }]), `${row} does not use the library`);
    }
    // Plain library photos without a cut-out (and no clips) do not change Riso or Dust: they still use plates.
    for (const row of ['riso', 'dust']) {
      assert.deepEqual(pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }], null, library), pack.recommendRow(row, person, 0, [{ id: 'burnnet-woman-1547507-1920', cutout: true }]), `${row} ignores uncut library photos`);
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

test('a genre look in an item\'s tags counts like the song\'s feeling, and an off-look tag is never a reason to refuse', async () => {
  const { server, pick } = await load();
  try {
    const wanted = { attitude: 'love', genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' };
    const items = [item('plain'), item('club', { tags: ['club'] }), item('both', { tags: ['club', 'dark', 'neon'] }), item('beach', { tags: ['beach'] })];
    const fit = (id, over = {}) => pick.libraryFit(items.find(entry => entry.id === id), { ...wanted, ...over });
    assert.ok(fit('both') > fit('club') && fit('club') > fit('plain'), 'Techno: club and dark both count');
    assert.equal(fit('club'), fit('beach'), 'a Techno look counts as much as what a love song wants to see (summer)');
    assert.ok(ids(pick.pickLibrary(items, wanted, 's', 0, 4)).includes('plain'), 'nothing is refused for its tags');
    assert.equal(fit('both', { subGenre: 'House' }), fit('club', { subGenre: 'House' }), 'House likes club, and does not count dark or neon');
  } finally { await server.close(); }
});

test('what the words are about pulls hardest, then the main feeling, then the other moods', async () => {
  const { server, pick, pack } = await load();
  try {
    // ATREVIMENTO: flirty, also fun and love, about seduction, romance and nightlife.
    const wanted = { attitude: 'flirty', genre: 'Nope', subGenre: '', moods: ['fun', 'love'], themes: ['seduction', 'romance', 'nightlife'] };
    const items = [
      item('plain', { tags: ['skating'] }),
      item('sexy', { tags: ['beautiful woman', 'close up'] }),
      item('three', { tags: ['sexy', 'couple', 'neon'] }),
      item('dancing', { tags: ['dancing'] }),
      item('friends', { tags: ['friends'] }),
    ];
    const fit = id => pick.libraryFit(items.find(entry => entry.id === id), wanted);
    assert.ok(fit('three') > fit('sexy'), 'each theme shown counts');
    assert.ok(fit('sexy') > fit('dancing'), 'a theme of the words beats what the feeling alone wants (flirty: dancing)');
    assert.ok(fit('dancing') > fit('friends'), 'the main feeling beats another mood of the song (fun: friends)');
    assert.ok(fit('friends') > fit('plain'));
    assert.equal(pick.libraryFit(items[4], { ...wanted, moods: undefined }), 0, 'without the other moods, friends are not wanted');
    assert.equal(pick.libraryFit(item('sad-sexy', { attitudes: ['sad'], tags: ['sexy'] }), wanted), pick.libraryFit(item('x', { attitudes: [], tags: ['sexy'] }), wanted), 'no mood of the picture\'s own is read');

    // The brain passes the reader's themes and moods on to every library pick.
    const song = profile('Pop', undefined, 'flirty');
    song.lyricMeaning.meaning = { ...song.lyricMeaning.meaning, moods: ['love'], themes: ['seduction'] };
    const clip = (id, over) => item(id, { kind: 'video', motionUrl: `https://x/${id}.mp4`, shots: [[0, 2000]], ...over });
    const library = [clip('plain'), clip('beach', { tags: ['beach'] }), clip('dancing', { tags: ['dancing'] }), clip('sexy', { tags: ['sexy'] })];
    assert.deepEqual(ids(pack.windowHand(song, 0, library)), ['sexy', 'dancing', 'beach', 'plain']);
  } finally { await server.close(); }
});

test('a reel is edited from pictures that show different things, not eight of the same', async () => {
  const { server, pack } = await load();
  try {
    const wanted = { attitude: 'confident', genre: 'Electronic & Dance (EDM)', subGenre: 'House' };
    const clip = (id, tags) => item(id, { kind: 'video', attitudes: [], tags, motionUrl: `https://x/${id}.mp4`, shots: [[0, 2000]] });
    const cars = Array.from({ length: 10 }, (_, i) => clip(`car${i}`, ['car', 'luxury', 'night']));
    const others = [clip('club', ['club', 'crowd']), clip('girls', ['girls', 'dancing']), clip('champagne', ['champagne'])];
    const pool = ids(pack.reelPool([...cars, ...others], wanted, 'song', 0));
    assert.equal(pool.length, pack.REEL_POOL);
    for (const id of ['club', 'girls', 'champagne']) assert.ok(pool.includes(id), `${id} is in the reel beside the cars`);
    assert.deepEqual(ids(pack.mixed([cars[0], cars[1], others[0]], 2)), ['car0', 'club'], 'the next best that brings something new comes before another car');
  } finally { await server.close(); }
});

test('what people kept nudges the order a little: never past a better fit, the same for the same song, and new pictures still get turns', async () => {
  const { server, pick } = await load();
  try {
    const usual = 0.1;
    const kept = { shown: 200, won: 80 };
    const ignored = { shown: 200, won: 2 };
    for (const draw of ['a', 'b', 'c', 'd', 'e']) {
      for (const learned of [kept, ignored, undefined, { shown: 0, won: 0 }]) {
        const nudge = pick.learnedNudge(learned, usual, draw);
        assert.ok(Math.abs(nudge) <= 0.3 + 1e-9, `${nudge}`);
        assert.equal(nudge, pick.learnedNudge(learned, usual, draw), 'the same draw gives the same nudge');
      }
      assert.ok(pick.learnedNudge(kept, usual, draw) > pick.learnedNudge(ignored, usual, draw), 'a picture people keep leads one they pass over');
    }
    // A new picture is drawn around the usual rate: sometimes ahead, sometimes behind, so it gets its turns.
    const fresh = Array.from({ length: 40 }, (_, i) => pick.learnedNudge(undefined, usual, `song${i}`));
    assert.ok(fresh.some(n => n > 0) && fresh.some(n => n < 0));
    assert.ok(Math.abs(pick.usualRate([item('x', { learned: { shown: 90, won: 9 } })]) - 0.1) < 1e-9);

    // Two pictures that fit the same: the one people keep leads for most songs. Showing more of what the song wants still beats any history.
    const wanted = { attitude: 'love', genre: 'Pop', subGenre: '' };
    const items = [item('kept', { tags: ['couple'], learned: kept }), item('passed', { tags: ['couple'], learned: ignored }), item('star', { learned: { shown: 500, won: 400 } })];
    const leads = Array.from({ length: 30 }, (_, i) => ids(pick.pickLibrary(items, wanted, `song-${i}`, 0, 3)));
    assert.ok(leads.filter(order => order[0] === 'kept').length >= 25);
    assert.ok(leads.every(order => order.indexOf('star') === 2), 'history never lifts a picture over one that shows what the song wants');
    // Without any history the order is exactly as before.
    const plain = [item('p'), item('q'), item('r')];
    assert.deepEqual(ids(pick.pickLibrary(plain, wanted, 's', 0, 3)), ids(pick.pickLibrary(plain.map(entry => ({ ...entry })), wanted, 's', 0, 3)));
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

      for (const id of [photo, video]) assert.equal((await changeItem(id, { attitudes: ['love'], status: 'approved', genre: 'Pop', subGenre: 'Indie Pop', tags: [] })).status, 'approved');

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
      await changeItem(video, { attitudes: ['happy'], status: 'approved' });
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
    await changeItem(id, { attitudes: ['fun'], status: 'approved' });
    const response = await libraryHandler(new Request('https://example.test/api/library'));
    assert.equal(response.status, 200);
    const after = await response.json();
    const offered = after.items.find(entry => entry.id === id);
    assert.ok(offered && offered.kind === 'photo' && offered.attitudes[0] === 'fun');
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

test('the video worker mends a video whose colour space is written as reserved, by copying it with the usual colours, before it gives up', () => {
  const worker = readFileSync(new URL('../../audio-intelligence/modal_prepare_media_staging.py', import.meta.url), 'utf8');
  // Some cameras write the colour space as "reserved", which ffmpeg refuses ("Invalid color space"); the copy needs no re-encode.
  assert.match(worker, /h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1/);
  assert.match(worker, /hevc_metadata=/);
  assert.match(worker, /except PrepareError:\s+fixed = with_colours\(source, directory\)/);
});

test('the admin is warned when a picture is too small for sharp 1080x1920 creatives', () => {
  assert.equal(resolutionWarning(1080, 1920), null);
  assert.equal(resolutionWarning(1277, 1920), null);
  assert.equal(resolutionWarning(2160, 3840), null);
  assert.equal(resolutionWarning(1080, 1850), null, 'a tiny enlargement is not worth a warning');
  assert.match(resolutionWarning(720, 1280), /720×1280.*1\.5×/);
  assert.match(resolutionWarning(768, 576), /3\.3×.*portrait/);
  assert.doesNotMatch(resolutionWarning(576, 1024), /portrait/, 'a portrait picture is not told to turn portrait');
  assert.equal(resolutionWarning(null, null), null, 'an unknown size says nothing');
});

test('a JPEG\'s size is read from its header', () => {
  // SOI, an APP0 segment, then a start-of-frame segment for 300 wide, 200 high.
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x01, 0x01, 0x11, 0x00]);
  assert.deepEqual(jpegSize(bytes), [300, 200]);
  assert.equal(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), null);
});
