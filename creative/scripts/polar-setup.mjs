/**
 * Sets up our Polar organisation once (safe to run again): the three packs as one-time products, and the webhook that tells
 * our server about payments.
 *   POLAR_ACCESS_TOKEN=… node scripts/polar-setup.mjs [site address]
 * POLAR_SERVER=production for the real organisation; otherwise the sandbox. The site address defaults to staging; the live one
 * is https://mumoo.app.
 * The webhook's secret is never printed: it goes straight into that Netlify site's POLAR_WEBHOOK_SECRET (through Netlify's API, with
 * NETLIFY_AUTH_TOKEN or the Netlify CLI's saved sign-in).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { API_VERSION, apiBase, PACKS, polar } from '../netlify/lib/polar.mjs';
import { SITES } from '../netlify/lib/sites.mjs';

const site = (process.argv[2] ?? 'https://mumoo-staging.netlify.app').replace(/\/+$/, '');
const SITE_ID = SITES.find(each => each.origin === site)?.id;
if (!SITE_ID) throw new Error(`${site} is not one of our sites.`);

async function saveSecret(key, value) {
  const token = process.env.NETLIFY_AUTH_TOKEN || Object.values(JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, 'utf8')).users)
    .find(user => user.auth?.token)?.auth.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { account_id: account } = await (await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, { headers })).json();
  const body = [{ key, scopes: ['functions', 'runtime'], is_secret: true, values: [{ context: 'production', value }] }];
  const response = await fetch(`https://api.netlify.com/api/v1/accounts/${account}/env?site_id=${SITE_ID}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Netlify refused ${key}: ${response.status}`);
}
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
  await saveSecret('POLAR_WEBHOOK_SECRET', made.secret).catch(cause => {
    throw new Error(`The webhook was made, but its secret could not be saved to Netlify: ${String(cause.message).replaceAll(made.secret, '…')}`);
  });
  console.log(`webhook ${url}: made; its secret is saved to Netlify as POLAR_WEBHOOK_SECRET`);
}
