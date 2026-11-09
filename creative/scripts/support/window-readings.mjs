import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';

/**
 * Which Window screens read against each of our own pictures, found the way the page finds them for a person's own
 * picture (`readWindowPicture`): in a real browser, from the pictures as the site serves them. The shelf deals
 * from this table, so a card never opens on a screen that disappears into its picture.
 *
 * Keys: `plate:<id>` (our approved photos, from public/punch-plates/plates.json), `effect:<id>` (the baked Shaders
 * stills, from effects.json) and `bank:<id>` (the baked backgrounds, from look-lab/bank.json).
 * Returns null where no Chromium is installed.
 */
export async function readOurPictures() {
  const browser = await launchChromium();
  if (!browser) return null;
  const json = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
  const plates = json('public/punch-plates/plates.json').plates;
  const pictures = [
    ...plates.map(plate => [`plate:${plate.id}`, `/punch-plates/${plate.id}.jpg`, plate.cutout ? `/punch-plates/${plate.id}.cut.png` : undefined]),
    ...json('punch-plates/effects/effects.json').map(effect => [`effect:${effect.id}`, `/punch-plates/effects/${effect.id}.jpg`]),
    ...json('src/look-lab/bank.json').map(look => [`bank:${look.slug}`, `/punch-plates/looks/bank__${look.slug}.jpg`]),
  ];
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    page.on('pageerror', error => { throw error; });
    await page.goto(`${site.resolvedUrls.local[0]}window-lab.html`);
    await page.waitForFunction('window.windowLab', null, { timeout: 60000 });
    const table = {};
    for (const [key, photo, cutout] of pictures) table[key] = await page.evaluate(([a, b]) => window.windowLab.reading(a, b), [photo, cutout]);
    return Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)));
  } finally {
    await browser.close();
    await site.close();
  }
}
