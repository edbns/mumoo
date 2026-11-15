import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOARDS } from '../netlify/lib/boards.mjs';
import { SUGGEST, learnedShares, suggestBoards } from '../netlify/lib/board-suggest.mjs';
import { described } from '../netlify/lib/library.mjs';

/** A unit-length likeness pointing mostly along `axis` (with a little of `lean`), in 8 numbers. */
const like = (axis, lean = axis, mix = 0) => {
  const vector = Array(8).fill(0);
  vector[axis] += 1 - mix;
  vector[lean] += mix;
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};
/** `count` filed items on `boards`, all looking alike along `axis`. */
const filedOn = (boards, axis, count, from = 0) => Array.from({ length: count }, (_, at) => ({ id: `f${from + at}`, embedding: like(axis, (axis + 1) % 8, 0.05 * (at % 3)), boards }));
const many = [...filedOn(['sunset-coast'], 0, 25), ...filedOn(['main-stage'], 1, 25, 100)];

test('the worker is asked about exactly the boards the site has', () => {
  const worker = readFileSync(new URL('../../audio-intelligence/modal_prepare_media_staging.py', import.meta.url), 'utf8');
  const block = worker.match(/^BOARD_SCENES = \{([\s\S]*?)^\}/m)[1];
  assert.deepEqual([...block.matchAll(/^ {4}"([a-z-]+)": \(/gm)].map(match => match[1]), BOARDS);
});

test('the filed items most like it vote, the closest the most', () => {
  const shares = learnedShares(like(0), many);
  assert.ok(shares['sunset-coast'] > 0.99, 'all its nearest are on Sunset & Coast');
  const between = learnedShares(like(0, 1, 0.45), many);
  assert.ok(between['sunset-coast'] > (between['main-stage'] ?? 0), 'leaning toward the beach, the beach leads');
  const festival = learnedShares(like(1, 0, 0.3), many);
  assert.ok(festival['main-stage'] > (festival['sunset-coast'] ?? 0), 'leaning toward the festival, the festival leads');
  assert.equal(learnedShares(like(0), []).constructor, Object);
});

test('reader, SigLIP and the admin\'s own filing agree: a sure suggestion', () => {
  const item = { id: 'n', embedding: like(0), board_odds: { 'sunset-coast': 0.8 }, reading: { description: 'A beach at sunset.', boards: ['sunset-coast'], sure: true } };
  assert.deepEqual(suggestBoards(item, many), { boards: ['sunset-coast'], sure: true });
});

test('the admin\'s taste leads once they have filed enough: the reader alone cannot make it sure', () => {
  const item = { id: 'n', embedding: like(1), board_odds: {}, reading: { description: 'A crowd at night.', boards: ['dark-warehouse'], sure: true } };
  const suggestion = suggestBoards(item, many);
  assert.equal(suggestion.boards[0], 'main-stage', 'twenty-five filed festival clips outweigh the reader');
  assert.equal(suggestion.sure, false, 'the reader was sure of another board: not sure');
});

test('before there is enough filing, the reader and SigLIP decide; an unsure reader is never sure', () => {
  const item = { id: 'n', embedding: like(5), board_odds: { 'heartland-dust': 0.6, 'still-open': 0.2 }, reading: { description: 'A truck on a dirt road.', boards: ['heartland-dust'], sure: true } };
  assert.deepEqual(suggestBoards(item, filedOn(['main-stage'], 1, 3)), { boards: ['heartland-dust'], sure: true });
  assert.equal(suggestBoards({ ...item, reading: { ...item.reading, sure: false } }, []).sure, false);
});

test('a second board only when it is nearly as strong and named too; nothing to go on is no suggestion', () => {
  const item = { id: 'n', embedding: like(6), board_odds: { 'sanctuary-soul': 0.6, 'rain-blue': 0.5 }, reading: { description: 'Hands on a piano, black and white.', boards: ['sanctuary-soul', 'rain-blue'], sure: false } };
  assert.deepEqual(suggestBoards(item, []).boards, ['sanctuary-soul', 'rain-blue']);
  assert.deepEqual(suggestBoards({ ...item, reading: { ...item.reading, boards: ['sanctuary-soul'] }, board_odds: { 'rain-blue': 0.9 } }, []).boards, ['sanctuary-soul'],
    'SigLIP alone does not add a second board');
  assert.equal(suggestBoards({ id: 'n', embedding: null, board_odds: null, reading: null }, many), null);
  assert.equal(suggestBoards({ id: 'f0', ...many[0], board_odds: {}, reading: null }, many).boards[0], 'sunset-coast', 'an item is not its own neighbour, its look-alikes still vote');
  assert.ok(SUGGEST.fullyLearned > 0);
});

test('only what we asked the worker for is kept', () => {
  const kept = described({
    looks: { cars: 1 }, seen: ['car', 'Not A Tag!'], boards: { 'night-drive': 0.7, nightclub: 1, 'main-stage': 3 },
    embedding: like(2).concat(Array(120).fill(0)), reading: { description: `  ${'a'.repeat(300)}`, boards: ['night-drive', 'nightclub', 'night-drive', 'vhs-retro', 'main-stage'], sure: 'yes' },
  });
  assert.deepEqual(kept.seen, ['car']);
  assert.deepEqual(kept.boardOdds, { 'night-drive': 0.7, 'main-stage': 1 });
  assert.equal(kept.embedding.length, 128);
  assert.equal(kept.reading.description.length, 200);
  assert.deepEqual(kept.reading.boards, ['night-drive', 'vhs-retro']);
  assert.equal(kept.reading.sure, false);
  assert.equal(described({ embedding: [1, 2], reading: { boards: ['nightclub'] } }).embedding, null);
  assert.equal(described({ reading: { boards: ['nightclub'] } }).reading, null);
});
