import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { APART_BOARDS, BOARDS as SERVER_BOARDS } from '../netlify/lib/boards.mjs';
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
    assert.equal(best({ ...house, style: 'house music' }), 'rave-warehouse');
    const afrobeats = { genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'Afrobeats' };
    assert.equal(best({ ...afrobeats, attitude: 'fun', themes: ['party'] }), 'block-party', 'an afrobeats party song');
    assert.equal(best({ ...afrobeats, attitude: 'love', themes: ['romance'] }), 'sunset-coast', 'an afrobeats love song');
    assert.equal(best({ genre: '', subGenre: '', attitude: 'sad', themes: ['heartbreak'] }), 'night-neon', 'no genre: the words alone');
    assert.equal(best({ genre: 'Gospel & Christian', subGenre: 'Gospel', attitude: 'spiritual' }), 'horizon-soul');
  } finally { await server.close(); }
});

test('the admin\'s genre map routes too: its genres always, its "when the words fit" genres only when they do', async () => {
  const { server, boards } = await load();
  try {
    const board = id => boards.BOARDS.find(entry => entry.id === id);
    const fit = (id, wanted) => boards.boardFit(board(id), { genre: '', subGenre: '', attitude: null, ...wanted });
    for (const entry of boards.BOARDS.filter(one => !one.apart)) assert.ok(entry.primary.length && entry.secondary.length, `${entry.name} shows its genres`);
    const rnb = { genre: 'Jazz, Soul & Blues', subGenre: 'Smooth Jazz / Soul', style: 'contemporary R&B' };
    assert.equal(fit('night-neon', rnb) - fit('night-neon', { ...rnb, style: 'soul' }), 4 + 2, 'contemporary R&B is one of Night Drive, Neon & Lo-Fi\'s styles and on its map');
    const pop = { genre: 'Pop', subGenre: 'General Pop', style: 'pop music' };
    assert.equal(fit('sunset-coast', pop), 0, 'pop is only on Sunset & Coast when the words fit');
    assert.equal(fit('sunset-coast', { ...pop, attitude: 'happy', themes: ['summer'] }), 3, 'a happy summer pop song: its words, and pop counts');
    assert.equal(fit('rave-warehouse', { genre: 'Electronic & Dance (EDM)', subGenre: 'Trance' }), 1 + 2, 'EDM, named in the genre\'s own name');
    assert.equal(fit('luxury-flex', { genre: 'Pop', subGenre: 'K-Pop / J-Pop', style: 'K-pop', attitude: 'confident', themes: ['fame'] }), 2 + 1,
      'K-pop is not "pop": only Luxury & Flex\'s words count');
  } finally { await server.close(); }
});

const filed = (prefix, board, count, over = {}) => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}${i}`, kind: 'video', attitudes: [], tags: [], genre: null, subGenre: null, boards: [board], url: `https://x/${prefix}${i}`, motionUrl: `https://x/${prefix}${i}.mp4`, ...over,
}));

test('a board kept apart (Memes & Funny) is never dealt to a song, however full, and the server keeps its items off the creatives', async () => {
  const { server, boards } = await load();
  try {
    assert.deepEqual(APART_BOARDS, boards.APART_BOARD_IDS);
    assert.ok(APART_BOARDS.includes('funny-memes'));
    const wanted = { genre: 'Pop', subGenre: 'General Pop', attitude: 'fun', themes: ['party'] };
    const items = filed('m', 'funny-memes', 60);
    assert.equal(boards.boardForRow('photography', wanted, items, 'song'), null, 'only memes filled: no board, as if none were filled');
    const both = [...items, ...filed('p', 'pop-studio', boards.BOARD_MIN)];
    assert.deepEqual(boards.songBoards(wanted, both, 'song').map(board => board.id), ['pop-studio']);
  } finally { await server.close(); }
});

