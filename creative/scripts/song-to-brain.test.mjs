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
    videoType: 'lyric',
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
    mood: await server.ssrLoadModule('/src/lyric-mood.ts'),
    pack: await server.ssrLoadModule('/src/creatives-pack.ts'),
    vision: await server.ssrLoadModule('/src/vision-music-profile.ts'),
    text: await server.ssrLoadModule('/src/lyric-text.ts'),
  };
}

test('what the song says shapes the mood in English, Portuguese, Spanish and French', async () => {
  const { server, mood } = await load();
  try {
    const read = (text, language) => mood.lyricMood(cuesFor(text), language);
    assert.equal(read('praise the lord for his grace and mercy', 'en').theme, 'faith');
    assert.equal(read('louvado seja o Senhor Deus gloria e graça', 'pt').theme, 'faith');
    assert.equal(read('gloria a Dios alabanza y gracia', 'es').theme, 'faith');
    assert.equal(read('pleurer seul dans la nuit froide larmes', 'fr').theme, 'sorrow');
    // Accents never block a match.
    assert.equal(read('meu coração minha paixão amor', 'pt').theme, 'love');
    // A language we have no word list for says so, instead of pretending to have read it.
    const ja = read('夜に泣いている 一人', 'ja');
    assert.deepEqual([ja.theme, ja.read], ['neutral', false]);
    assert.equal(read('hello there friend', 'en').read, true);
  } finally { await server.close(); }
});

test('the language travels with the lyrics into the recommendation', async () => {
  const { server, pack } = await load();
  try {
    const faith = 'louvado seja o Senhor Deus gloria e graça';
    const lane = slots => slots[0].reason.split(' · ')[0];
    assert.equal(lane(pack.recommendCreativesPack(profile(faith, { language: 'pt' }))), 'gospel');
    // Same words read as English find nothing, so the lane must differ — proof the language is used.
    assert.notEqual(lane(pack.recommendCreativesPack(profile(faith, { language: 'en' }))), 'gospel');
    // Typed or heard makes no difference to the recommendation.
    assert.deepEqual(
      pack.recommendCreativesPack(profile(faith, { language: 'pt', origin: 'typed' })).map(slot => slot.id),
      pack.recommendCreativesPack(profile(faith, { language: 'pt', origin: 'transcribed' })).map(slot => slot.id),
    );
  } finally { await server.close(); }
});

test('the director gets every phrase, not the first 40 words', async () => {
  const { server, vision } = await load();
  try {
    const words = Array.from({ length: 110 }, (_, i) => `w${i}`).join(' ');
    const built = vision.buildVisionMusicProfile(profile(words, { step: 130 }));
    assert.ok(built.lyricCues.length > 0 && built.lyricCues.length <= 40);
    assert.equal(built.lyricCues.flatMap(cue => cue.text.split(' ')).length, 110);
    assert.ok(built.lyricCues.at(-1).endMs <= 15000);
    assert.equal(built.creator.primaryGenre, 'Pop');
    // Unspaced scripts are not split with invented spaces.
    const ja = vision.buildVisionMusicProfile(profile('夜 に 泣 い て', { language: 'ja' }));
    assert.equal(ja.lyricCues[0].text, '夜に泣いて');
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
