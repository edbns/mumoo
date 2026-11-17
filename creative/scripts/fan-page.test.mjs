import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fanPage, missingPage, POLICY } from '../netlify/lib/fan-page.mjs';
import { db } from '../netlify/lib/person.mjs';
import { publishLink } from '../netlify/lib/smart-links.mjs';
import handler from '../netlify/functions/fan-page.mjs';

/** Smart links, step three: the page fans open. */

const LINK = {
  source: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
  title: 'Mr. Brightside <script>alert(1)</script>',
  artist: 'The "Killers" & Co',
  cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/1000x1000bb.jpg',
  preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a',
  isrc: 'GBFFP0300052',
  services: [
    { service: 'spotify', url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', hidden: false },
    { service: 'apple', url: 'https://music.apple.com/us/album/x/1?i=2&uo=4', hidden: false },
    { service: 'tidal', url: 'https://tidal.com/search?q=x', hidden: true },
  ],
};

test('the page shows the song and only the buttons the artist kept, in their order, safely', () => {
  const html = fanPage(LINK, 'https://mumoo.app/l/mr-brightside', 'https://mumoo.app');
  assert.ok(!html.includes('<script>alert'), 'words are text, never markup');
  assert.ok(html.includes('Mr. Brightside &lt;script&gt;'));
  assert.ok(html.includes('The &quot;Killers&quot; &amp; Co'));
  assert.ok(html.indexOf('>Spotify<') < html.indexOf('>Apple Music<'));
  assert.ok(!html.includes('TIDAL') && !html.includes('tidal.com'), 'a hidden button is not on the page');
  assert.ok(html.includes('href="https://music.apple.com/us/album/x/1?i=2&amp;uo=4"'));
  assert.ok(!/target=/.test(html), 'links open in the same window, so the phone hands them to the app');
  assert.ok(html.includes('<link rel="canonical" href="https://mumoo.app/l/mr-brightside">'));
  assert.ok(html.includes('og:image'), 'a shared link shows the cover');
  assert.ok(html.includes('Listen to Mr. Brightside'), 'and says where to listen');
  assert.ok(html.includes('href="https://mumoo.app/links"'), 'the credit leads artists to make their own');
  assert.ok(html.includes('src="https://mumoo.app/logos/spotify.svg"'), 'each button has its service\'s logo');
  assert.ok(Buffer.byteLength(html) < 15_000, `the page is small (${Buffer.byteLength(html)} bytes)`);
});

test('the editor\'s phone shows the same page, its links opening in a new tab', () => {
  const html = fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app', { inPhone: true });
  assert.ok(html.includes('<base target="_blank">'));
  assert.equal(html.replace('<base target="_blank">', '').replace('main{padding-top:64px}', ''), fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app'));
});

test('a published page counts presses with the link\'s own ping, never the editor\'s phone, and the policy lets it reach only us', () => {
  const counted = fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app', { countAs: 'x' });
  assert.ok(counted.includes('ping="https://mumoo.app/api/links/click?slug=x&amp;service=spotify"'));
  assert.equal((counted.match(/ ping="/g) ?? []).length, 2, 'one per shown button');
  assert.ok(!fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app').includes('ping='));
  assert.ok(!fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app', { countAs: 'x', inPhone: true }).includes('ping='));
  assert.ok(counted.includes('<img class="v" src="https://mumoo.app/api/links/view?slug=x"'), 'and an invisible image counts the open');
  assert.ok(!fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app', { countAs: 'x', inPhone: true }).includes('/api/links/view'));
  assert.ok(POLICY.includes("connect-src 'self'"));
});

test('the only script is the preview player, and the page policy allows exactly it', () => {
  const html = fanPage(LINK, 'https://mumoo.app/l/x', 'https://mumoo.app');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1);
  assert.ok(POLICY.includes(`'sha256-${createHash('sha256').update(scripts[0]).digest('base64')}'`));
  assert.ok(POLICY.includes("frame-ancestors 'none'"));
  const quiet = fanPage({ ...LINK, preview: null, cover: null }, 'https://mumoo.app/l/x', 'https://mumoo.app');
  assert.ok(!quiet.includes('<script') && !quiet.includes('<audio') && !quiet.includes('og:image'), 'no preview, no player; no cover, no image');
  assert.ok(missingPage('https://mumoo.app').includes('noindex'));
});

test('/l/<slug> serves the published page, cached until it changes, and "not here" for anything else', { skip: !process.env.DATABASE_URL, timeout: 30000 }, async () => {
  const sql = db();
  const owner = randomUUID();
  const slug = `test-${randomUUID().slice(0, 8)}`;
  try {
    await sql`insert into app_users (id, email) values (${owner}, ${`${owner}@example.test`})`;
    await publishLink(owner, slug, LINK);
    const response = await handler(new Request(`https://mumoo.app/l/${slug}`), { params: { slug } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Netlify-Cache-Tag'), `link-${slug}`);
    assert.match(response.headers.get('Netlify-CDN-Cache-Control'), /durable/);
    assert.equal(response.headers.get('Netlify-Vary'), 'query=mumoo-none', 'an ad\'s click ID does not make a copy of its own');
    assert.match(await response.text(), /Mr\. Brightside/);

    for (const other of [`gone-${randomUUID().slice(0, 8)}`, 'admin', 'Bad Name']) {
      assert.equal((await handler(new Request(`https://mumoo.app/l/${other}`), { params: { slug: other } })).status, 404, other);
    }
    assert.equal((await handler(new Request(`https://mumoo.app/l/${slug}`, { method: 'POST' }), { params: { slug } })).status, 405);
  } finally {
    await sql`delete from app_users where id = ${owner}`;
  }
});