test('every row of a song is dealt from its best filled board, through every Refresh; an empty board is never used', async () => {
  const { server, boards } = await load();
  try {
    const wanted = { genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'Afrobeats', attitude: 'fun', themes: ['party'] };
    assert.equal(boards.boardForRow('photography', wanted, [], 'song'), null, 'no filled board: the library as before');
    assert.equal(boards.boardForRow('photography', wanted, filed('b', 'block-party', boards.BOARD_MIN - 1), 'song'), null, 'one short of a reel');

    const items = [...filed('b', 'block-party', 8), ...filed('s', 'sunset-coast', 8), ...filed('m', 'rave-warehouse', 8), ...filed('h', 'horizon-soul', 8)];
    const rows = ['photography', 'thermal', 'halftone', 'dither', 'ascii', 'riso', 'window'];
    assert.deepEqual([...new Set(rows.map(row => boards.boardForRow(row, wanted, items, 'song').id))], ['block-party'], 'one scene for the whole shelf');
    assert.deepEqual(boards.songBoards(wanted, items, 'song').map(board => board.id).slice(0, 2), ['block-party', 'sunset-coast'], 'the others that fit stand behind it');
    assert.ok(!boards.songBoards(wanted, items, 'song').some(board => board.id === 'horizon-soul'), 'a board that does not fit is never behind it');
  } finally { await server.close(); }
});

test('Funk Carioca with party words stays on Block Party, never Rave, Strobes & Warehouse; a song no board fits still gets one', async () => {
  const { server, boards } = await load();
  try {
    const items = [...filed('b', 'block-party', 8), ...filed('n', 'night-neon', 8), ...filed('m', 'rave-warehouse', 8), ...filed('d', 'rave-warehouse', 8)];
    const carioca = { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'funk carioca', attitude: 'fun', themes: ['party', 'dancing'] };
    for (const row of ['photography', 'thermal', 'halftone', 'riso', 'window']) assert.equal(boards.boardForRow(row, carioca, items, 'song').id, 'block-party', row);
    assert.ok(boards.boardForRow('photography', { genre: '', subGenre: '', attitude: null }, items, 'song'));
  } finally { await server.close(); }
});

test('every phonk is dealt from Block Party alone, whatever else it fits; the boards it used to share never take it', async () => {
  const { server, boards } = await load();
  try {
    const items = boards.BOARDS.flatMap(board => filed(board.id[0] + board.id.at(-1), board.id, 8));
    const songs = [
      { genre: 'Electronic & Dance (EDM)', subGenre: 'General Electronic', style: 'Brazilian phonk', attitude: 'confident', themes: ['cars', 'nightlife'] },
      { genre: 'Electronic & Dance (EDM)', subGenre: 'General Electronic', style: 'drift phonk', attitude: 'angry', themes: ['city'] },
      { genre: 'Electronic & Dance (EDM)', subGenre: 'General Electronic', style: 'rare phonk', attitude: 'sad' },
      { genre: 'Hip-Hop & Rap', subGenre: 'Phonk', attitude: 'confident' },
    ];
    for (const song of songs) {
      assert.deepEqual(boards.songBoards(song, items, 'song').map(board => board.id), ['block-party'], song.style ?? song.subGenre);
      for (const row of ['photography', 'thermal', 'riso']) assert.equal(boards.boardForRow(row, song, items, 'song').id, 'block-party');
    }
    const withoutParty = items.filter(item => !item.boards.includes('block-party'));
    assert.notDeepEqual(boards.songBoards(songs[0], withoutParty, 'song'), [], 'with Block Party not filled, the song still gets boards');
  } finally { await server.close(); }
});

