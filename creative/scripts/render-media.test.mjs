import assert from 'node:assert/strict';
import test from 'node:test';
import { ownMedia } from '../netlify/lib/render-media.mjs';

const photo = { photo: Buffer.from('p'), cutout: Buffer.from('c') };
const clip = { motion: Buffer.from('m') };
const names = result => Object.keys(result.parts ?? {}).sort();

// The worker takes exactly the files a card needs (check_media), so a person's picture is cut down to them.
test('a photo goes with its cut-out only where the card needs it', () => {
  assert.deepEqual(names(ownMedia('dust', photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('riso', photo)), ['cutout', 'photo']);
  assert.deepEqual(names(ownMedia('window', photo)), ['photo']);
  assert.deepEqual(names(ownMedia('filter', photo)), ['photo'], 'Our photography needs no cut-out');
  assert.deepEqual(names(ownMedia('treatment', photo)), ['photo']);
});

test('a video or GIF goes as its clip alone, and never to Dust', () => {
  for (const style of ['riso', 'window', 'filter', 'treatment']) assert.deepEqual(names(ownMedia(style, clip)), ['motion'], style);
  assert.ok(ownMedia('dust', clip).refused);
});

test('a photo with no cut-out yet is refused where the cut-out is needed', () => {
  const bare = { photo: Buffer.from('p') };
  assert.ok(ownMedia('dust', bare).refused);
  assert.deepEqual(names(ownMedia('filter', bare)), ['photo']);
});
