import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

/** The style directory the song step searches (`src/styles.json`, built by `scripts/build-styles.mjs`). */

const styles = JSON.parse(readFileSync(new URL('../src/styles.json', import.meta.url), 'utf8'));
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { GENRES, styleKey } = await server.ssrLoadModule('/src/genres.ts');
const { BY_STYLE } = await server.ssrLoadModule('/src/genre-guide.ts');
const { searchStyles } = await server.ssrLoadModule('/src/style-search.ts');
await server.close();

/** A style by its own name first, else by another of its names. */
const find = typed => styles.find(style => styleKey(style.name) === styleKey(typed)) ?? styles.find(style => (style.aliases ?? []).some(name => styleKey(name) === styleKey(typed)));

test('every style is placed in one of our genres and a sub-genre of it, and each name is offered once', () => {
  assert.ok(styles.length > 3000);
  for (const style of styles) {
    assert.ok(GENRES.find(group => group.name === style.genre)?.subGenres.includes(style.subGenre), `${style.name}: ${style.genre} / ${style.subGenre}`);
  }
  assert.equal(new Set(styles.map(style => styleKey(style.name))).size, styles.length);
});

test('a style is found however it is typed', () => {
  assert.equal(styleKey('Afro beat'), styleKey('AFRO-BEAT'));
  assert.equal(styleKey('Drum & Bass'), styleKey("drum'n'bass"));
  assert.equal(styleKey('Reggaetón'), styleKey('reggaeton'));
  assert.equal(find('slap-house')?.name, 'slap house');
  assert.equal(find('car music')?.name, 'slap house', 'by another name');
  assert.equal(find('baile funk')?.genre, 'Latin & Urbano');
});

test('the styles people make now land where their looks are', () => {
  const placed = {
    'slap house': ['Electronic & Dance (EDM)', 'Slap House'],
    'Afro house': ['Electronic & Dance (EDM)', 'Afro House'],
    'Afro tech': ['Electronic & Dance (EDM)', 'Afro House'],
    'g-house': ['Electronic & Dance (EDM)', 'G-House'],
    'Amapiano': ['Electronic & Dance (EDM)', 'House'],
    'gqom': ['Electronic & Dance (EDM)', 'House'],
    'melodic techno': ['Electronic & Dance (EDM)', 'Techno'],
    'Afrobeats': ['Reggae & Dancehall', 'Dancehall / Afrobeats'],
    'Afrobeat': ['Reggae & Dancehall', 'Dancehall / Afrobeats'],
    'reggaeton': ['Latin & Urbano', 'Reggaeton'],
    'Dominican dembow': ['Latin & Urbano', 'Reggaeton'],
    'funk carioca': ['Latin & Urbano', 'General Latin'],
    'trap music': ['Hip-Hop & Rap', 'Trap'],
    'drill': ['Hip-Hop & Rap', 'Trap'],
    'UK drill': ['Hip-Hop & Rap', 'Trap'],
    'phonk': ['Electronic & Dance (EDM)', 'General Electronic'],
    'Brazilian phonk': ['Electronic & Dance (EDM)', 'General Electronic'],
    'gospel music': ['Gospel & Christian', 'Gospel'],
    'contemporary worship music': ['Gospel & Christian', 'Worship / Contemporary Christian'],
    'Christian hip-hop': ['Gospel & Christian', 'Christian Hip-Hop'],
    'Christian rock': ['Gospel & Christian', 'General Gospel & Christian'],
    'contemporary R&B': ['Jazz, Soul & Blues', 'Smooth Jazz / Soul'],
    'K-pop': ['Pop', 'K-Pop / J-Pop'],
    'punk rock': ['Punk', 'General Punk'],
  };
  for (const [name, [genre, subGenre]] of Object.entries(placed)) {
    const style = find(name);
    assert.ok(style, `${name} is in the directory`);
    assert.deepEqual([style.genre, style.subGenre], [genre, subGenre], name);
  }
});

test('every style given its own looks is a style of the directory, by its own name', () => {
  for (const name of Object.keys(BY_STYLE)) assert.ok(styles.some(style => style.name === name), name);
});

test('the search box finds a style in what creators type: mixes, a kind before the style, words it has no name for', () => {
  const first = typed => searchStyles(typed).map(match => match.label);
  assert.equal(first('Bedroom R&B')[0], 'R&B', 'the last word is the style');
  for (const typed of ['R&B', 'RnB', "R'n'B", 'Bedroom R&B']) {
    assert.equal(searchStyles(typed)[0].style.name, 'contemporary R&B', `${typed} is today's R&B, not British`);
  }
  assert.equal(first('Electronic Downtempo')[0], 'Downtempo');
  assert.equal(first('Funk Phonk')[0], 'Phonk');
  assert.equal(first('Country (outlaw)')[0], 'Outlaw country');
  assert.deepEqual(first('Industrial Rock x rap').slice(0, 2), ['Industrial rock', 'Rap'], 'each style of a mix is offered');
  assert.deepEqual(first('Trap feat. drill').slice(0, 2), ['Trap', 'Drill']);
  assert.equal(first('Phonk Montagem')[0], 'Montagem', 'a style Wikidata lacks, added by hand');
  assert.equal(searchStyles('montagem')[0].style.genre, 'Latin & Urbano');
  assert.deepEqual(first('Deep house'), ['Deep house', 'Modern deep house'], 'a name that is found is not split into its words');
  assert.ok(!first('House x rai').includes('Straight edge'), 'a short word is not looked for inside other words');
  assert.ok(first('afro house').length > 0 && first('Afro HOUSE')[0] === 'Afro house');
});
