/**
 * Recommendation gallery: what the creatives pack looks like for each reference song, using the real
 * music-analysis result of its loudest 15 seconds. One PNG per song, so changes to the brain can be judged by eye.
 *
 *   python3 scripts/analyze-songs.py      # once per new song: cuts the clip and runs the cloud analysis
 *   MUMOO_HEADED=1 node scripts/gallery.mjs [song ...]   # writes scripts/fixtures/gallery/<song>.png
 *
 * Songs live in scripts/fixtures/ (git-ignored) as "<Title>-<kind>.wav", e.g. "MY BAD-Slaphouse.wav".
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canRunBrowserTests, lyricsResult, openProduct, uploadSong } from './support/product-flow.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const analysis = `${fixtures}analysis/`;
const out = `${fixtures}gallery/`;
if (!canRunBrowserTests) throw new Error('Run with MUMOO_HEADED=1 on macOS (needs the local Brave browser).');

/** The genre a creator would pick from the dropdown for each kind of song. */
const genreFor = key => (/house/.test(key) ? 'House' : /techno/.test(key) ? 'Techno' : /reggaeton|latin/.test(key) ? 'Latin' : 'Other / Not sure');

const keys = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(analysis).filter(name => name.endsWith('.json')).map(name => name.replace('.json', ''));
mkdirSync(out, { recursive: true });

for (const key of keys) {
  const product = await openProduct({
    analysis: JSON.parse(readFileSync(`${analysis}${key}.json`, 'utf8')),
    lyrics: () => lyricsResult('hold me close tonight', { language: 'en' }),
  });
  const { page } = product;
  try {
    await uploadSong(page, { genre: genreFor(key), file: { name: `${key}.wav`, mimeType: 'audio/wav', buffer: readFileSync(`${analysis}${key}-upload.wav`) } });
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
    await page.locator('.step-actions .primary-accent').click();
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length === 8, null, { timeout: 30000 });
    await page.waitForTimeout(2500); // previews are painted asynchronously
    await page.locator('.creatives-pack-card').first().locator('xpath=..').screenshot({ path: `${out}${key}.png` });
    console.log(`${key}: ${genreFor(key)} → ${out}${key}.png${product.errors.length ? ` (page errors: ${product.errors})` : ''}`);
  } finally { await product.close(); }
}
