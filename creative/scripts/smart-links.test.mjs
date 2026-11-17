import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cleanLink, countClick, deleteLink, linksOf, publishLink, slugProblem, updateLink } from '../netlify/lib/smart-links.mjs';
import { db } from '../netlify/lib/person.mjs';
import links from '../netlify/functions/links.mjs';
import slugCheck from '../netlify/functions/links-slug.mjs';
import click from '../netlify/functions/links-click.mjs';

/** Smart links, step two: what the editor publishes, at which address, and only by its owner. */

const LINK = {
  source: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
  title: '  Blinding   Lights ',
  artist: 'The Weeknd',
  cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music/1000x1000bb.jpg',
  preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a',
  isrc: 'USUG11904206',
  services: [
    { service: 'spotify', url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', hidden: false },
    { service: 'apple', url: 'https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615', hidden: false },
    { service: 'tidal', url: 'https://tidal.com/search?q=The%20Weeknd', hidden: true },
  ],
};

test('an address is lowercase letters, digits and single dashes, and our own page names are not given out', () => {
  for (const good of ['blinding-lights', 'the-weeknd-2020', 'abc']) assert.equal(slugProblem(good), null, good);
  for (const bad of ['ab', 'Blinding', '-lights', 'lights-', 'a--b', 'a b', 'ä-b', 'x'.repeat(41), '', null]) assert.match(slugProblem(bad), /lowercase/, String(bad));
  for (const reserved of ['admin', 'api', 'login', 'new', 'edit', 'links']) assert.match(slugProblem(reserved), /reserved/, reserved);
});

test('a link keeps its buttons in order, each going only to its own service, and media only from the music services', () => {
  const { link } = cleanLink(LINK);
  assert.equal(link.title, 'Blinding Lights');
  assert.deepEqual(link.services.map(row => [row.service, row.hidden]), [['spotify', false], ['apple', false], ['tidal', true]]);

  const button = (service, url) => cleanLink({ ...LINK, services: [{ service, url }] }).error;
  assert.equal(button('spotify', 'https://evil.example/open.spotify.com'), 'The Spotify button must link to Spotify (https://…).');
  assert.ok(button('spotify', 'https://open.spotify.com.evil.example/track/x'));
  assert.ok(button('apple', 'http://music.apple.com/us/song/1'), 'https only');
  assert.ok(button('youtube', 'javascript:alert(1)'));
  assert.ok(button('deezer', 'https://user:pass@www.deezer.com/track/1'));
  assert.equal(button('amazon', 'https://music.amazon.co.uk/albums/B1'), undefined, 'an Amazon of another country is Amazon');
  assert.equal(button('nope', 'https://open.spotify.com/'), 'One of the buttons is not a service we know.');
  assert.ok(cleanLink({ ...LINK, services: [LINK.services[0], LINK.services[0]] }).error, 'one button per service');
  assert.equal(cleanLink({ ...LINK, services: [{ ...LINK.services[0], hidden: true }] }).error, 'Show at least one button.');

  assert.ok(cleanLink({ ...LINK, cover: 'https://tracker.example/pixel.gif' }).error, 'a cover from anywhere else is refused');
  assert.ok(cleanLink({ ...LINK, preview: 'https://audio-ssl.itunes.apple.com.evil.example/a.m4a' }).error);
  assert.equal(cleanLink({ ...LINK, cover: null, preview: null }).link.cover, null, 'a link may have no cover');
  assert.ok(cleanLink({ ...LINK, source: 'https://example.com/song' }).error, 'the song must come from a link we can look up');
  assert.ok(cleanLink({ ...LINK, artist: '  ' }).error);
});

test('/api/links is only for the signed in, and the name check answers anyone', async () => {
  const response = await links(new Request('https://example.test/api/links'));
  assert.ok([401, 503].includes(response.status));
  if (!process.env.DATABASE_URL) return;
  const reserved = await (await slugCheck(new Request('https://example.test/api/links/slug?name=admin'))).json();
  assert.deepEqual(reserved, { free: false, error: 'That name is reserved. Try another.' });
  const free = await (await slugCheck(new Request(`https://example.test/api/links/slug?name=free-${randomUUID().slice(0, 8)}`))).json();
  assert.deepEqual(free, { free: true });
});

test('a name is taken by whoever publishes first, and only its owner can change or delete it', { skip: !process.env.DATABASE_URL, timeout: 30000 }, async () => {
  const sql = db();
  const [owner, other] = [randomUUID(), randomUUID()];
  const slug = `test-${randomUUID().slice(0, 8)}`;
  try {
    for (const id of [owner, other]) await sql`insert into app_users (id, email) values (${id}, ${`${id}@example.test`})`;
    const first = await publishLink(owner, slug, LINK);
    assert.equal(first.link.slug, slug);
    assert.deepEqual(await publishLink(other, slug, LINK), { status: 409, error: 'Someone already has that name. Try another.' });
    const taken = await (await slugCheck(new Request(`https://example.test/api/links/slug?name=${slug}`))).json();
    assert.equal(taken.free, false);

    assert.equal((await updateLink(other, slug, { ...LINK, title: 'Stolen' })).status, 404);
    assert.equal((await updateLink(owner, slug, { ...LINK, title: 'After Hours' })).link.link.title, 'After Hours');
    assert.equal(await deleteLink(other, slug), false);
    assert.deepEqual((await linksOf(owner)).map(row => row.slug), [slug]);

    assert.equal(await countClick(slug, 'spotify'), true);
    assert.equal(await countClick(slug, 'spotify'), true);
    assert.equal(await countClick(slug, 'apple'), true);
    assert.equal(await countClick(slug, 'tidal'), false, 'a hidden button is not counted');
    assert.equal(await countClick(slug, 'nope'), false);
    assert.equal(await countClick(`gone-${randomUUID().slice(0, 8)}`, 'spotify'), false);
    const [listed] = await linksOf(owner);
    assert.deepEqual(listed.clicks, { spotify: 2, apple: 1 });
    assert.equal(listed.week, 3);
    assert.deepEqual(Object.keys((await sql`select * from smart_link_clicks where slug = ${slug} limit 1`)[0]).sort(), ['clicks', 'day', 'service', 'slug'],
      'only counts are kept, nothing about who pressed');
    assert.equal((await click(new Request(`https://mumoo.app/api/links/click?slug=${slug}&service=apple`, { method: 'POST' }))).status, 204);
    assert.equal((await linksOf(owner))[0].clicks.apple, 2);
    assert.equal((await click(new Request(`https://mumoo.app/api/links/click?slug=${slug}&service=apple`))).status, 405);

    await sql`delete from app_users where id = ${owner}`;
    assert.deepEqual(await sql`select 1 from smart_links where slug = ${slug}`, [], 'a deleted account takes its links with it');
    assert.deepEqual(await sql`select 1 from smart_link_clicks where slug = ${slug}`, [], 'and their clicks');
  } finally {
    await sql`delete from smart_links where slug = ${slug}`;
    await sql`delete from app_users where id in (${owner}, ${other})`;
  }
});
