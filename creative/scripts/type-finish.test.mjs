import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
const { typeColours } = await server.ssrLoadModule('/src/pack-palette.ts');
await server.close();

const lum = hex => {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const palette = extra => ({ ink: '#f7f4ee', light: true, hue: 210, accent: '#5aa9ff', scrim: { color: '#000000', alpha: 0 }, luma: 0.04, range: [0, 1], ...extra });

test('the ink is tinted from the picture and still reads (4.5:1); the accent 3:1; letters on the accent read', () => {
  for (const [luma, light, ink] of [[0.02, true, '#f7f4ee'], [0.12, true, '#f7f4ee'], [0.7, false, '#0d0d12'], [0.45, false, '#0d0d12']]) {
    for (const hue of [0, 45, 120, 210, 300]) {
      const colours = typeColours(palette({ luma, light, ink, hue }));
      assert.notEqual(colours.ink, ink, `hue ${hue} on ${luma} is not tinted`);
      assert.ok(ratio(lum(colours.ink), luma) >= 4.5, `ink ${colours.ink} on ${luma}`);
      assert.ok(ratio(lum(colours.onAccent), lum(colours.accent)) >= 4.5, `${colours.onAccent} on ${colours.accent}`);
    }
  }
});

test("a picture with no colour takes the song's mood colour, made to read; with neither the plain ink stays", () => {
  const grey = palette({ hue: null, accent: '#f7f4ee', luma: 0.03 });
  const colours = typeColours(grey, '#ff4fa3');
  assert.notEqual(colours.accent, '#f7f4ee');
  assert.ok(ratio(lum(colours.accent), 0.03) >= 3);
  assert.notEqual(colours.ink, '#f7f4ee');
  assert.equal(typeColours(palette({ hue: null, accent: '#f7f4ee' })).ink, '#f7f4ee');
  assert.equal(typeColours(palette({ hue: 30 }), '#ff4fa3').accent, '#5aa9ff', "the picture's own colour wins");
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
