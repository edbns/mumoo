import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    const good = { version: 1, clarity: 'clear', attitude: 'confident', sadness: 0, intensity: 4, gist: 'ignored' };
    assert.deepEqual(meaning.parseLyricMeaning(good), { attitude: 'confident', sadness: 0, intensity: 4 });
    // Fun carries no sadness, swagger and anger at most a little, whatever the model says; sorrowful moods keep theirs.
    assert.equal(meaning.parseLyricMeaning({ ...good, attitude: 'fun', sadness: 2 }).sadness, 0);
    for (const attitude of ['confident', 'angry']) {
      assert.equal(meaning.parseLyricMeaning({ ...good, attitude, sadness: 3 }).sadness, 1, `${attitude} keeps at most a little hurt`);
      assert.equal(meaning.parseLyricMeaning({ ...good, attitude, sadness: 0 }).sadness, 0);
    }
    assert.equal(meaning.parseLyricMeaning({ ...good, attitude: 'sad', sadness: 3 }).sadness, 3);
    assert.equal(meaning.parseLyricMeaning({ ...good, attitude: 'thoughtful', sadness: 2 }).sadness, 2);
    // A reader not yet redeployed still speaks the old moods: each is folded into its new one.
    for (const [old, now] of [['joyful', 'happy'], ['playful', 'fun'], ['romantic', 'love'], ['defiant', 'confident'], ['menacing', 'angry'], ['lonely', 'sad'], ['nostalgic', 'thoughtful']]) {
      assert.equal(meaning.parseLyricMeaning({ ...good, attitude: old }).attitude, now, old);
    }
    // A clip with too little to read says so, and means nothing.
    assert.deepEqual(meaning.parseLyricMeaning({ ...good, clarity: 'thin', attitude: 'flirty' }), meaning.NEUTRAL_MEANING);
    for (const bad of [null, {}, { ...good, version: 2 }, { ...good, attitude: 'furious' }, { ...good, sadness: 4 },
      { ...good, sadness: 1.5 }, { ...good, intensity: 0 }, { ...good, intensity: '3' }]) {
      assert.equal(meaning.parseLyricMeaning(bad), null, JSON.stringify(bad));
    }
  } finally { await server.close(); }
});

test('the extra moods and the themes only add to a reading: unknown codes are dropped, never a reason to refuse it', async () => {
  const { server, meaning } = await load();
  try {
    const good = { version: 1, clarity: 'clear', attitude: 'flirty', sadness: 0, intensity: 3 };
    assert.deepEqual(meaning.parseLyricMeaning({ ...good, moods: ['fun', 'love'], themes: ['seduction', 'romance', 'nightlife'] }),
      { attitude: 'flirty', sadness: 0, intensity: 3, moods: ['fun', 'love'], themes: ['seduction', 'romance', 'nightlife'] });
    // The main mood, neutral and repeats say nothing more; old codes fold into the new moods; at most two moods and three themes.
    assert.deepEqual(meaning.parseLyricMeaning({ ...good, moods: ['flirty', 'neutral', 'playful', 'fun', 'tender', 'sad'] }).moods, ['fun', 'love']);
    assert.deepEqual(meaning.parseLyricMeaning({ ...good, themes: ['party', 'party', 'weather', 'constructor', 'money', 'cars', 'fame'] }).themes, ['party', 'money', 'cars']);
    // A reader not yet redeployed sends neither, and an empty or broken list leaves the reading as it was.
    for (const extra of [{}, { moods: [], themes: [] }, { moods: 'fun', themes: null }, { moods: ['furious'], themes: [7] }]) {
      assert.deepEqual(meaning.parseLyricMeaning({ ...good, ...extra }), { attitude: 'flirty', sadness: 0, intensity: 3 }, JSON.stringify(extra));
    }
  } finally { await server.close(); }
});

test('the lyric reader and the app share one list of themes, and a freely typed tag finds its theme', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { THEMES, tagShows, themesShown } = await server.ssrLoadModule('/src/song-themes.ts');
    const reader = readFileSync(new URL('../../audio-intelligence/modal_lyric_meaning_staging.py', import.meta.url), 'utf8');
    const listed = [...reader.match(/^THEMES = \[([^\]]*)\]/m)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(listed, THEMES);
    for (const [tag, theme] of [['beautiful woman', 'seduction'], ['breakdancing', 'dancing'], ['street dance', 'street'], ['neon red', 'nightlife'],
      ['beach', 'summer'], ['sunset', 'summer'], ['couple', 'romance'], ['romantic', 'romance'], ['group of girls', 'friends'], ['sports cars', 'cars'], ['spiritual', 'faith'],
      ['female', 'seduction'], ['woman', 'seduction'], ['guys', 'friends'], ['dj', 'fame']]) {
      assert.ok(tagShows(tag, theme), `${tag} shows ${theme}`);
    }
    // Short words only count as words of their own: a scarf is not a car, a sunday is not summer, a woman is not a man.
    for (const [tag, theme] of [['scarf', 'cars'], ['sunday', 'summer'], ['barefoot', 'nightlife'], ['woman', 'friends']]) {
      assert.ok(!tagShows(tag, theme), `${tag} does not show ${theme}`);
    }
    assert.equal(themesShown(['beach', 'couple', 'neon'], ['summer', 'romance', 'money']), 2);
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