test('the merged boards: rave and warehouse music on one, still, soulful and country music on the other', async () => {
  const { server, boards } = await load();
  try {
    const items = boards.BOARDS.flatMap(board => filed(board.id[0] + board.id.at(-1), board.id, 8));
    const best = wanted => boards.songBoards(wanted, items, 'song')[0].id;
    assert.equal(best({ genre: 'Electronic & Dance (EDM)', subGenre: 'Techno', style: 'hard techno', attitude: null }), 'rave-warehouse');
    assert.equal(best({ genre: 'Electronic & Dance (EDM)', subGenre: 'House', style: 'gqom', attitude: null }), 'rave-warehouse');
    assert.equal(best({ genre: 'Electronic & Dance (EDM)', subGenre: 'Techno', style: 'melodic techno', attitude: 'thoughtful' }), 'horizon-soul');
    assert.equal(best({ genre: 'Country & Folk', subGenre: 'Modern Country', style: 'country music', attitude: null }), 'horizon-soul');
    assert.equal(best({ genre: 'Gospel & Christian', subGenre: 'Worship / Contemporary Christian', attitude: 'spiritual' }), 'horizon-soul');
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
    const slots = pack.recommendRow('photography', profile(), 0, [], items);
    const board = slots.find(slot => slot.board)?.board;
    assert.ok(board, 'the cards say which board they came from');
    const on = new Set(items.filter(item => item.boards.includes(board)).map(item => item.id));
    for (const slot of slots) for (const id of slot.reelIds ?? []) assert.ok(on.has(id), `${id} is not on ${board}`);

    const before = pack.recommendRow('photography', profile(), 0, [], loose);
    assert.ok(before.every(slot => !slot.board), 'no filled board: no board named');
    assert.ok(before.some(slot => slot.reelIds?.length), 'and the library is used as before');
  } finally { await server.close(); }
});

test('the song\'s footage is its board alone, however often it is refreshed: dealt evenly round the templates, a new order each Refresh', async () => {
  const { server, pack } = await load();
  try {
    const shelf = pack.SHELF_ROWS.map(def => def.id).filter(row => !['pulise', 'dust'].includes(row));
    // A board of 97, as Block Party is, beside a bigger board that also fits the song.
    const items = [...filed('b', 'block-party', 97), ...filed('m', 'rave-warehouse', 300)];
    const refresh = (generation, pool = items) => shelf.map(row => pack.recommendRow(row, profile(), generation, [], pool)[0].reelIds ?? []);
    const hands = [];
    for (let generation = 0; generation < 4; generation++) {
      const reels = refresh(generation);
      const ids = reels.flat();
      assert.ok(ids.every(id => id.startsWith('b')), `Refresh ${generation} leaves the board: ${ids.filter(id => !id.startsWith('b')).join(', ')}`);
      assert.ok(reels.every(reel => reel.length === pack.REEL_MOST && new Set(reel).size === reel.length), `Refresh ${generation}: a reel of ${reels.map(reel => reel.length)}`);
      assert.equal(new Set(reels.map(reel => reel[0])).size, reels.length, `Refresh ${generation}: two templates open on one clip`);
      const uses = new Map();
      for (const id of ids) uses.set(id, (uses.get(id) ?? 0) + 1);
      assert.ok(Math.max(...uses.values()) <= Math.ceil(ids.length / 97), `Refresh ${generation}: a clip on ${Math.max(...uses.values())} templates`);
      hands.push(reels);
    }
    assert.notDeepEqual(hands[1], hands[0], 'a Refresh walks the board in another order');
    assert.deepEqual(refresh(1), hands[1], 'seeded: the same Refresh deals the same reels');

    // A board big enough for two whole shelves: the Refresh shows none of the clips of the one before.
    const big = [...filed('b', 'block-party', 460), ...filed('m', 'rave-warehouse', 300)];
    const first = new Set(refresh(0, big).flat());
    assert.ok(refresh(1, big).flat().every(id => id.startsWith('b') && !first.has(id)), 'a big board goes on to clips not yet shown');

    // A small board: the templates share its clips, and still never leave it.
    const small = [...filed('b', 'block-party', 20), ...filed('m', 'rave-warehouse', 300)];
    for (let generation = 0; generation < 3; generation++) assert.ok(refresh(generation, small).flat().every(id => id.startsWith('b')), `a small board, Refresh ${generation}`);
  } finally { await server.close(); }
});

