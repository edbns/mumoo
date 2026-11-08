import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

function profile(genre = 'House', lyrics = 'hello', sha = 'a'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({
    timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000,
  }));
  const cues = lyrics.split(' ').map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 380 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues, source: 'creator_reviewed' },
  };
}

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
  const mood = await server.ssrLoadModule('/src/lyric-mood.ts');
  return { server, pack, mood };
}

test('pack is 8 cards with distinct background + type pairs', async () => {
  const { server, pack } = await load();
  try {
    for (const genre of ['Gospel', 'Slap House', 'Pop', 'Ambient']) {
      const slots = pack.recommendCreativesPack(profile(genre));
      assert.equal(slots.length, 8, genre);
      const bank = slots.filter(slot => slot.bankId);
      const pairs = new Set(bank.map(slot => `${slot.bankId}:${slot.typeStyle}`));
      assert.equal(pairs.size, bank.length, `${genre} repeats a background+type pair`);
      assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length, `${genre} repeats an id`);
    }
  } finally { await server.close(); }
});

test('the brain matches type to mood (gospel is never stack/outline, club never minimal)', async () => {
  const { server, pack } = await load();
  try {
    const gospel = pack.recommendCreativesPack(profile('Gospel')).filter(slot => slot.typeStyle);
    for (const slot of gospel) assert.ok(['editorial', 'minimal', 'typewriter', 'karaoke'].includes(slot.typeStyle), slot.typeStyle);
    const club = pack.recommendCreativesPack(profile('Slap House')).filter(slot => slot.typeStyle);
    for (const slot of club) assert.ok(['stack', 'outline', 'karaoke', 'typewriter'].includes(slot.typeStyle), slot.typeStyle);
  } finally { await server.close(); }
});

test('lyrics steer the lane when genre does not lock it', async () => {
  const { server, pack, mood } = await load();
  try {
    assert.equal(mood.lyricMood([{ text: 'praise the lord for his grace and mercy' }]).theme, 'faith');
    assert.equal(mood.lyricMood([{ text: 'we are tonight' }]).theme, 'neutral');
    const faith = pack.recommendCreativesPack(profile('Pop', 'praise the lord for his grace and mercy'));
    assert.ok(faith[0].reason.startsWith('gospel'), faith[0].reason);
    // Genre lock wins over lyrics.
    const club = pack.recommendCreativesPack(profile('Techno', 'praise the lord for his grace and mercy'));
    assert.ok(club[0].reason.startsWith('techno'), club[0].reason);
  } finally { await server.close(); }
});

test('seeded: stable for same input, different across generations and songs', async () => {
  const { server, pack } = await load();
  try {
    const key = slots => slots.map(slot => slot.id).join('|');
    const a = pack.recommendCreativesPack(profile('Pop'), 0);
    assert.equal(key(a), key(pack.recommendCreativesPack(profile('Pop'), 0)));
    assert.notEqual(key(a), key(pack.recommendCreativesPack(profile('Pop'), 1)));
    assert.notEqual(key(a), key(pack.recommendCreativesPack(profile('Pop', 'hello', 'b'.repeat(64)), 0)));
  } finally { await server.close(); }
});

test('club songs keep club fonts', async () => {
  const { server, pack } = await load();
  try {
    const club = new Set(['Anton', 'Bebas Neue', 'Audiowide', 'Rubik Mono One', 'Archivo Black', 'Dela Gothic One']);
    for (const slot of pack.recommendCreativesPack(profile('Slap House'))) {
      assert.ok(club.has(slot.font), slot.font);
      assert.ok(club.has(slot.fontSecondary), slot.fontSecondary);
    }
  } finally { await server.close(); }
});

test('sad lyrics never land on a bright background', async () => {
  const { server, pack } = await load();
  try {
    const bank = (await import('../src/look-lab/bank.json', { with: { type: 'json' } })).default;
    const tone = new Map(bank.map(item => [item.slug, item.tone]));
    for (const gen of [0, 1, 2]) {
      for (const slot of pack.recommendCreativesPack(profile('Ambient', 'tears fall like rain tonight alone'), gen)) {
        if (slot.bankId) assert.equal(tone.get(slot.bankId), 'deep', slot.bankId);
      }
    }
  } finally { await server.close(); }
});
