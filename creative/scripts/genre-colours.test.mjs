import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { createServer } from 'vite';
import { jpegColours } from '../netlify/lib/colours.mjs';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  return { server, guide: await server.ssrLoadModule('/src/genre-guide.ts'), genres: await server.ssrLoadModule('/src/genres.ts'), pick: await server.ssrLoadModule('/src/library-pick.ts') };
}

/** A JPEG of vertical bands: [[r,g,b], share of the width]. */
function bandsJpeg(...parts) {
  const width = 120, height = 80;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    let x = 0;
    for (const [[r, g, b], share] of parts) {
      for (const end = x + Math.round(share * width); x < end && x < width; x++) data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return jpeg.encode({ data, width, height }, 90).data;
}

const read = palette => ({ palette, lightness: 0.4, saturation: 0.85, contrast: 0.5 });

test('every genre the creator can pick has its colours, except Gospel & Christian, which the guidance gives none', async () => {
  const { server, guide, genres } = await load();
  try {
    for (const group of genres.GENRES) {
      for (const sub of group.subGenres) {
        const colours = guide.coloursFor(group.name, sub);
        if (group.name === 'Gospel & Christian') assert.equal(colours, null, sub);
        else assert.ok(colours?.swatches.length >= 3, `${group.name} · ${sub}`);
      }
    }
    assert.equal(guide.coloursFor('Electronic & Dance (EDM)', 'Afro House'), guide.coloursFor('Electronic & Dance (EDM)', 'House'), 'a house style takes House\'s');
    assert.equal(guide.coloursFor('Metal', ''), guide.coloursFor('Metal', 'General Metal'), 'no sub-genre: the group\'s General');
    assert.equal(guide.coloursFor('Nope', 'House'), null);
  } finally { await server.close(); }
});

test('a picture\'s colours are read on our server from the JPEG itself', () => {
  const colours = jpegColours(bandsJpeg([[255, 45, 149], 0.5], [[0, 240, 255], 0.5]));
  assert.ok(colours, 'read');
  assert.ok(colours.palette.length >= 2);
  const near = (hex, [r, g, b]) => Math.abs(parseInt(hex.slice(1, 3), 16) - r) + Math.abs(parseInt(hex.slice(3, 5), 16) - g) + Math.abs(parseInt(hex.slice(5, 7), 16) - b) < 60;
  assert.ok(colours.palette.some(colour => near(colour.hex, [255, 45, 149])) && colours.palette.some(colour => near(colour.hex, [0, 240, 255])), JSON.stringify(colours.palette));
  assert.ok(colours.saturation > 0.6);
  assert.equal(jpegColours(Buffer.from('not a picture')), null, 'a broken file is not read, and does not throw');
});

test('colours fit a genre by its swatches, light and vividness, and only lift a picture that shows something wanted', async () => {
  const { server, guide, pick } = await load();
  try {
    const synthwave = guide.coloursFor('Electronic & Dance (EDM)', 'Synthwave / Vaporwave');
    const neon = read([{ hex: '#ff2a90', share: 0.5 }, { hex: '#05e8f5', share: 0.4 }, { hex: '#111111', share: 0.1 }]);
    const beige = { palette: [{ hex: '#e8dcc0', share: 0.7 }, { hex: '#8b6f4e', share: 0.3 }], lightness: 0.75, saturation: 0.2, contrast: 0.3 };
    const fitNeon = pick.colourFit(neon, synthwave);
    const fitBeige = pick.colourFit(beige, synthwave);
    assert.ok(fitNeon > 0.75 && fitBeige < 0.35, `${fitNeon} ${fitBeige}`);
    assert.ok(pick.colourFit(beige, guide.coloursFor('Rock', 'Alternative / Indie Rock')) > fitBeige, 'the same picture fits another genre\'s colours');
    const speck = read([{ hex: '#333333', share: 0.97 }, { hex: '#ff2d95', share: 0.03 }]);
    assert.ok(pick.colourFit(speck, synthwave) < fitNeon - 0.3, 'a speck of the right colour is not the picture\'s colour');

    const wanted = { attitude: 'confident', genre: 'Electronic & Dance (EDM)', subGenre: 'House', colours: guide.coloursFor('Electronic & Dance (EDM)', 'House') };
    const item = (id, over) => ({ id, kind: 'photo', attitudes: [], tags: [], genre: null, subGenre: null, url: `https://x/${id}`, ...over });
    const club = read([{ hex: '#1a237e', share: 0.5 }, { hex: '#9c27ff', share: 0.3 }, { hex: '#ffb300', share: 0.2 }]);
    const dull = { palette: [{ hex: '#d8d4cc', share: 1 }], lightness: 0.8, saturation: 0.05, contrast: 0.1 };
    assert.ok(pick.libraryFit(item('a', { tags: ['club'], colours: club }), wanted) > pick.libraryFit(item('b', { tags: ['club'], colours: dull }), wanted), 'the club in club lights first');
    assert.equal(pick.libraryFit(item('c', { tags: ['beach'], colours: club }), wanted), 0, 'the right colours on the wrong thing do not make it fit');
    assert.equal(pick.libraryFit(item('d', { tags: ['club'] }), wanted), pick.libraryFit(item('d', { tags: ['club'] }), { ...wanted, colours: undefined }), 'an unmeasured picture is neither lifted nor held back');
  } finally { await server.close(); }
});

test('each card tells the brain how well its library picture carries the genre\'s colours, and the feedback keeps it', async () => {
  const { validFeedback } = await import('../netlify/lib/feedback.mjs');
  const card = colourFit => ({
    version: 1, event: 'download', clipSha256: 'a'.repeat(64), primaryGenre: 'Latin & Urbano', subGenre: 'Reggaeton',
    vibe: 'Dark/Cinematic', lane: 'dark', language: 'es', lyricsOrigin: 'typed', lyricAttitude: 'confident', lyricSadness: 1, lyricIntensity: 4,
    row: 'photography', slot: { id: 'ad-photography-x', style: 'filter', font: 'Anton', fontSecondary: 'Inter', libraryId: crypto.randomUUID(), colourFit }, ownPicture: false, generation: 2,
  });
  assert.equal(validFeedback(card(0.72)), true);
  assert.equal(validFeedback(card(undefined)), true, 'a picture not measured yet says nothing');
  for (const bad of [-0.1, 1.2, '0.5', Number.NaN]) assert.equal(validFeedback(card(bad)), false, String(bad));
});
