import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adClick, sourceLabel } from '../netlify/lib/traffic-source.mjs';
import { parseAgent } from '../netlify/lib/user-agent.mjs';
import { summarise } from '../netlify/lib/link-stats.mjs';
import { open, seal } from '../netlify/lib/secret-box.mjs';
import { forwardEvent } from '../netlify/lib/ad-forwarding.mjs';

/** Smart link analytics: where a visit came from, what it was opened with, the dashboard's numbers, and the ad accounts. */

const page = (query) => `https://mumoo.app/l/sem-vergonha${query}`;

test('ad clicks are recognised by the platforms\' click IDs and the campaign tags', () => {
  assert.deepEqual(adClick(page('?fbclid=IwAR0abc')), {
    is_paid_ad: true, ad_network: 'meta', utm_source: null, utm_medium: null, utm_campaign: null, referrer: null, fbclid: 'IwAR0abc', ttclid: null,
  });
  assert.equal(adClick(page('?ttclid=E.C.P.x')).ad_network, 'tiktok');
  for (const id of ['gclid', 'gbraid', 'wbraid']) assert.equal(adClick(page(`?${id}=x`)).ad_network, 'google', id);
  assert.deepEqual(Object.values(adClick(page('?utm_source=Instagram&utm_medium=Paid_Social&utm_campaign=Launch'))).slice(0, 5),
    [true, 'meta', 'instagram', 'paid_social', 'launch'], 'tags in any case');
  assert.equal(adClick(page('?fbclid=x&utm_medium=bio')).is_paid_ad, false, 'a medium the artist marked as organic wins over Meta\'s click ID on posts');
  assert.equal(adClick(page('?fbclid=x&utm_medium=bio')).ad_network, null);
  assert.equal(adClick(page('?utm_source=newsletter&utm_medium=cpc')).ad_network, null, 'paid, on a network we do not know');
  assert.equal(adClick(page('?utm_source=tiktok&utm_medium=bio')).is_paid_ad, false);
  assert.equal(adClick(page('')).is_paid_ad, false);
  assert.equal(adClick('not a url').is_paid_ad, false);
  assert.equal(adClick(page(''), 'https://l.instagram.com/?u=x').referrer, 'instagram.com');
  assert.equal(adClick(page(''), 'https://mumoo.app/links').referrer, null, 'our own pages are not a source');
  assert.deepEqual(['instagram.com', 'ig', 'instagram', 't.co', 'newsletter', null].map(sourceLabel), ['Instagram', 'Instagram', 'Instagram', 'X', 'newsletter', 'Direct']);
});

