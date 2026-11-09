import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createServer } from 'vite';

const resolve = createRequire(import.meta.url).resolve;
const WORKER = readFileSync(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url), 'utf8');
const LANES = ['party', 'techno', 'dark', 'quiet', 'gospel', 'general'];

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
  return {
    server,
    catalog: await server.ssrLoadModule('/src/font-catalog.ts'),
    fonts: await server.ssrLoadModule('/src/ad-fonts.ts'),
    type: await server.ssrLoadModule('/src/pack-type.ts'),
  };
}

/** The quoted words inside `NAME = { ... }` of the worker. */
function workerSet(name) {
  const body = WORKER.match(new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}|^${name} = \\{([^\\n]*)\\}`, 'm'));
  assert.ok(body, `${name} is missing from the worker`);
  return [...(body[1] ?? body[2]).matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

test('the cloud worker accepts exactly the fonts and type styles the page knows', async () => {
  const { server, catalog, type } = await load();
  try {
    assert.deepEqual(workerSet('FONTS').sort(), [...catalog.AD_FONTS].sort());
    assert.deepEqual(workerSet('TYPE_STYLES').sort(), [...type.TYPE_STYLES].sort());
  } finally { await server.close(); }
});

test('every font is bundled locally with a commercial-friendly licence, and nothing is fetched from a third party', async () => {
  const { server, catalog } = await load();
  try {
    assert.ok(catalog.AD_FONTS.length >= 40, `only ${catalog.AD_FONTS.length} display fonts`);
    assert.equal(new Set(catalog.AD_FONTS).size, catalog.AD_FONTS.length);
    const packages = JSON.parse(readFileSync('package.json', 'utf8')).dependencies;
    const source = readFileSync('src/font-catalog.ts', 'utf8');
    const files = [...source.matchAll(/import\('(@fontsource\/[^']+)'\)/g)].map(match => match[1]);
    assert.equal(files.length, catalog.AD_FONTS.length + Object.keys(catalog.FIXED_FACES).length, 'one local file per face');
    for (const file of files) {
      const name = file.split('/').slice(0, 2).join('/');
      assert.ok(packages[name], `${name} is not a dependency`);
      assert.doesNotThrow(() => resolve(file), `${file} does not resolve through the package's exports`);
      const licence = JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8')).license;
      assert.ok(['OFL-1.1', 'Apache-2.0'].includes(licence), `${name} is ${licence}`);
    }
    for (const [family, face] of Object.entries(catalog.DISPLAY_FACES)) {
      const css = readFileSync(resolve(source.match(new RegExp(`'${family}': face\\([^\\n]*import\\('(@fontsource/[^']+)'\\)`))[1]), 'utf8');
      assert.ok(css.includes(`font-family: '${family}'`) && css.includes(`font-weight: ${face.weight}`), `${family} ${face.weight} is not what its CSS declares`);
      assert.ok(['OFL-1.1', 'Apache-2.0'].includes(face.licence));
    }
    // Lyrics never go to a third party: no remote font service anywhere in the app's source.
    for (const name of readdirSync('src')) {
      if (!/\.(ts|tsx|css)$/.test(name)) continue;
      assert.ok(!/fonts\.(googleapis|gstatic|bunny|adobe)|typekit|fontshare|use\.fontawesome/i.test(readFileSync(join('src', name), 'utf8')), `${name} reaches for a remote font`);
    }
  } finally { await server.close(); }
});

