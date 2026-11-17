/**
 * Typewriter: every phrase is typed on rows of its own, inside the page, key by key as it is sung; the same seed types the same page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { typedPage, typedChars } = await server.ssrLoadModule('/src/pack-typewriter.ts');
const { WIDTH, HEIGHT } = await server.ssrLoadModule('/src/composition.ts');
await server.close();

const LYRICS = 'I keep on running back to you | every night the city calls my name | hold me close until the morning | we were young and we were wild | dancing on the edge of something | never let the music stop';
const CUES = LYRICS.split(' | ').flatMap((line, row) => line.split(' ').map((text, k) => ({ text, startMs: row * 2000 + k * 300, endMs: row * 2000 + k * 300 + 280 })));
const CHAR = 30;

test('each phrase is typed on rows no other phrase uses, inside the page', () => {
  for (const seed of [1, 42, 777, 123456]) {
    const { lines } = typedPage(CUES, seed, CHAR);
    const rows = lines.map(line => Math.round(line.y / 66));
    assert.equal(new Set(rows).size, rows.length, `seed ${seed}: two lines share a row`);
    for (const line of lines) {
      assert.ok(line.x >= 0 && line.x + line.text.length * CHAR <= WIDTH, `seed ${seed}: "${line.text}" runs off the side`);
      assert.ok(line.y > 0 && line.y < HEIGHT - 200, `seed ${seed}: "${line.text}" is off the page`);
    }
  }
});

test('the lines of a phrase are its text, in order', () => {
  const { phrases, lines } = typedPage(CUES, 42, CHAR);
  phrases.forEach((phrase, index) => {
    const own = lines.filter(line => line.phrase === index);
    for (const line of own) assert.equal(phrase.text.slice(line.from, line.from + line.text.length), line.text);
    assert.equal(own.map(line => line.text).join(' '), phrase.text);
  });
});

test('a phrase is typed key by key as it is sung, and stays typed', () => {
  const { phrases } = typedPage(CUES, 42, CHAR);
  const first = phrases[0];
  assert.equal(typedChars(first, -1), 0);
  let last = 0;
  for (let ms = 0; ms < 4000; ms += 20) {
    const count = typedChars(first, ms);
    assert.ok(count >= last, 'typing never goes back');
    last = count;
  }
  assert.equal(last, first.text.length);
});

test('the same seed types the same page; no lyrics, no typing', () => {
  assert.deepEqual(typedPage(CUES, 9, CHAR), typedPage(CUES, 9, CHAR));
  assert.notDeepEqual(typedPage(CUES, 9, CHAR).lines, typedPage(CUES, 10, CHAR).lines);
  assert.deepEqual(typedPage([], 9, CHAR), { phrases: [], lines: [] });
});
