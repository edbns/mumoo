import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cleanLink, deleteLink, linksOf, publishLink, setTracking, slugProblem, statsRows, updateLink } from '../netlify/lib/smart-links.mjs';
import { summarise } from '../netlify/lib/link-stats.mjs';
import { seal } from '../netlify/lib/secret-box.mjs';
import { db } from '../netlify/lib/person.mjs';
import links from '../netlify/functions/links.mjs';
import slugCheck from '../netlify/functions/links-slug.mjs';
import track from '../netlify/functions/smart-links-track.mjs';

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

    const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0';
    const waited = [];
    const context = { geo: { country: { code: 'BR' } }, ip: '203.0.113.9', waitUntil: promise => waited.push(promise) };
    const send = (body, agent = INSTAGRAM) => track(new Request('https://mumoo.app/api/smart-links/track', {
      method: 'POST', headers: { 'User-Agent': agent, 'Content-Type': 'text/plain' }, body: JSON.stringify({ slug, url: `https://mumoo.app/l/${slug}`, referrer: '', ...body }),
    }), context);
    assert.equal((await send({ event: 'view', url: `https://mumoo.app/l/${slug}?fbclid=IwAR0secret` })).status, 204);
    await send({ event: 'view', referrer: 'https://l.instagram.com/' });
    await send({ event: 'click', service: 'spotify', url: `https://mumoo.app/l/${slug}?fbclid=IwAR0secret` });
    await send({ event: 'click', service: 'tidal' });
    await send({ event: 'click', service: 'nope' });
    await send({ event: 'view' }, 'facebookexternalhit/1.1');
    await send({ event: 'view', slug: `gone-${randomUUID().slice(0, 8)}` });
    assert.equal((await track(new Request('https://mumoo.app/api/smart-links/track'), context)).status, 405);
    assert.equal(waited.length, 0, 'nothing forwarded without ad accounts');

    const [listed] = await linksOf(owner);
    assert.deepEqual([listed.views, listed.clicks, listed.week_views, listed.week_clicks, listed.paid_views], [2, 1, 2, 1, 1],
      'a hidden button, an unknown service, a robot and a missing link are not counted');
    assert.deepEqual(listed.services, { spotify: 1 });
    const events = await sql`select * from smart_link_events where slug = ${slug} order by id`;
    assert.deepEqual(events.map(row => [row.kind, row.country, row.browser, row.device, row.os, row.is_paid_ad, row.ad_network, row.referrer]), [
      ['view', 'BR', 'Instagram App', 'Mobile', 'iOS', true, 'meta', null],
      ['view', 'BR', 'Instagram App', 'Mobile', 'iOS', false, null, 'instagram.com'],
      ['click', 'BR', 'Instagram App', 'Mobile', 'iOS', true, 'meta', null],
    ]);
    assert.ok(!/secret|203\.0\.113|Mozilla/.test(JSON.stringify(events)), 'no click ID, IP address or user agent is kept');

    const stats = summarise(await statsRows(owner, slug, 7), 7, new Date().toISOString().slice(0, 10));
    assert.deepEqual(stats.totals, { views: 2, clicks: 1, engagement: 0.5, paid_views: 1, paid_clicks: 1 });
    assert.deepEqual(stats.sources.map(row => row.key), ['Instagram']);
    assert.equal(await statsRows(other, slug, 7), null, 'only the owner sees the analytics');

    const before = process.env.PIXEL_TOKEN_KEY;
    process.env.PIXEL_TOKEN_KEY = Buffer.alloc(32, 3).toString('base64');
    const realFetch = globalThis.fetch;
    try {
      assert.equal((await setTracking(owner, slug, { meta_pixel_id: 'abc' }, seal)).status, 400);
      assert.equal((await setTracking(other, slug, { meta_pixel_id: '1234567890' }, seal)).status, 404);
      const saved = await setTracking(owner, slug, { meta_pixel_id: '1234567890', meta_capi_token: 'EAAB-secret-token-0123456789', tiktok_pixel_id: '', google_ads_id: 'aw-123456789' }, seal);
      assert.deepEqual(saved.tracking, { meta_pixel_id: '1234567890', meta_capi_token: true, tiktok_pixel_id: null, tiktok_events_token: false, google_ads_id: 'AW-123456789' });
      assert.ok(!JSON.stringify(await sql`select meta_capi_token from smart_links where slug = ${slug}`).includes('EAAB'), 'the token is kept encrypted');
      assert.deepEqual((await linksOf(owner))[0].tracking, saved.tracking);
      assert.equal((await setTracking(owner, slug, { meta_pixel_id: '1234567890' }, seal)).tracking.meta_capi_token, true, 'a token left out stays');

      const forwarded = [];
      globalThis.fetch = async (url, init) => {
        if (!/graph\.facebook\.com|business-api\.tiktok\.com/.test(String(url))) return realFetch(url, init);
        forwarded.push({ url: String(url), body: JSON.parse(init.body) });
        return new Response('{}');
      };
      await send({ event: 'click', service: 'apple', url: `https://mumoo.app/l/${slug}?fbclid=IwAR0secret` });
      await Promise.all(waited);
      assert.equal(forwarded.length, 1);
      assert.match(forwarded[0].url, /graph\.facebook\.com\/v\d+\.0\/1234567890\/events\?access_token=EAAB-secret-token-0123456789/);
      assert.equal(forwarded[0].body.data[0].event_name, 'StreamClick');
      assert.equal(forwarded[0].body.data[0].user_data.client_ip_address, '203.0.113.9');
      assert.match(forwarded[0].body.data[0].user_data.fbc, /^fb\.1\.\d+\.IwAR0secret$/);
      assert.equal((await setTracking(owner, slug, { meta_pixel_id: '1234567890', meta_capi_token: '' }, seal)).tracking.meta_capi_token, false, 'removed');
    } finally {
      globalThis.fetch = realFetch;
      if (before === undefined) delete process.env.PIXEL_TOKEN_KEY; else process.env.PIXEL_TOKEN_KEY = before;
    }

    await sql`delete from app_users where id = ${owner}`;
    assert.deepEqual(await sql`select 1 from smart_links where slug = ${slug}`, [], 'a deleted account takes its links with it');
    assert.deepEqual(await sql`select 1 from smart_link_events where slug = ${slug}`, [], 'and their analytics');
  } finally {
    await sql`delete from smart_links where slug = ${slug}`;
    await sql`delete from app_users where id in (${owner}, ${other})`;
  }
});
