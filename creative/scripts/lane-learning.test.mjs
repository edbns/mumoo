import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { learnedShelf } from '../netlify/lib/library.mjs';
import { validFeedback } from '../netlify/lib/feedback.mjs';
import { db } from '../netlify/lib/person.mjs';

/** Learning per lane (the brain's lane for the song), and the shelf's learned order. */
const READY = Boolean(process.env.DATABASE_URL);

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  return { server, pick: await server.ssrLoadModule('/src/library-pick.ts'), pack: await server.ssrLoadModule('/src/creatives-pack.ts') };
}

const item = (id, over = {}) => ({ id, kind: 'photo', attitudes: [], tags: [], genre: null, subGenre: null, url: `https://x/${id}`, ...over });

function profile(genre = 'Pop', subGenre = 'Indie Pop', sha = 'b'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' }, subGenre: { value: subGenre, source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'love', sadness: 1, intensity: 3 } },
  };
}
const songs = (genre, subGenre) => Array.from({ length: 30 }, (_, i) => profile(genre, subGenre, i.toString(16).padStart(64, '0')));

test('a song\'s own lane counts in full, the other lanes a quarter, and a lane nobody used still learns a little', async () => {
  const { server, pick } = await load();
  try {
    assert.deepEqual(pick.inLane({ shown: 100, won: 20 }, { shown: 20, won: 10 }), { shown: 40, won: 12.5 });
    assert.deepEqual(pick.inLane({ shown: 100, won: 20 }, undefined), { shown: 25, won: 5 }, 'no history in this lane: a quarter of the rest');
    assert.deepEqual(pick.inLane(undefined, { shown: 8, won: 2 }), { shown: 8, won: 2 });
    assert.equal(pick.inLane(undefined, undefined), undefined);
  } finally { await server.close(); }
});

test('a template leads with the kind of card people download in songs of the same lane', async () => {
  const { server, pack } = await load();
  try {
    const clip = id => ({ ...item(id), kind: 'video', motionUrl: `https://x/${id}.mp4`, shots: [[0, 1000]] });
    const library = [item('p1'), item('p2'), clip('c1'), clip('c2'), clip('c3')];
    const hands = songs('Pop', 'Indie Pop');
    const lane = pack.readSong(hands[0]).lane;
    const leads = laneName => hands.filter(person => {
      const plain = pack.recommendRow('triptych', person, 0, [], library);
      const second = pack.cardKind(plain[1]);
      // Overall nothing stands out; in one lane, people downloaded the second kind.
      const all = Object.fromEntries(plain.map(slot => [pack.cardKind(slot), { shown: 600, won: 6 }]));
      const lane = Object.fromEntries(plain.map(slot => [pack.cardKind(slot), { shown: 200, won: pack.cardKind(slot) === second ? 100 : 2 }]));
      const learned = pack.recommendRow('triptych', person, 0, [], library, false, { cards: { triptych: all }, lanes: { [laneName]: { cards: { triptych: lane } } } });
      return pack.cardKind(learned[0]) === second;
    }).length;
    const here = leads(lane);
    const elsewhere = leads('not-this-lane');
    assert.ok(here >= 25, `downloaded in this song's lane, it leads ${here} of 30 songs`);
    assert.ok(elsewhere < 10, `downloaded in another lane, only ${elsewhere}`);
  } finally { await server.close(); }
});

test('the shelf puts first the templates people download in songs of this lane, the same order every time for a song', async () => {
  const { server, pack } = await load();
  try {
    const rows = pack.SHELF_ROWS;
    const hands = songs('Pop', 'Indie Pop');
    const lane = pack.readSong(hands[0]).lane;
    assert.deepEqual(pack.shelfOrder(rows, {}, hands[0]).map(row => row.id), rows.map(row => row.id), 'nothing learned: the brain\'s order');
    const late = rows.at(-1).id;
    const favourite = { rows: Object.fromEntries(rows.map(row => [row.id, { shown: 400, won: 4 }])), lanes: { [lane]: { rows: { [late]: { shown: 200, won: 80 } } } } };
    let moved = 0;
    for (const person of hands) {
      const order = pack.shelfOrder(rows, favourite, person).map(row => row.id);
      assert.deepEqual(order, pack.shelfOrder(rows, favourite, person).map(row => row.id), 'the same song, the same shelf');
      assert.deepEqual([...order].sort(), rows.map(row => row.id).sort(), 'every template is still there');
      if (order.indexOf(late) < rows.length - 3) moved++;
    }
    assert.ok(moved >= 25, `the template people download in this lane moves up for ${moved} of 30 songs`);
    // Downloads in another lane hardly move it.
    const elsewhere = { rows: favourite.rows, lanes: { 'not-this-lane': { rows: { [late]: { shown: 200, won: 80 } } } } };
    const far = hands.filter(person => pack.shelfOrder(rows, elsewhere, person).map(row => row.id).indexOf(late) < rows.length - 3).length;
    assert.ok(far < moved, `another lane's taste counts less (${far} against ${moved})`);
    // What everybody downloads most leads; with nothing to choose between them, each template gets its turns near the top.
    const most = rows[Math.floor(rows.length / 2)].id;
    const popular = { rows: Object.fromEntries(rows.map(row => [row.id, { shown: 400, won: row.id === most ? 60 : 12 }])) };
    const leads = hands.filter(person => pack.shelfOrder(rows, popular, person)[0].id === most).length;
    assert.ok(leads >= 25, `the most downloaded template leads ${leads} of 30 songs`);
    const even = { rows: Object.fromEntries(rows.map(row => [row.id, { shown: 400, won: 40 }])) };
    const firsts = new Set(hands.map(person => pack.shelfOrder(rows, even, person)[0].id));
    assert.ok(firsts.size >= 5, `with nothing to choose between them, ${firsts.size} templates take turns at the top`);
  } finally { await server.close(); }
});

