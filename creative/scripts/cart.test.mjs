import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { readCart, writeCart, CART_LIMIT } = await server.ssrLoadModule('/src/cart.ts');
await server.close();

const item = (id, row = 'pulise') => ({ id, row, slot: { id, row, label: 'x' }, lyrics: true, uploadId: null, generation: 0 });

test('a saved cart comes back for the same song', () => {
  const items = [item('a'), item('b', 'dust')];
  assert.deepEqual(readCart(writeCart('song:0', items), 'song:0'), items);
});

test('another song or clip starts with an empty cart', () => {
  assert.deepEqual(readCart(writeCart('song:0', [item('a')]), 'song:1500'), []);
});

test('nothing saved, damaged or from an old version is an empty cart', () => {
  assert.deepEqual(readCart(null, 's'), []);
  assert.deepEqual(readCart('{nope', 's'), []);
  assert.deepEqual(readCart(JSON.stringify({ version: 0, songKey: 's', items: [item('a')] }), 's'), []);
  assert.deepEqual(readCart(JSON.stringify({ version: 1, songKey: 's', items: [{ id: 'a' }] }), 's'), []);
  assert.deepEqual(readCart(JSON.stringify({ version: 1, songKey: 's', items: [item('a', 'nowhere')] }), 's'), []);
});

test('a cart over the limit is not trusted', () => {
  const items = Array.from({ length: CART_LIMIT + 1 }, (_, i) => item(`i${i}`));
  assert.deepEqual(readCart(writeCart('s', items), 's'), []);
});
