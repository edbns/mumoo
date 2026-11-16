import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { BOARDS as SERVER_BOARDS } from '../netlify/lib/boards.mjs';
import { ATTITUDES } from '../netlify/lib/library.mjs';
import { validFeedback } from '../netlify/lib/feedback.mjs';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const boards = await server.ssrLoadModule('/src/boards.ts');
  const genres = await server.ssrLoadModule('/src/genres.ts');
  const themes = await server.ssrLoadModule('/src/song-themes.ts');
  const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
  return { server, boards, genres, themes, pack };
}

test('every board names only styles, sub-genres, genres, themes and moods the brain knows, and the server knows every board', async () => {
  const { server, boards, genres, themes } = await load();
  try {
    const styles = new Set(JSON.parse(readFileSync(new URL('../src/styles.json', import.meta.url), 'utf8')).map(style => style.name));
    const subGenres = new Set(genres.GENRES.flatMap(group => group.subGenres));
    const genreNames = new Set(genres.GENRES.map(group => group.name));
    for (const board of boards.BOARDS) {
      for (const style of board.styles) assert.ok(styles.has(style), `${board.name}: no style named "${style}"`);
      for (const sub of board.subGenres) assert.ok(subGenres.has(sub), `${board.name}: no sub-genre "${sub}"`);
      for (const genre of board.genres) assert.ok(genreNames.has(genre), `${board.name}: no genre "${genre}"`);
      for (const theme of board.themes) assert.ok(themes.THEMES.includes(theme), `${board.name}: no theme "${theme}"`);
      for (const mood of board.moods) assert.ok(ATTITUDES.includes(mood), `${board.name}: no mood "${mood}"`);
    }
    assert.deepEqual(SERVER_BOARDS, boards.BOARD_IDS);
    assert.equal(new Set(boards.BOARD_IDS).size, boards.BOARD_IDS.length, 'ids are unique');
  } finally { await server.close(); }
});

test('the style chooses the board first, and the words choose between the boards of one style', async () => {
  const { server, boards } = await load();
  try {
    const best = wanted => [...boards.BOARDS].sort((a, b) => boards.boardFit(b, wanted) - boards.boardFit(a, wanted))[0].id;
    const house = { genre: 'Electronic & Dance (EDM)', subGenre: 'House', attitude: 'fun' };
    assert.equal(best({ ...house, style: 'Amapiano' }), 'block-party', 'Amapiano shares House with house music, not its board');
    assert.equal(best({ ...house, style: 'house music' }), 'main-stage');
    const afrobeats = { genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'Afrobeats' };
    assert.equal(best({ ...afrobeats, attitude: 'fun', themes: ['party'] }), 'block-party', 'an afrobeats party song');
    assert.equal(best({ ...afrobeats, attitude: 'love', themes: ['romance'] }), 'sunset-coast', 'an afrobeats love song');
    assert.equal(best({ genre: '', subGenre: '', attitude: 'sad', themes: ['heartbreak'] }), 'rain-blue', 'no genre: the words alone');
    assert.equal(best({ genre: 'Gospel & Christian', subGenre: 'Gospel', attitude: 'spiritual' }), 'sanctuary-soul');
  } finally { await server.close(); }
});

test('the admin\'s genre map routes too: its genres always, its "when the words fit" genres only when they do', async () => {
  const { server, boards } = await load();
  try {
    const board = id => boards.BOARDS.find(entry => entry.id === id);
    const fit = (id, wanted) => boards.boardFit(board(id), { genre: '', subGenre: '', attitude: null, ...wanted });
    for (const entry of boards.BOARDS) assert.ok(entry.primary.length && entry.secondary.length, `${entry.name} shows its genres`);
    const rnb = { genre: 'Jazz, Soul & Blues', subGenre: 'Smooth Jazz / Soul', style: 'contemporary R&B' };
    assert.equal(fit('night-drive', rnb) - fit('night-drive', { ...rnb, style: 'soul' }), 2, 'R&B (its style) is on Night Drive\'s map');
    const pop = { genre: 'Pop', subGenre: 'General Pop', style: 'pop music' };
    assert.equal(fit('sunset-coast', pop), 0, 'pop is only on Sunset & Coast when the words fit');
    assert.equal(fit('sunset-coast', { ...pop, attitude: 'happy', themes: ['summer'] }), 3, 'a happy summer pop song: its words, and pop counts');
    assert.equal(fit('main-stage', { genre: 'Electronic & Dance (EDM)', subGenre: 'Trance' }), 1 + 2, 'EDM, named in the genre\'s own name');
    assert.equal(fit('luxury-flex', { genre: 'Pop', subGenre: 'K-Pop / J-Pop', style: 'K-pop', attitude: 'confident', themes: ['fame'] }), 2 + 1,
      'K-pop is not "pop": only Luxury & Flex\'s words count');
  } finally { await server.close(); }
});

const filed = (prefix, board, count, over = {}) => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}${i}`, kind: 'video', attitudes: [], tags: [], genre: null, subGenre: null, boards: [board], url: `https://x/${prefix}${i}`, motionUrl: `https://x/${prefix}${i}.mp4`, ...over,
}));