test('each time the same song is made it deals its own reels, on the board, and what the person saw waits for the rest', async () => {
  const { server, pack } = await load();
  try {
    const items = [...filed('b', 'block-party', 100), ...filed('m', 'rave-warehouse', 40)];
    const hand = deal => pack.recommendRow('photography', profile(), 0, [], items, false, {}, deal).flatMap(slot => slot.reelIds ?? []);
    const first = hand({ seed: 'one' });
    assert.deepEqual(hand({ seed: 'one' }), first, 'one deal stays the same while the person looks');
    assert.ok(first.filter(id => hand({ seed: 'two' }).includes(id)).length < first.length / 2, 'another time, or another person: mostly other clips');
    let seen = [];
    const remembered = () => new Map(seen.map((id, at) => [id, (at + 1) / seen.length]));
    for (let time = 0; time < 3; time++) {
      const ids = hand({ seed: `time${time}`, seen: remembered() });
      assert.ok(ids.every(id => id.startsWith('b')), 'never off the board');
      assert.ok(ids.every(id => !seen.includes(id)), `time ${time + 1} shows a clip the person already saw`);
      seen = [...seen, ...ids];
    }
    const fourth = hand({ seed: 'time3', seen: remembered() });
    const back = fourth.filter(id => seen.includes(id));
    assert.ok(back.every(id => seen.indexOf(id) < 64), 'once the board is used up, the clips seen longest ago come back first');
  } finally { await server.close(); }
});

test('within a board, the clips that show what the song is about lead every template, and the rest of the board fills them', async () => {
  const { server, pack } = await load();
  try {
    const party = filed('p', 'block-party', 20, { tags: ['party'] });
    const plain = filed('q', 'block-party', 80);
    const rows = ['photography', 'triptych', 'fisheye', 'typewriter', 'thermal', 'riso', 'window', 'silhouette'];
    const reels = Array.from({ length: 10 }, (_, k) => rows.map(row => pack.recommendRow(row, profile(), 0, [], [...party, ...plain], false, {}, { seed: `s${k}` })[0].reelIds ?? [])).flat();
    const leads = reels.map(reel => reel[0]);
    const share = leads.filter(id => id.startsWith('p')).length / leads.length;
    assert.ok(share > 0.45, `party clips open ${Math.round(share * 100)}% of the reels, a fifth of the board`);
    for (const reel of reels) assert.ok(reel.some(id => id.startsWith('q')), 'and every reel mixes in the rest of the board');
  } finally { await server.close(); }
});

test('pictures the person has not seen (new uploads) are shared out over every template, not packed into the first ones', async () => {
  const { server, pack } = await load();
  try {
    const fresh = filed('n', 'block-party', 19);
    const old = filed('o', 'block-party', 120);
    const seen = new Map(old.map((item, at) => [item.id, (at + 1) / old.length]));
    const rows = pack.SHELF_ROWS.map(def => def.id);
    const reels = rows.map(row => pack.recommendRow(row, profile(), 0, [], [...fresh, ...old], false, {}, { seed: 'x', seen })[0]?.reelIds).filter(Boolean);
    assert.ok(reels.length >= 10, `${reels.length} templates`);
    const shown = reels.flat().filter(id => id.startsWith('n'));
    assert.ok(shown.length >= Math.min(fresh.length, reels.length) - 1, `${shown.length} new ones shown`);
    for (const reel of reels) {
      assert.ok(reel.filter(id => id.startsWith('n')).length <= 2, `no template is all new: ${reel.join(',')}`);
      assert.ok(reel.some(id => id.startsWith('o')), 'every template mixes in the board it already had');
    }
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
  const kept = body('dark-warehouse');
  assert.equal(validFeedback(kept), true, 'a card kept from before the merge still counts');
  assert.equal(kept.slot.board, 'rave-warehouse', 'for the board it was merged into');
});
