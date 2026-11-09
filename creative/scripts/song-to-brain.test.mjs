import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

/**
 * Everything we learn about a song must reach the brain: genre, tags, how it sounds, what it says,
 * in which language. These tests pin that contract at the data level (no browser, no network).
 */
const SHA = 'a'.repeat(64);
const frames = Array.from({ length: 20 }, (_, i) => ({
  timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 1200, bandwidthHz: 500, rolloffHz: 3000,
}));

function cuesFor(text, step = 400) {
  return text.split(' ').map((word, i) => ({ text: word, startMs: i * step, endMs: i * step + step - 20 }));
}

function profile(text, { language, genre = 'Pop', origin = 'transcribed', step } = {}) {
  const clip = { sourceSha256: SHA, offsetMs: 0, durationMs: 15000 };
  return {
    version: 1,
    clip,
    creator: { primaryGenre: { value: genre, source: 'creator' }, title: { value: 'Fogo', source: 'embedded_metadata' } },
    musicAnalysis: {
      status: 'ready',
      clip,
      result: {
        clip: { offsetMs: 0, durationMs: 15000, sha256: SHA },
        rhythm: { tempo: { status: 'estimated', bpm: 100, gridBpm: 100, alternativesBpm: [] }, beatsMs: [1000, 2000], downbeatsMs: [] },
        features: { transientsMs: [500, 1500], frames },
      },
    },
    approvedLyrics: { cues: cuesFor(text, step), source: 'creator_reviewed', origin, ...(language && { language }) },
  };
}

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return {
    server,
    meaning: await server.ssrLoadModule('/src/lyric-meaning.ts'),
    pack: await server.ssrLoadModule('/src/creatives-pack.ts'),
    text: await server.ssrLoadModule('/src/lyric-text.ts'),
  };
}

test('the model\'s answer is validated, never guessed at', async () => {
  const { server, meaning } = await load();
  try {
    const good = { version: 1, clarity: 'clear', attitude: 'defiant', sadness: 0, intensity: 4, gist: 'ignored' };
    assert.deepEqual(meaning.parseLyricMeaning(good), { attitude: 'defiant', sadness: 0, intensity: 4 });
    // A clip with too little to read says so, and means nothing.
    assert.deepEqual(meaning.parseLyricMeaning({ ...good, clarity: 'thin', attitude: 'flirty' }), meaning.NEUTRAL_MEANING);
    for (const bad of [null, {}, { ...good, version: 2 }, { ...good, attitude: 'furious' }, { ...good, sadness: 4 },
      { ...good, sadness: 1.5 }, { ...good, intensity: 0 }, { ...good, intensity: '3' }]) {
      assert.equal(meaning.parseLyricMeaning(bad), null, JSON.stringify(bad));
    }
  } finally { await server.close(); }
});

/** The Moving backgrounds row stands for the shelf: every row reads the song the same way. */
const recommend = (pack, person) => pack.recommendRow('looks', person, 0);

test('what the words mean shapes the recommendation, in any language', async () => {
  const { server, pack } = await load();
  try {
    const lane = slots => slots[0].reason.split(' · ')[0];
    const read = (attitude, sadness = 0, intensity = 3) => ({ status: 'ready', meaning: { attitude, sadness, intensity } });
    const words = 'louvado seja o Senhor Deus gloria e graça';
    const withMeaning = (state, options) => ({ ...profile(words, options), lyricMeaning: state });
    assert.equal(lane(recommend(pack, withMeaning(read('spiritual'), { language: 'pt' }))), 'gospel');
    // Until the words are read, the brain only has the sound.
    assert.notEqual(lane(recommend(pack, withMeaning(undefined, { language: 'pt' }))), 'gospel');
    assert.notEqual(lane(recommend(pack, withMeaning({ status: 'error' }, { language: 'pt' }))), 'gospel');
    // Typed or heard makes no difference to the recommendation.
    assert.deepEqual(
      recommend(pack, withMeaning(read('spiritual'), { language: 'pt', origin: 'typed' })).map(slot => slot.id),
      recommend(pack, withMeaning(read('spiritual'), { language: 'pt', origin: 'transcribed' })).map(slot => slot.id),
    );
  } finally { await server.close(); }
});

test('lyric text helpers handle spaced and unspaced scripts', async () => {
  const { server, text } = await load();
  try {
    assert.deepEqual(text.tokenizeLyrics('Hold my hand, tonight!\n\nAmen'), [['Hold', 'my', 'hand', 'tonight'], ['Amen']]);
    assert.deepEqual(text.tokenizeLyrics('¡Gloria a Dios!'), [['Gloria', 'a', 'Dios']]);
    assert.deepEqual(text.tokenizeLyrics('夜に泣いている')[0].join(''), '夜に泣いている');
    assert.equal(text.joinWords(['夜', 'に', '泣', 'い', 'て']), '夜に泣いて');
    assert.equal(text.joinWords(['hold', 'my', 'hand']), 'hold my hand');
  } finally { await server.close(); }
});
