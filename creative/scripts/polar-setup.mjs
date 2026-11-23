/**
 * Sets up our Polar organisation once (safe to run again): the three packs as one-time products, and the webhook that tells
 * our server about payments.
 *   POLAR_ACCESS_TOKEN=… node scripts/polar-setup.mjs [site address]
 * POLAR_SERVER=production for the real organisation; otherwise the sandbox. The site address defaults to staging.
 * The webhook's secret is never printed: it goes straight into the Netlify site's POLAR_WEBHOOK_SECRET.
 */
import { spawnSync } from 'node:child_process';
import { API_VERSION, apiBase, PACKS, polar } from '../netlify/lib/polar.mjs';

const SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const site = (process.argv[2] ?? 'https://mumoo-staging.netlify.app').replace(/\/+$/, '');
const EVENTS = ['order.paid', 'order.updated', 'order.refunded'];
if (!process.env.POLAR_ACCESS_TOKEN) throw new Error('POLAR_ACCESS_TOKEN is not set.');
console.log(`Polar: ${apiBase()}`);

const { items: existing } = await polar('/v1/products/?is_archived=false&limit=100');
for (const pack of PACKS) {
  const found = existing.find(item => Number(item.metadata?.mumoo_videos) === pack.videos && !item.is_recurring);
  if (found) {
    console.log(`pack ${pack.videos} videos: ${found.id} (already there)`);
    continue;
  }
  const product = await polar('/v1/products/', {
    method: 'POST',
    body: {
      name: `${pack.videos} videos`,
      description: `${pack.videos} mumoo credits. One credit makes one video. Credits never expire.`,
      prices: [{ amount_type: 'fixed', price_amount: pack.usd * 100, price_currency: 'usd', tax_behavior: 'exclusive' }],
      metadata: { mumoo_videos: pack.videos },
    },
  });
  console.log(`pack ${pack.videos} videos: ${product.id} (made, $${pack.usd})`);
}

const url = `${site}/api/polar/webhook`;
const { items: endpoints } = await polar('/v1/webhooks/endpoints?limit=100');
const endpoint = endpoints.find(item => item.url === url);
if (endpoint) {
  await polar(`/v1/webhooks/endpoints/${endpoint.id}`, { method: 'PATCH', body: { events: EVENTS, api_version: API_VERSION, enabled: true } });
  console.log(`webhook ${url}: already there (events and version brought up to date; its secret is unchanged)`);
} else {
  const made = await polar('/v1/webhooks/endpoints', { method: 'POST', body: { url, name: 'mumoo credits', format: 'raw', events: EVENTS, api_version: API_VERSION } });
  const set = spawnSync('npx', ['--yes', 'netlify-cli', 'env:set', 'POLAR_WEBHOOK_SECRET', made.secret, `--site=${SITE_ID}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (set.status !== 0) throw new Error(`The webhook was made, but its secret could not be saved to Netlify: ${set.stderr.toString().replaceAll(made.secret, '…')}`);
  console.log(`webhook ${url}: made; its secret is saved to Netlify as POLAR_WEBHOOK_SECRET`);
}
