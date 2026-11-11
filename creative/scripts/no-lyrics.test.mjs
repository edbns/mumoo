import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { validFeedback } from '../netlify/lib/feedback.mjs';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
const composition = await server.ssrLoadModule('/src/composition.ts');
await server.close();

test('a song with no words shows only the rows that work without them', () => {
  assert.deepEqual(pack.rowsFor(true).map(row => row.id), ['photography', 'thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'riso', 'dust']);
  assert.ok(pack.rowsFor(true).every(row => row.lyrics === 'switch'), 'none of them is made of the lyrics');
  assert.deepEqual(pack.rowsFor(false).map(row => row.id), pack.SHELF_ROWS.map(row => row.id), 'with words, every row');
  assert.ok(pack.rowsFor(true).length < pack.rowsFor(false).length);
});

test('with no words the page still deals a hand: no lyrics and no reading of them are needed', () => {
  const sha = 'd'.repeat(64);
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  const profile = {
    version: 1, noLyrics: true,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: 'Electronic & Dance', source: 'creator' }, subGenre: { value: 'Ambient', source: 'creator' } },
    musicAnalysis: {
      status: 'ready', clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 90, gridBpm: 90, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
  };
  // Thermal and Halftone are drawn on library pictures, so they get a small library here.
  const library = ['a', 'b', 'c', 'd'].map(id => ({ id, kind: 'photo', attitudes: ['neutral'], tags: [], genre: null, subGenre: null, url: `/${id}.jpg` }));
  for (const row of pack.rowsFor(true)) assert.equal(pack.recommendRow(row.id, profile, 0, [], null, library).length, 4, row.id);
  assert.doesNotThrow(() => composition.validate({ sourceSha256: sha, clipStartMs: 0, cues: [] }, 60000), 'a clip with no cues is a valid clip');
});

test('the brain can tell a song with no words from one whose words were never read', () => {
  const body = {
    version: 1, event: 'play', clipSha256: 'e'.repeat(64), primaryGenre: 'Electronic & Dance', subGenre: 'Ambient', vibe: 'Ambient/Mellow', lane: 'quiet',
    language: null, lyricsOrigin: 'none', lyricAttitude: null, lyricSadness: null, lyricIntensity: null, row: 'photography',
    slot: { id: 'ad-photography-x', style: 'filter', font: 'Anton', fontSecondary: 'Anton' },
  };
  assert.equal(validFeedback(body), true);
  assert.equal(validFeedback({ ...body, lyricsOrigin: 'guessed' }), false);
});
