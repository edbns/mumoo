import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
const { typeColours } = await server.ssrLoadModule('/src/pack-palette.ts');
const { MONO_ACCENT, MOOD_ACCENTS } = await server.ssrLoadModule('/src/type-finish.ts');
await server.close();

const lum = hex => {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const palette = extra => ({ ink: '#f7f4ee', light: true, hue: 210, accent: '#5aa9ff', scrim: { color: '#000000', alpha: 0 }, luma: 0.04, range: [0, 1], ...extra });

test("the ink is plain off-white or near-black, never tinted by the picture; the song's colour reads (3:1) and letters on its box read (3:1, large type)", () => {
  for (const [luma, light, ink] of [[0.02, true, '#f7f4ee'], [0.12, true, '#f7f4ee'], [0.7, false, '#0d0d12'], [0.45, false, '#0d0d12']]) {
    for (const hue of [0, 45, 120, 210, 300, null]) {
      for (const mood of ['#e5383b', '#ff4fa3', '#5c6b54', '#c6ff00']) {
        const colours = typeColours(palette({ luma, light, ink, hue }), mood);
        assert.equal(colours.ink, ink, `hue ${hue} on ${luma} tinted the ink`);
        assert.ok(ratio(lum(colours.accent), luma) >= 3, `accent ${colours.accent} on ${luma}`);
        assert.ok(ratio(lum(colours.onAccent), lum(colours.accent)) >= 3, `${colours.onAccent} on ${colours.accent}`);
      }
    }
  }
});

test("the picture's own colours never reach the letters: a blue pool and orange skin give the song's colour, or monochrome", () => {
  const pool = palette({ hue: 200, accent: '#5aa9ff' });
  assert.notEqual(typeColours(pool, '#e5383b').accent, '#5aa9ff');
  assert.equal(typeColours(pool).accent, pool.ink, 'no song colour: monochrome');
  assert.equal(typeColours(pool, MONO_ACCENT).accent, pool.ink, 'the mono colour keeps the card monochrome');
  const red = typeColours(palette({ hue: 30 }), '#e5383b').accent;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(red.slice(i, i + 2), 16));
  assert.ok(r > g * 1.5 && r > b * 1.5, `${red} is still a red`);
});

test('the lyric colours are editorial: every lane has the monochrome card and no sky blue or cyan', () => {
  for (const [lane, colours] of Object.entries(MOOD_ACCENTS)) {
    assert.ok(colours.includes(MONO_ACCENT), lane);
    for (const colour of colours) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
      assert.ok(!(b > r + 40 && b >= g - 10), `${lane} ${colour} is a blue`);
    }
  }
});

test('the same palette always gives the same colours (the preview and the cloud agree)', () => {
  const a = typeColours(palette({ hue: 77, luma: 0.08 }), '#c6ff00');
  const b = typeColours(palette({ hue: 77, luma: 0.08 }), '#c6ff00');
  assert.deepEqual(a, b);
});

test('no underline bars or rules: the sung word is coloured instead', () => {
  const source = readFileSync(new URL('../src/pack-type.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /const (rule|rules) = new Graphics/);
  assert.doesNotMatch(source, /size \* 0\.58, barW/);
  assert.match(source, /finishedWord\(label, \{ size, face \}, frame, true\)/);
});

test('Typewriter comes in four inks, the original page with only the colour changed; each Refresh leads with the next ink', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
  try {
    const { PAPER_LOOK } = await vite.ssrLoadModule('/src/pack-typewriter.ts');
    const deal = await vite.ssrLoadModule('/src/treatment-deal.ts');
    const inks = deal.treatmentVariants('typewriter').map(variant => variant.id);
    assert.deepEqual(inks, ['newsprint', 'red-ink', 'yellow-ink', 'purple-ink']);
    const { pen, tint, ...original } = PAPER_LOOK.newsprint;
    assert.equal(tint, 0, 'the original page is untouched');
    for (const ink of inks.slice(1)) {
      const { pen: colour, tint: shade, ...look } = PAPER_LOOK[ink];
      assert.deepEqual(look, original, `${ink} is the original page`);
      assert.notEqual(colour, pen, ink);
      assert.ok(shade > 0, `${ink}: the picture takes on the ink`);
    }
    assert.equal(new Set(inks.map(ink => PAPER_LOOK[ink].pen)).size, 4);
    const leads = [0, 1, 2, 3, 4].map(at => deal.dealTreatments('party', `song:${at}`, 4, 'typewriter', at)[0]);
    assert.deepEqual(leads, [...inks, inks[0]], 'every Refresh leads with the next ink');
    assert.equal(new Set(deal.dealTreatments('party', 'x', 4, 'typewriter', 2)).size, 4, 'a row shows all four inks');
    for (const old of ['letter', 'faded', 'yellowed']) assert.ok(deal.isTreatmentVariant('typewriter', old) && PAPER_LOOK[old], `${old} cards still render`);
  } finally {
    await vite.close();
  }
});

test('Swap sets the phrase in faces as unlike as faces get, Poem in a quiet one; every face is one the site serves', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
  try {
    const { typeFamilies, TYPE_STYLES } = await vite.ssrLoadModule('/src/pack-type.ts');
    const { DISPLAY_FACES, FIXED_FACES } = await vite.ssrLoadModule('/src/font-catalog.ts');
    assert.ok(TYPE_STYLES.includes('swap') && TYPE_STYLES.includes('poem'));
    const fonts = { font: 'Anton', fontSecondary: 'Bebas Neue' };
    const swap = typeFamilies('swap', fonts);
    assert.ok(new Set(swap).size >= 5, swap.join());
    for (const family of [...swap, ...typeFamilies('poem', fonts)]) assert.ok(family in DISPLAY_FACES || family in FIXED_FACES, family);
    assert.ok(swap.some(family => DISPLAY_FACES[family]?.moods.includes('script')), 'a script among the faces');
  } finally {
    await vite.close();
  }
});
