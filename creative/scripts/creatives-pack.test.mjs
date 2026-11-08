import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

function profile(genre = 'House', lyrics = 'hello', sha = 'a'.repeat(64), meaning) {
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
    ...(meaning && { lyricMeaning: { status: 'ready', meaning } }),
  };
}

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
  return { server, pack };
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
  const { server, pack } = await load();
  try {
    const spiritual = { attitude: 'spiritual', sadness: 0, intensity: 3 };
    const faith = pack.recommendCreativesPack(profile('Pop', 'praise the lord', 'a'.repeat(64), spiritual));
    assert.ok(faith[0].reason.startsWith('gospel'), faith[0].reason);
    const sad = pack.recommendCreativesPack(profile('Pop', 'hello', 'a'.repeat(64), { attitude: 'heartbroken', sadness: 3, intensity: 2 }));
    assert.ok(sad[0].reason.startsWith('quiet'), sad[0].reason);
    // Genre lock wins over lyrics.
    const club = pack.recommendCreativesPack(profile('Techno', 'praise the lord', 'a'.repeat(64), spiritual));
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
      for (const slot of pack.recommendCreativesPack(profile('Ambient', 'tears fall like rain tonight alone', 'a'.repeat(64), { attitude: 'lonely', sadness: 3, intensity: 2 }), gen)) {
        if (slot.bankId) assert.equal(tone.get(slot.bankId), 'deep', slot.bankId);
      }
    }
  } finally { await server.close(); }
});

test('the cover decides which backgrounds lead: warm cover → warm looks, cool cover → cool looks', async () => {
  const { server, pack } = await load();
  try {
    const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
    const read = slug => bank.find(look => look.slug === slug).read;
    const cover = (hex, extra) => ({ palette: [{ hex, share: 1 }], lightness: 0.5, saturation: 0.8, contrast: 0.5, hue: 20, warmth: 1, ...extra });
    const withCover = value => ({ ...profile('Pop'), creator: { primaryGenre: { value: 'Pop', source: 'creator' }, cover: { value, source: 'embedded_metadata' } } });
    const lead = value => pack.recommendCreativesPack(withCover(value)).slice(0, 3).map(slot => read(slot.bankId));

    const warm = lead(cover('#e1782a'));
    const cool = lead(cover('#2a3ea0', { hue: 230, warmth: 0, lightness: 0.25 }));
    assert.ok(warm.every(look => look.warmth > 0.6), 'warm cover leads with warm backgrounds');
    assert.ok(cool.every(look => look.warmth < 0.4), 'cool cover leads with cool backgrounds');

    // No cover: nothing changes, still a full pack.
    assert.equal(pack.recommendCreativesPack(profile('Pop')).length, 8);
  } finally { await server.close(); }
});

test('club songs get cards that look different: one per effect, at most two per colour family', async () => {
  const { server, pack } = await load();
  try {
    const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
    const { colorFamily, effectFamily } = await server.ssrLoadModule('/src/look-fit.ts');
    const look = slug => bank.find(item => item.slug === slug);
    for (const genre of ['House', 'Techno', 'Slap House', 'EDM']) {
      for (let generation = 0; generation < 12; generation++) {
        const cards = pack.recommendCreativesPack(profile(genre, 'hello', 'b'.repeat(64)), generation).filter(slot => slot.bankId);
        const backgrounds = cards.map(slot => look(slot.bankId));
        const effects = backgrounds.map(item => effectFamily(item.slug));
        assert.equal(new Set(effects).size, effects.length, `${genre} #${generation} repeats an effect: ${effects}`);
        const families = backgrounds.map(item => colorFamily(item.read));
        const counts = families.reduce((all, name) => ({ ...all, [name]: (all[name] ?? 0) + 1 }), {});
        assert.ok(Math.max(...Object.values(counts)) <= 2, `${genre} #${generation} leans on one colour: ${JSON.stringify(counts)}`);
        assert.ok(new Set(families).size >= 4, `${genre} #${generation} has too few colour families: ${families}`);
      }
    }
  } finally { await server.close(); }
});

test('the lyrics grade the colours and calm the beat without changing the look', async () => {
  const { server, pack } = await load();
  try {
    const sha = 'a'.repeat(64);
    const plain = pack.recommendCreativesPack(profile('Slap House', 'hello', sha));
    // Words that say nothing change nothing.
    assert.ok(plain.every(slot => !slot.grade));
    const neutral = pack.recommendCreativesPack(profile('Slap House', 'hello', sha, { attitude: 'neutral', sadness: 0, intensity: 3 }));
    assert.deepEqual(neutral.map(slot => slot.id), plain.map(slot => slot.id));
    assert.ok(neutral.every(slot => !slot.grade));

    // Sad words on a club song: same lane and looks, sadder colours, calmer hits.
    const sad = pack.recommendCreativesPack(profile('Slap House', 'hello', sha, { attitude: 'heartbroken', sadness: 3, intensity: 2 }));
    assert.ok(sad.every(slot => slot.reason.startsWith('techno')));
    const grade = sad[0].grade;
    assert.ok(grade.saturation < 1 && grade.warmth < 0 && grade.brightness < 1 && grade.calm > 0.5, JSON.stringify(grade));
    assert.ok(sad.every(slot => slot.grade === grade));

    // Defiant and forceful: warmer, punchier, no calming.
    const defiant = pack.recommendCreativesPack(profile('Slap House', 'hello', sha, { attitude: 'defiant', sadness: 0, intensity: 4 }))[0].grade;
    assert.ok(defiant.warmth > 0 && defiant.contrast > 1 && defiant.calm === 0, JSON.stringify(defiant));
  } finally { await server.close(); }
});
