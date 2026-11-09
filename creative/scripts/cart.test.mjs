import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { readCarts, writeCarts, cartFor, addItem, dropItems, songKeyOf, CART_LIMIT, CART_SONGS } = await server.ssrLoadModule('/src/cart.ts');
await server.close();

const THUMB = `data:image/jpeg;base64,${'/9j/4AAQ'.repeat(50)}`;
const item = (id, row = 'pulise') => ({ id, row, slot: { id, row, label: 'x' }, lyrics: true, uploadId: null, generation: 0, thumb: THUMB });
const cartOf = (carts, key) => cartFor(carts, key).map(held => held.id);

test('a saved cart comes back with its pictures', () => {
  const carts = [{ songKey: 'song:0', items: [item('a'), item('b', 'dust'), item('c', 'riso'), item('d', 'spray'), item('e', 'window')] }];
  assert.deepEqual(readCarts(writeCarts(carts)), carts);
});

test('the key of a cart is the song and where the clip starts', () => {
  assert.equal(songKeyOf('abc', 1500), 'abc:1500');
});

test('each song and clip keeps its own cart, so moving the clip never empties another', () => {
  let carts = [];
  carts = addItem(carts, 'song:0', item('a'));
  carts = addItem(carts, 'song:1500', item('b'));
  carts = addItem(carts, 'song:0', item('c'));
  assert.deepEqual(cartOf(carts, 'song:0'), ['a', 'c']);
  assert.deepEqual(cartOf(carts, 'song:1500'), ['b']);
  assert.deepEqual(cartOf(readCarts(writeCarts(carts)), 'song:1500'), ['b']);
  assert.deepEqual(cartOf(carts, 'other:0'), []);
});

test('only the last few songs are kept, the one touched longest ago goes first', () => {
  let carts = [];
  for (let i = 0; i < CART_SONGS; i++) carts = addItem(carts, `s${i}:0`, item(`i${i}`));
  carts = addItem(carts, 's0:0', item('more'));
  carts = addItem(carts, 'new:0', item('fresh'));
  assert.equal(carts.length, CART_SONGS);
  assert.deepEqual(cartOf(carts, 's1:0'), []);
  assert.deepEqual(cartOf(carts, 's0:0'), ['i0', 'more']);
  assert.deepEqual(cartOf(carts, 'new:0'), ['fresh']);
  assert.equal(readCarts(writeCarts([...carts, { songKey: 'x:0', items: [item('x')] }])).length, CART_SONGS);
});

test('an item is added once, never without a song, never past the limit', () => {
  let carts = addItem([], 's:0', item('a'));
  assert.equal(addItem(carts, 's:0', item('a')), carts);
  assert.deepEqual(addItem([], '', item('a')), []);
  for (let i = 0; i < CART_LIMIT; i++) carts = addItem(carts, 's:0', item(`i${i}`));
  assert.equal(cartFor(carts, 's:0').length, CART_LIMIT);
});

test('taking items out leaves the rest, and an empty cart disappears', () => {
  let carts = addItem(addItem(addItem([], 's:0', item('a')), 's:0', item('b')), 't:0', item('c'));
  carts = dropItems(carts, 's:0', ['a', 'missing']);
  assert.deepEqual(cartOf(carts, 's:0'), ['b']);
  carts = dropItems(carts, 's:0', ['b']);
  assert.deepEqual(carts.map(entry => entry.songKey), ['t:0']);
  assert.equal(dropItems(carts, 'nowhere:0', ['c']), carts);
});

test('nothing saved, damaged or from an old version is no carts', () => {
  assert.deepEqual(readCarts(null), []);
  assert.deepEqual(readCarts('{nope'), []);
  assert.deepEqual(readCarts(JSON.stringify({ version: 1, songKey: 's', items: [item('a')] })), []);
  // Version 2 carts hold Our photography cards drawn by a live filter, which no longer exists.
  assert.deepEqual(readCarts(JSON.stringify({ version: 2, carts: [{ songKey: 's:0', items: [item('a')] }] })), []);
  // Version 3 carts may hold Moving backgrounds cards, a row that is no longer on the shelf.
  assert.deepEqual(readCarts(JSON.stringify({ version: 3, carts: [{ songKey: 's:0', items: [item('a', 'looks')] }] })), []);
  assert.deepEqual(readCarts(JSON.stringify({ version: 5, carts: 'x' })), []);
});

test('one damaged cart is dropped without costing the others', () => {
  const bad = (change) => ({ songKey: 'bad:0', items: [{ ...item('b'), ...change }] });
  const good = { songKey: 'good:0', items: [item('a')] };
  for (const damage of [{ thumb: undefined }, { thumb: 'data:image/png;base64,AAAA' }, { thumb: `data:image/jpeg;base64,${'A'.repeat(70_000)}` }, { row: 'nowhere' }, { row: 'looks' }, { id: 7 }]) {
    assert.deepEqual(readCarts(writeCarts([bad(damage), good])), [good]);
  }
  assert.deepEqual(readCarts(JSON.stringify({ version: 5, carts: [{ songKey: 'e:0', items: [] }, good, good] })), [good]);
});

test('a cart over the limit is not trusted', () => {
  const items = Array.from({ length: CART_LIMIT + 1 }, (_, i) => item(`i${i}`));
  assert.deepEqual(readCarts(writeCarts([{ songKey: 's', items }])), []);
});