const kept = (row, over = {}) => ({ row, look: null, lane: null, genre: 'Pop', words: true, event: 'delivered', weeks: 0, n: 1, ...over });

test('what a person kept before leads their shelf, most for songs like this one, before what everybody downloads', async () => {
  const { server, pack } = await load();
  try {
    const rows = pack.SHELF_ROWS;
    const hands = songs('Pop', 'Indie Pop');
    const lane = pack.readSong(hands[0]).lane;
    const popular = { rows: Object.fromEntries(rows.map(row => [row.id, { shown: 400, won: row.id === rows[0].id ? 80 : 8 }])) };
    const [late, later] = [rows.at(-1).id, rows.at(-2).id];
    for (const person of hands) {
      const order = pack.shelfOrder(rows, { ...popular, mine: [kept(late, { lane }), kept(later, { lane, event: 'select' })] }, person).map(row => row.id);
      assert.deepEqual(order.slice(0, 3), [late, later, rows[0].id], 'theirs first, the more kept first, then what everybody downloads');
      assert.deepEqual([...order].sort(), rows.map(row => row.id).sort(), 'every template is still there');
    }
    // One choice long ago, for another kind of song (another lane and genre, no lyrics), is not enough to lead.
    const faint = { ...popular, mine: [kept(late, { lane: 'not-this-lane', genre: 'Rock', words: false, event: 'select', weeks: 20 })] };
    assert.ok(hands.every(person => pack.shelfOrder(rows, faint, person)[0].id !== late));
    // The same song, the same shelf.
    const mine = { ...popular, mine: [kept(late, { lane })] };
    assert.deepEqual(pack.shelfOrder(rows, mine, hands[0]), pack.shelfOrder(rows, mine, hands[0]));
  } finally { await server.close(); }
});

test('a template leads with the kind of card this person kept before', async () => {
  const { server, pack } = await load();
  try {
    const person = songs('Pop', 'Indie Pop')[3];
    const plain = pack.recommendRow('riso', person, 0);
    const second = pack.cardKind(plain[1]);
    assert.ok(second, 'riso cards have kinds');
    const lane = pack.readSong(person).lane;
    const led = pack.recommendRow('riso', person, 0, [], [], false, { mine: [kept('riso', { look: second, lane })] });
    assert.equal(pack.cardKind(led[0]), second);
    assert.equal(led.length, plain.length);
  } finally { await server.close(); }
});

test('each card tells where its template was on the shelf', () => {
  const card = place => ({
    version: 1, event: 'play', clipSha256: 'a'.repeat(64), primaryGenre: 'Pop', subGenre: 'Indie Pop', vibe: null, lane: 'party', language: 'en',
    lyricsOrigin: 'typed', lyricAttitude: 'love', lyricSadness: 1, lyricIntensity: 3, row: 'thermal', slot: { id: 'x', style: 'filter', font: 'Anton', fontSecondary: 'Inter' }, place,
  });
  assert.equal(validFeedback(card(0)), true);
  assert.equal(validFeedback(card(undefined)), true);
  for (const bad of [-1, 1.5, 40, '2']) assert.equal(validFeedback(card(bad)), false, String(bad));
});

test('the server counts each template and kind of card overall and per lane, a download three times a cart', { skip: !READY, timeout: 30000 }, async () => {
  const sql = db();
  const row = `zt${randomBytes(4).toString('hex')}`;
  const clip = randomBytes(32).toString('hex');
  const add = (event, lane, look, n) => Array.from({ length: n }, () => sql`
    insert into brain_feedback (event, clip_sha256, genre, lane, row_id, look) values (${event}, ${clip}, 'Pop', ${lane}, ${row}, ${look})`);
  try {
    await Promise.all([...add('play', 'party', 'a', 6), ...add('select', 'party', 'a', 3), ...add('delivered', 'party', 'a', 3), ...add('play', 'dark', 'b', 4), ...add('play', 'dark', null, 2)]);
    const shelf = await learnedShelf();
    assert.deepEqual(shelf.rows[row], { shown: 12, won: 3 });
    assert.deepEqual(shelf.cards[row], { a: { shown: 6, won: 3 }, b: { shown: 4, won: 0 } });
    assert.deepEqual(shelf.lanes.party.rows[row], { shown: 6, won: 3 });
    assert.deepEqual(shelf.lanes.dark.rows[row], { shown: 6, won: 0 });
    assert.deepEqual(shelf.lanes.dark.cards[row], { b: { shown: 4, won: 0 } });
  } finally {
    await sql`delete from brain_feedback where row_id = ${row}`;
  }
});