test('each lane has enough faces of the right moods, and styles only get faces that can do them', async () => {
  const { server, fonts, catalog } = await load();
  try {
    for (const lane of LANES) assert.ok(fonts.fontsForLane(lane).length >= 12, `${lane} has ${fonts.fontsForLane(lane).length} faces`);
    // Club music never gets a serif, a script or blackletter; calm music never gets spray paint, a stencil or pixels.
    const bookish = ['Abril Fatface', 'DM Serif Display', 'Bodoni Moda', 'Gloock', 'Rozha One', 'Fraunces', 'Pacifico', 'Lobster', 'Kaushan Script', 'Caveat Brush', 'UnifrakturCook', 'Pirata One', 'Metal Mania'];
    const loud = ['Rubik Spray Paint', 'Black Ops One', 'Press Start 2P', 'Silkscreen', 'Metal Mania', 'Rubik Glitch', 'Wallpoet', 'Bangers', 'Orbitron', 'Permanent Marker'];
    for (const lane of ['party', 'techno']) for (const font of bookish) assert.ok(!fonts.fontsForLane(lane).includes(font), `${lane} got ${font}`);
    for (const lane of ['quiet', 'gospel']) for (const font of loud) assert.ok(!fonts.fontsForLane(lane).includes(font), `${lane} got ${font}`);
    for (const font of fonts.fontsForLane('general', ['letters'])) assert.ok(!catalog.DISPLAY_FACES[font].joined);
    for (const font of fonts.fontsForLane('general', ['heavy', 'caps'])) {
      assert.ok(catalog.DISPLAY_FACES[font].heavy && catalog.DISPLAY_FACES[font].letters === 'upper');
    }
    assert.equal(fonts.setCase('Pacifico', 'Hello there'), 'Hello there', 'a script keeps the singer\'s case');
    assert.equal(fonts.setCase('Anton', 'Hello there'), 'HELLO THERE');
  } finally { await server.close(); }
});

test('a row of four is dealt four different faces from different moods, the same way every time', async () => {
  const { server, fonts, catalog } = await load();
  try {
    const needs = [['letters'], ['heavy'], [], ['heavy', 'caps']];
    for (const lane of LANES) {
      for (let i = 0; i < 40; i++) {
        const deal = () => fonts.dealFonts(lane, 'Uplifting/Energetic', `seed-${i}`, 'looks', needs);
        const row = deal();
        assert.deepEqual(row, deal(), 'dealt the same way every time');
        assert.equal(new Set(row).size, 4, `${lane} ${i}: ${row}`);
        row.forEach((font, k) => {
          for (const need of needs[k]) {
            if (need === 'letters') assert.ok(!catalog.DISPLAY_FACES[font].joined, `${font} is joined`);
            if (need === 'heavy') assert.ok(catalog.DISPLAY_FACES[font].heavy, `${font} is not heavy`);
            if (need === 'caps') assert.equal(catalog.DISPLAY_FACES[font].letters, 'upper');
          }
        });
        const first = row.map(font => catalog.DISPLAY_FACES[font].moods[0]);
        const wanted = Math.min(4, new Set(fonts.fontsForLane(lane).map(font => catalog.DISPLAY_FACES[font].moods[0])).size);
        assert.ok(new Set(first).size >= Math.min(wanted, 3), `${lane} ${i}: four faces from ${[...new Set(first)]}`);
      }
    }
    assert.throws(() => fonts.dealFonts('techno', null, 's', 'x', Array.from({ length: 100 }, () => ['letters'])), /No techno font/);
  } finally { await server.close(); }
});

test('refreshing keeps bringing new faces: a lane rotates through a large part of its faces', async () => {
  const { server, fonts } = await load();
  try {
    for (const lane of LANES) {
      const seen = new Set();
      for (let i = 0; i < 24; i++) fonts.dealFonts(lane, null, `song:${i}`, 'dust', [['heavy', 'caps'], ['heavy', 'caps'], ['heavy', 'caps'], ['heavy', 'caps']]).forEach(font => seen.add(font));
      const pool = fonts.fontsForLane(lane, ['heavy', 'caps']).length;
      assert.ok(seen.size >= Math.min(pool, 14) * 0.8, `${lane}: 24 refreshes showed ${seen.size} of ${pool} faces`);
    }
  } finally { await server.close(); }
});

test('the families a style draws with are all bundled', async () => {
  const { server, type, catalog } = await load();
  try {
    for (const style of type.TYPE_STYLES) {
      for (const family of type.typeFamilies(style, { font: 'Anton', fontSecondary: 'Oswald' })) {
        assert.ok(family in catalog.DISPLAY_FACES || family in catalog.FIXED_FACES, `${style} → ${family}`);
      }
    }
  } finally { await server.close(); }
});
