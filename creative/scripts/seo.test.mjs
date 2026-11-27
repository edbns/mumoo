import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { crawlFiles, faqJson, legalHead, PUBLIC_PATHS, SMART_LINKS_HEAD, withHead } from '../dev/seo-pages.mjs';
import { fanPage } from '../netlify/lib/fan-page.mjs';
import { QUESTIONS } from '../src/pricing-faq.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the home and pricing pages carry their own title, description, canonical address and sharing card', () => {
  const home = read('welcome.html');
  assert.match(home, /<title>mumoo — Music Promo &amp; Lyric Video Maker for Reels &amp; TikTok<\/title>/);
  assert.match(home, /<link rel="canonical" href="https:\/\/mumoo\.app\/">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/mumoo\.app\/og-cover\.png">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  const app = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(home)[1]);
  assert.equal(app['@type'], 'SoftwareApplication');
  assert.deepEqual([app.offers.lowPrice, app.offers.highPrice, app.offers.offerCount], ['5', '50', '3']);
  const pricing = read('pricing.html');
  assert.match(pricing, /<title>Pricing — Pay-As-You-Go Music Video Credits \(No Subscription\) \| mumoo<\/title>/);
  assert.match(pricing, /<link rel="canonical" href="https:\/\/mumoo\.app\/pricing">/);
  assert.ok(existsSync(new URL('../public/og-cover.png', import.meta.url)));
});

test('the pricing FAQ is the questions on the page', () => {
  const faq = JSON.parse(faqJson());
  assert.equal(faq['@type'], 'FAQPage');
  assert.deepEqual(faq.mainEntity.map(entry => entry.name), QUESTIONS.map(({ q }) => q));
  assert.match(read('src/pricing-page.tsx'), /import \{ QUESTIONS \} from '\.\/pricing-faq\.mjs';/);
});

test('the smart links editor and each legal document get their own head', () => {
  const html = withHead('<head>\n<title>mumoo — Music Videos</title>\n<meta name="robots" content="noindex">\n</head>', SMART_LINKS_HEAD);
  assert.match(html, /<title>Free Music Smart Links for Spotify, Apple Music &amp; YouTube \| mumoo<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/mumoo\.app\/smart-links">/);
  assert.doesNotMatch(html, /noindex/, 'the app is not indexed, its smart links page is');
  assert.deepEqual(legalHead('terms-of-service').title, 'Terms of Service · mumoo');
  assert.match(legalHead('cookie-policy').description, /^This Cookie Policy explains how mumoo uses cookies/);
  assert.ok(legalHead('privacy-policy').description.length <= 155);
  assert.match(legalHead('refund-policy').description, /Refund Policy/);
});

test('only the live site is for search engines', () => {
  const staging = crawlFiles(false);
  assert.equal(staging['robots.txt'], 'User-agent: *\nDisallow: /\n');
  assert.match(staging._headers, /X-Robots-Tag: noindex, nofollow/);
  assert.equal(staging['sitemap.xml'], undefined);
  const live = crawlFiles(true);
  assert.match(live['robots.txt'], /Sitemap: https:\/\/mumoo\.app\/sitemap\.xml/);
  assert.match(live['robots.txt'], /Disallow: \/admin\nDisallow: \/phone/);
  for (const path of PUBLIC_PATHS) assert.ok(live['sitemap.xml'].includes(`<loc>https://mumoo.app${path}</loc>`), path);
  assert.match(read('netlify/functions/fan-page.mjs'), /thisSite\(\)\?\.name === 'live' \? \{\} : \{ 'X-Robots-Tag': 'noindex, nofollow' \}/);
});

test('a fan page is titled for search, shares the song\'s cover, and credits mumoo', () => {
  const link = {
    source: 'spotify:1', title: 'ATREVIMENTO', artist: 'StefnaXYZ', cover: 'https://i.scdn.co/image/ab67616d0000b273x', preview: null, isrc: null,
    services: [{ service: 'spotify', url: 'https://open.spotify.com/track/1', hidden: false }, { service: 'apple', url: 'https://music.apple.com/us/song/1', hidden: false },
      { service: 'youtube', url: 'https://www.youtube.com/watch?v=1', hidden: false }, { service: 'deezer', url: 'https://www.deezer.com/track/1', hidden: false }],
  };
  const html = fanPage(link, 'https://mumoo.app/l/stefnaxyz-atrevimento', 'https://mumoo.app');
  assert.match(html, /<title>ATREVIMENTO by StefnaXYZ — Listen on Spotify, Apple Music &amp; YouTube<\/title>/);
  assert.match(html, /<meta property="og:site_name" content="mumoo">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/i\.scdn\.co\/image\/ab67616d0000b273x">/);
  assert.match(html, /<a href="https:\/\/mumoo\.app\/smart-links">Made with <b>mumoo<\/b><\/a>/);
});
