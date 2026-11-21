import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
const { keywordOf } = await server.ssrLoadModule('/src/lyric-keyword.ts');
const kit = await server.ssrLoadModule('/src/type-kit.ts');
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
const finish = await server.ssrLoadModule('/src/type-finish.ts');
const windowLook = await server.ssrLoadModule('/src/window-look.ts');
await server.close();

const line = text => text.split(' ').map((word, index) => ({ text: word, startMs: index * 300, endMs: index * 300 + 280 }));
const key = text => { const words = line(text); const at = keywordOf(words); return at < 0 ? null : words[at].text; };

test('the key word is the word that carries the line, not a small word or a vocal sound, in every language we sing in', () => {
  assert.equal(key('I keep on running back to you'), 'running');
  assert.equal(key('oh yeah baby tonight'), 'tonight');
  assert.equal(key('Fecha a porta, chega mais perto'), 'perto');
  assert.equal(key('agora me beija'), 'beija');
  assert.equal(key('no te salva'), 'salva');
  assert.equal(key('je suis là pour toi mon amour'), 'amour');
  assert.equal(key('we were YOUNG and we were wild'), 'YOUNG', 'a word sung in capitals');
  assert.equal(key('fire fire in my heart'), 'fire', 'a word sung twice');
});

test('a line with nothing to set apart has no key word: one word, or only small words', () => {
  assert.equal(key('tonight'), null);
  assert.equal(key('oh oh yeah'), null);
  assert.equal(keywordOf([]), -1);
});

test('a two-tone or mixed-serif card lights the key word; without one, or when the line has none, the sung word', () => {
  const frame = (text, emphasis) => ({ words: line(text), emphasis });
  assert.equal(kit.litWords(frame('I keep on running back', 'tone'), 0)(3), true);
  assert.equal(kit.litWords(frame('I keep on running back', 'tone'), 0)(0), false);
  assert.equal(kit.litWords(frame('I keep on running back'), 0)(0), true);
  assert.equal(kit.litWords(frame('oh oh yeah', 'tone'), 1)(1), true);
  assert.equal(kit.faceOfWord(frame('I keep on running back', 'serif'), { family: 'Anton', weight: 400 })(3), kit.KEY_SERIF);
  assert.equal(kit.faceOfWord(frame('I keep on running back', 'tone'), { family: 'Anton', weight: 400 })(3).family, 'Anton');
});

test('the shelf deals key-word emphasis among its lyric cards, never two-tone on a monochrome card', () => {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  const profile = genre => ({
    version: 1,
    clip: { sourceSha256: 'e'.repeat(64), offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: 'e'.repeat(64), offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000, 3000, 4000, 5000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'love', sadness: 1, intensity: 3 } },
  });
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const library = Array.from({ length: 12 }, (_, n) => ({ id: uuid(n + 1), kind: 'photo', attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, cutoutUrl: `https://x/${n}.cut` }));
  const seen = new Set();
  for (const genre of ['Gospel', 'Techno', 'Afrobeats', 'Drill', 'General Pop']) {
    for (let generation = 0; generation < 3; generation++) {
      for (const row of pack.SHELF_ROWS) {
        for (const slot of pack.recommendRow(row.id, profile(genre), generation, [], library, false)) {
          if (!slot.typeEmphasis) continue;
          seen.add(slot.typeEmphasis);
          assert.ok(finish.TYPE_EMPHASES.includes(slot.typeEmphasis));
          assert.ok(slot.typeStyle, slot.id);
          assert.ok(!(slot.typeEmphasis === 'tone' && slot.typeAccent === finish.MONO_ACCENT), slot.id);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['serif', 'tone']);
});

test('Plum Noir is a screen for Window and Silhouette', () => {
  const plum = windowLook.paletteOf('plum');
  assert.equal(plum.screen, '#1c1418');
  assert.ok(plum.flips.every(id => windowLook.WINDOW_PALETTE_IDS.includes(id)));
});
