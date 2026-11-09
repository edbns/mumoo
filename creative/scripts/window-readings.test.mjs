import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readOurPictures } from './support/window-readings.mjs';

/**
 * The shelf deals Window cards from src/window-readings.json: which screen colours read against each of our own
 * pictures. A picture without a reading cannot be dealt, and a stale reading deals a screen that disappears into its
 * picture, so the table must cover every picture and match what the browser reads now. Fix with `npm run bake:window-readings`.
 */
const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const table = json('src/window-readings.json');

test('every approved photo, baked effect and baked background has a reading, and every picture has screens to be dealt', () => {
  const keys = [
    ...json('public/punch-plates/plates.json').plates.map(plate => `plate:${plate.id}`),
    ...json('punch-plates/effects/effects.json').map(effect => `effect:${effect.id}`),
    ...json('src/look-lab/bank.json').map(look => `bank:${look.slug}`),
  ];
  assert.deepEqual(Object.keys(table).sort(), [...keys].sort(), 'the table has exactly our pictures');
  for (const [key, reading] of Object.entries(table)) {
    assert.ok(reading.plain.length >= 4, `${key} has too few screens to give four cards a screen each (${reading.plain.length})`);
    assert.ok(reading.person === null || reading.person.length >= 4, `${key} has too few screens with a person in front`);
    if (!key.startsWith('plate:')) assert.equal(reading.person, null, `${key}: only photos have a person in front`);
  }
  const plates = json('public/punch-plates/plates.json').plates;
  for (const plate of plates) assert.equal(table[`plate:${plate.id}`].person !== null, Boolean(plate.cutout), `${plate.id}: her in front exactly when the photo has a cut-out`);
});

test('the readings are what the browser reads from the pictures now', { timeout: 600000 }, async (t) => {
  const now = await readOurPictures();
  if (!now) return t.skip('no Chromium installed');
  assert.deepEqual(now, table);
});
