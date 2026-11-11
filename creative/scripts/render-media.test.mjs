import assert from 'node:assert/strict';
import test from 'node:test';
import { ownMedia } from '../netlify/lib/render-media.mjs';

const photo = { use: 'any', photo: Buffer.from('p'), cutout: Buffer.from('c') };
const clip = { use: 'any', photo: Buffer.from('p'), motion: Buffer.from('m') };
const names = result => Object.keys(result.parts ?? {}).sort();

// The worker takes exactly the files a card needs (check_media), so the shelf's one picture is cut down to them.
test('a photo kept for the shelf goes with its cut-out only where the card needs it', () => {
  assert.deepEqual(names(ownMedia('dust', undefined, photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('riso', undefined, photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('window', undefined, photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('filter', 'depth-fog', photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('filter', 'thermal-1', photo)), ['photo'], 'Our photography and the plain looks need no cut-out');
  assert.deepEqual(names(ownMedia('filter', undefined, photo)), ['photo']);
});

test('a video or GIF kept for the shelf goes as its clip alone, and never to Dust or Depth', () => {
  for (const [style, look] of [['riso'], ['window'], ['filter', 'thermal-1'], ['filter']]) assert.deepEqual(names(ownMedia(style, look, clip)), ['motion'], style);
  assert.ok(ownMedia('dust', undefined, clip).refused);
  assert.ok(ownMedia('filter', 'depth-fog', clip).refused);
});

test('a photo with no cut-out yet is refused where the cut-out is needed', () => {
  const bare = { use: 'any', photo: Buffer.from('p') };
  assert.ok(ownMedia('dust', undefined, bare).refused);
  assert.deepEqual(names(ownMedia('filter', 'ascii-1', bare)), ['photo']);
});

test('the older one-picture-per-row uploads keep working as they did', () => {
  assert.deepEqual(names(ownMedia('dust', undefined, { use: 'dust', photo: Buffer.from('p'), cutout: Buffer.from('c') })), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('filter', 'thermal-1', { use: 'thermal', photo: Buffer.from('p') })), ['photo']);
  assert.ok(ownMedia('riso', undefined, { use: 'dust', photo: Buffer.from('p') }).refused, 'kept for a different style');
});
