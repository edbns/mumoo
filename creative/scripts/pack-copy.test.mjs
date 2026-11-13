import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { activePackCopy } = await server.ssrLoadModule('/src/pack-copy.ts');
await server.close();

const FPS = 30;
const at = ms => Math.round(ms * FPS / 1000);
const cues = [
  { text: 'ما', startMs: 3000, endMs: 3300 },
  { text: 'تسألني', startMs: 3350, endMs: 3800 },
  { text: 'وين', startMs: 3850, endMs: 4300 },
  { text: 'الليلة', startMs: 6000, endMs: 6500 },
  { text: 'tonight', startMs: 6550, endMs: 7000 },
];

test('a creative shows only the song\'s own words: none before the first, the last line held between lines', () => {
  assert.deepEqual(activePackCopy(cues, at(500)), { phrase: '', word: '', wordStartMs: 0, words: [] }, 'nothing before the first word');
  assert.equal(activePackCopy(cues, at(3500)).word, 'تسألني');
  const gap = activePackCopy(cues, at(5000));
  assert.equal(gap.phrase, 'ما تسألني وين', 'the line just sung stays up through the gap');
  assert.equal(gap.word, 'وين', 'on its last word');
  assert.equal(gap.wordStartMs, 3850, 'held, not entering again');
  assert.equal(activePackCopy(cues, at(6200)).word, 'الليلة');
  assert.equal(activePackCopy(cues, at(14_000)).phrase, 'الليلة TONIGHT', 'the last line stays to the end');

  const sung = new Set(cues.map(cue => cue.text.toLocaleUpperCase()));
  for (let frame = 0; frame < 15 * FPS; frame += 1) {
    const copy = activePackCopy(cues, frame);
    for (const word of copy.phrase.split(' ').filter(Boolean)) assert.ok(sung.has(word), `frame ${frame}: "${word}" is not in the lyrics`);
    for (const word of copy.words) assert.ok(cues.includes(word), `frame ${frame}: a word that is not a cue`);
  }
  assert.deepEqual(activePackCopy([], at(5000)).words, [], 'no lyrics, no words: never a title, an artist or a stand-in');
});