test('every row of a song is dealt from its best filled board, through every Refresh; an empty board is never used', async () => {
  const { server, boards } = await load();
  try {
    const wanted = { genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'Afrobeats', attitude: 'fun', themes: ['party'] };
    assert.equal(boards.boardForRow('photography', wanted, [], 'song'), null, 'no filled board: the library as before');
    assert.equal(boards.boardForRow('photography', wanted, filed('b', 'block-party', boards.BOARD_MIN - 1), 'song'), null, 'one short of a reel');

    const items = [...filed('b', 'block-party', 8), ...filed('s', 'sunset-coast', 8), ...filed('m', 'main-stage', 8), ...filed('h', 'heartland-dust', 8)];
    const rows = ['photography', 'thermal', 'halftone', 'dither', 'ascii', 'riso', 'window', 'dust', 'looks'];
    assert.deepEqual([...new Set(rows.map(row => boards.boardForRow(row, wanted, items, 'song').id))], ['block-party'], 'one scene for the whole shelf');
    assert.deepEqual(boards.songBoards(wanted, items, 'song').map(board => board.id).slice(0, 2), ['block-party', 'sunset-coast'], 'the others that fit stand behind it');
    assert.ok(!boards.songBoards(wanted, items, 'song').some(board => board.id === 'heartland-dust'), 'a board that does not fit is never behind it');
  } finally { await server.close(); }
});

test('Funk Carioca with party words stays on Block Party, never Main Stage; a song no board fits still gets one', async () => {
  const { server, boards } = await load();
  try {
    const items = [...filed('b', 'block-party', 8), ...filed('n', 'night-drive', 8), ...filed('m', 'main-stage', 8), ...filed('d', 'dark-warehouse', 8)];
    const carioca = { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'funk carioca', attitude: 'fun', themes: ['party', 'dancing'] };
    for (const row of ['photography', 'thermal', 'halftone', 'riso', 'window']) assert.equal(boards.boardForRow(row, carioca, items, 'song').id, 'block-party', row);
    assert.ok(boards.boardForRow('photography', { genre: '', subGenre: '', attitude: null }, items, 'song'));
  } finally { await server.close(); }
});

function profile(sha = 'c'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: {
      primaryGenre: { value: 'Reggae & Dancehall', source: 'creator' }, subGenre: { value: 'Dancehall / Afrobeats', source: 'creator' },
      style: { value: 'Afrobeats', name: 'Afrobeats', source: 'creator' },
    },
    musicAnalysis: {
      status: 'ready', clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 110, gridBpm: 110, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'fun', sadness: 0, intensity: 4, themes: ['party'] } },
  };
}

test('a reel is edited from its row\'s board only, the card names it, and with no filled board nothing changes', async () => {
  const { server, pack } = await load();
  try {
    const loose = filed('x', 'none', 10, { boards: [] });
    const items = [...filed('b', 'block-party', 8), ...filed('s', 'sunset-coast', 8), ...loose];
    const slots = pack.recommendRow('photography', profile(), 0, [], null, items);
    const board = slots.find(slot => slot.board)?.board;
    assert.ok(board, 'the cards say which board they came from');
    const on = new Set(items.filter(item => item.boards.includes(board)).map(item => item.id));
    for (const slot of slots) for (const id of slot.reelIds ?? []) assert.ok(on.has(id), `${id} is not on ${board}`);

    const before = pack.recommendRow('photography', profile(), 0, [], null, loose);
    assert.ok(before.every(slot => !slot.board), 'no filled board: no board named');
    assert.ok(before.some(slot => slot.reelIds?.length), 'and the library is used as before');
  } finally { await server.close(); }
});

test('a board of 53 clips is walked: no clip on two cards of a Refresh, none from the Refresh before, every clip used', async () => {
  const { server, pack } = await load();
  try {
    const items = [...filed('b', 'block-party', 53), ...filed('m', 'main-stage', 40)];
    const refresh = generation => pack.recommendRow('photography', profile(), generation, [], null, items).map(slot => slot.reelIds ?? []);
    const used = new Set();
    let before = new Set();
    for (let generation = 0; generation < 6; generation++) {
      const reels = refresh(generation);
      const ids = reels.flat();
      assert.ok(reels.every(reel => reel.length >= 4), `Refresh ${generation}: a reel of ${reels.map(reel => reel.length)}`);
      assert.ok(ids.every(id => id.startsWith('b')), `Refresh ${generation} leaves the board`);
      assert.equal(new Set(ids).size, ids.length, `Refresh ${generation}: a clip on two cards`);
      assert.ok(ids.every(id => !before.has(id)), `Refresh ${generation} repeats a clip of the Refresh before`);
      ids.forEach(id => used.add(id));
      before = new Set(ids);
    }
    assert.equal(used.size, 53, 'every clip on the board gets its turn');
    assert.deepEqual(refresh(2), refresh(2), 'seeded: the same Refresh deals the same reels');
  } finally { await server.close(); }
});

test('a card may name a board the server knows, and no other', () => {
  const body = board => ({
    version: 1, event: 'play', clipSha256: 'a'.repeat(64), primaryGenre: 'Pop', subGenre: null, vibe: null, lane: 'party', language: null,
    lyricAttitude: null, lyricSadness: null, lyricIntensity: null, lyricsOrigin: null, row: 'photography',
    slot: { id: 'x', style: 'punch', font: 'a', fontSecondary: 'b', ...(board !== undefined && { board }) },
  });
  assert.equal(validFeedback(body(undefined)), true);
  assert.equal(validFeedback(body('block-party')), true);
  assert.equal(validFeedback(body('made-up')), false);
});
