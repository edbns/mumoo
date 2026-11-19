import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';
import { PACKS, polarEvent, videosIn } from '../netlify/lib/polar.mjs';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CREDIT_PACKS, perVideo } = await server.ssrLoadModule('/src/credit-packs.ts');
await server.close();

const NOW = 1_795_000_000_000;
const body = JSON.stringify({ type: 'order.paid', data: { id: 'order_1' } });
const signed = (key, { id = 'msg_1', at = NOW / 1000, text = body } = {}) => new Headers({
  'webhook-id': id,
  'webhook-timestamp': String(Math.floor(at)),
  'webhook-signature': `v1,${createHmac('sha256', key).update(`${id}.${Math.floor(at)}.${text}`).digest('base64')}`,
});

test('the packs on the page are the packs the server sells', () => {
  assert.deepEqual(CREDIT_PACKS.map(({ usd, videos }) => ({ usd, videos })), PACKS);
  assert.deepEqual(CREDIT_PACKS.map(perVideo), ['25¢', '20¢', '17¢']);
  assert.equal(CREDIT_PACKS.filter(pack => pack.popular).length, 1);
});

test('a Polar webhook is accepted only when Polar signed it, recently', () => {
  // Since 8 Sep 2026 the key is the base64 after whsec_ (Standard Webhooks); older secrets sign with the whole string's bytes.
  const secret = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;
  assert.equal(polarEvent(body, signed(Buffer.from(secret.slice(6), 'base64')), secret, NOW)?.type, 'order.paid');
  assert.equal(polarEvent(body, signed(Buffer.from(secret, 'utf8')), secret, NOW)?.data.id, 'order_1');
  assert.equal(polarEvent(body, signed(Buffer.from('another secret')), secret, NOW), null, 'wrong key');
  assert.equal(polarEvent(body.replace('order_1', 'order_2'), signed(Buffer.from(secret, 'utf8')), secret, NOW), null, 'changed body');
  assert.equal(polarEvent(body, signed(Buffer.from(secret, 'utf8'), { at: NOW / 1000 - 600 }), secret, NOW), null, 'too old');
  assert.equal(polarEvent(body, new Headers(), secret, NOW), null, 'unsigned');
  assert.equal(polarEvent(body, signed(Buffer.from('', 'utf8')), '', NOW), null, 'no secret set');
  const several = signed(Buffer.from(secret, 'utf8'));
  several.set('webhook-signature', `v1,AAAA ${several.get('webhook-signature')}`);
  assert.ok(polarEvent(body, several, secret, NOW), 'any one of several signatures');
});

test('an order buys the videos of its pack, and nothing for any other product', () => {
  assert.equal(videosIn({ product: { metadata: { mumoo_videos: 100 } } }), 100);
  assert.equal(videosIn({ product: { metadata: { mumoo_videos: '300' } } }), 300);
  assert.equal(videosIn({ product: { metadata: { mumoo_videos: 7 } } }), 0);
  assert.equal(videosIn({ product: { metadata: {} } }), 0);
  assert.equal(videosIn(null), 0);
});

test('the pricing page has its address, and the webhook is not behind the staging gate', () => {
  const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /from = "\/pricing"\n {2}to = "\/pricing\.html"/);
  assert.match(readFileSync(new URL('../vite.config.mjs', import.meta.url), 'utf8'), /pricing\.html/);
  assert.match(readFileSync(new URL('../dev/local-preview-api.mjs', import.meta.url), 'utf8'), /\/pricing\.html/);
  assert.doesNotMatch(readFileSync(new URL('../netlify/functions/polar-webhook.mjs', import.meta.url), 'utf8'), /validAccess/);
});
