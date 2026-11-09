/**
 * Writes src/window-readings.json: which Window screens read against each of our own pictures (see
 * scripts/support/window-readings.mjs). Run it again whenever a plate, a baked effect or a baked background is added or changes:
 *
 *   npm run bake:window-readings
 *
 * Needs the headless Chromium that Playwright installed, and the approved photos published by `npm run bake:plates`.
 */
import { writeFileSync } from 'node:fs';
import { readOurPictures } from './support/window-readings.mjs';

const table = await readOurPictures();
if (!table) throw new Error('No Chromium is installed for Playwright (npx playwright install chromium-headless-shell).');
writeFileSync(new URL('../src/window-readings.json', import.meta.url), `${JSON.stringify(table, null, 1)}\n`);
console.log(`wrote src/window-readings.json (${Object.keys(table).length} pictures)`);