test('in-app browsers count as their app, and robots are not counted', () => {
  const instagram = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,2; iOS 17_5; pt_BR)';
  assert.deepEqual(parseAgent(instagram), { browser: 'Instagram App', device: 'Mobile', os: 'iOS', robot: false });
  assert.equal(parseAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) [FBAN/FBIOS;FBAV/450.0]').browser, 'Facebook App');
  assert.equal(parseAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36 musical_ly_2023').browser, 'TikTok App');
  assert.deepEqual(parseAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'),
    { browser: 'Chrome', device: 'Mobile', os: 'Android', robot: false });
  assert.deepEqual(parseAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1'),
    { browser: 'Safari', device: 'Tablet', os: 'iOS', robot: false });
  assert.equal(parseAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Gecko/20100101 Firefox/127.0').device, 'Desktop');
  assert.equal(parseAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)').robot, true);
  assert.equal(parseAgent('Googlebot/2.1').robot, true);
  assert.deepEqual(parseAgent(''), { browser: 'Unknown', device: 'Unknown', os: 'Unknown', robot: false });
});

test('the dashboard: totals, every day of the range, and each breakdown ranked', () => {
  const row = (day, kind, extra = {}) => ({ day, kind, service: null, country: 'BR', browser: 'Instagram App', device: 'Mobile', os: 'iOS', is_paid_ad: false, ad_network: null, source: null, n: 1, ...extra });
  const rows = [
    row('2026-11-16', 'view', { n: 10 }), row('2026-11-16', 'click', { service: 'spotify', n: 6 }),
    row('2026-11-17', 'view', { n: 4, is_paid_ad: true, ad_network: 'meta', country: 'US', browser: 'Chrome' }),
    row('2026-11-17', 'click', { service: 'apple', n: 1, is_paid_ad: true, ad_network: 'meta', country: 'US', browser: 'Chrome' }),
    row('2026-11-17', 'view', { n: 2, source: 'instagram.com' }),
  ];
  const stats = summarise(rows, 7, '2026-11-17');
  assert.deepEqual(stats.totals, { views: 16, clicks: 7, engagement: 7 / 16, paid_views: 4, paid_clicks: 1 });
  assert.equal(stats.daily.length, 7);
  assert.deepEqual([stats.daily[0], stats.daily.at(-2), stats.daily.at(-1)],
    [{ day: '2026-11-11', views: 0, clicks: 0 }, { day: '2026-11-16', views: 10, clicks: 6 }, { day: '2026-11-17', views: 6, clicks: 1 }]);
  assert.deepEqual(stats.services.map(entry => [entry.key, entry.clicks]), [['spotify', 6], ['apple', 1]]);
  assert.deepEqual(stats.traffic.map(entry => [entry.key, entry.views, entry.clicks]), [['organic', 12, 6], ['meta', 4, 1]]);
  assert.deepEqual(stats.countries.map(entry => entry.key), ['BR', 'US']);
  assert.deepEqual(stats.sources.map(entry => entry.key), ['Direct', 'Instagram'], 'organic visits only');
  assert.equal(summarise([], 0, '2026-11-17').daily.length, 1, 'all time with nothing yet is just today');
  assert.equal(summarise(rows, 0, '2026-11-17').from, '2026-11-16', 'all time starts at the first event');
});

test('ad tokens are sealed with the key, and unreadable without it', async () => {
  const before = process.env.PIXEL_TOKEN_KEY;
  try {
    delete process.env.PIXEL_TOKEN_KEY;
    assert.equal(await seal('EAAB-token'), null, 'no key, nothing saved');
    process.env.PIXEL_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    const sealed = await seal('EAAB-token');
    assert.match(sealed, /^v1\./);
    assert.ok(!sealed.includes('EAAB'));
    assert.notEqual(await seal('EAAB-token'), sealed, 'a fresh IV each time');
    assert.equal(await open(sealed), 'EAAB-token');
    process.env.PIXEL_TOKEN_KEY = Buffer.alloc(32, 8).toString('base64');
    assert.equal(await open(sealed), null, 'another key cannot read it');
  } finally {
    if (before === undefined) delete process.env.PIXEL_TOKEN_KEY; else process.env.PIXEL_TOKEN_KEY = before;
  }
});

test('visits and clicks go on to Meta\'s Conversions API and TikTok\'s Events API with the click IDs, IP and user agent', async () => {
  const sent = [];
  const fetcher = async (url, init) => { sent.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response('{}'); };
  const event = {
    kind: 'click', service: 'spotify', id: 'e1', at: 1_763_380_000_000, url: page('?fbclid=IwAR0&ttclid=T1'), referrer: '', ip: '203.0.113.9',
    agent: 'Mozilla/5.0 Instagram', fbclid: 'IwAR0', ttclid: 'T1', title: 'SEM VERGONHA', artist: 'StefnaXYZ',
  };
  const outcome = await forwardEvent(event, { meta: { pixel: '1234567890', token: 'META-TOKEN' }, tiktok: { pixel: 'CTIKTOK123456789', token: 'TT-TOKEN' } }, fetcher);
  assert.deepEqual(outcome, { meta: true, tiktok: true });
  const meta = sent.find(call => call.url.startsWith('https://graph.facebook.com/'));
  assert.match(meta.url, /\/1234567890\/events\?access_token=META-TOKEN$/);
  assert.deepEqual(meta.body.data[0].user_data, { client_ip_address: '203.0.113.9', client_user_agent: 'Mozilla/5.0 Instagram', fbc: 'fb.1.1763380000000.IwAR0' });
  assert.equal(meta.body.data[0].event_name, 'Mumoo Smart Link Click', 'shows as ours in Ads Manager\'s conversion events');
  assert.equal(meta.body.data[0].action_source, 'website');
  assert.deepEqual(meta.body.data[0].custom_data, { content_name: 'SEM VERGONHA', platform: 'Spotify' });
  const tiktok = sent.find(call => call.url.startsWith('https://business-api.tiktok.com/'));
  assert.equal(tiktok.headers['Access-Token'], 'TT-TOKEN');
  assert.equal(tiktok.body.event_source_id, 'CTIKTOK123456789');
  assert.deepEqual(tiktok.body.data[0].user, { ip: '203.0.113.9', user_agent: 'Mozilla/5.0 Instagram', ttclid: 'T1' });
  assert.equal(tiktok.body.data[0].event_id, meta.body.data[0].event_id, 'one event ID, for deduplication');

  sent.length = 0;
  await forwardEvent({ ...event, kind: 'view', fbclid: null, ttclid: null }, { meta: { pixel: '1234567890', token: 'T' }, tiktok: { pixel: 'CTIKTOK123456789', token: 'T' } }, fetcher);
  assert.deepEqual(sent.map(call => call.body.data[0].event_name ?? call.body.data[0].event).sort(), ['PageView', 'ViewContent']);
  assert.ok(!('fbc' in sent[0].body.data[0].user_data || 'ttclid' in (sent[1].body.data[0].user ?? {})));

  const failing = async () => new Response('bad token', { status: 400 });
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await forwardEvent(event, { meta: { pixel: '1', token: 'x' }, tiktok: null }, failing), { meta: false }, 'a refusal is logged, never thrown');
  } finally { console.error = quiet; }
});
