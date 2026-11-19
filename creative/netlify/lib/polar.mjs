import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './person.mjs';

/** The packs on sale: price in dollars and the videos it buys (one credit makes one video). The page's are in `src/credit-packs.ts`. */
export const PACKS = [
  { usd: 5, videos: 20 },
  { usd: 20, videos: 100 },
  { usd: 50, videos: 300 },
];

/** Requests and webhooks are pinned to one API version, so a quarterly release at Polar cannot change what we read. */
export const API_VERSION = '2026-10';
/** Polar's sandbox (test cards, no real money) until POLAR_SERVER is "production". */
export const apiBase = () => (process.env.POLAR_SERVER === 'production' ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh');
export const polarReady = () => Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_WEBHOOK_SECRET);

/** One request to Polar's API with our organisation token. Throws with Polar's status when it refuses. */
export async function polar(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`, 'Polar-Version': API_VERSION, Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = new Error(`Polar ${method} ${path.split('?')[0]}: ${response.status}`);
    error.status = response.status;
    error.detail = await response.text().catch(() => '');
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

/** Our products are found by the `mumoo_videos` metadata the setup script gives them, so no product id lives in our settings. */
let products;
export async function productFor(usd) {
  const pack = PACKS.find(each => each.usd === usd);
  if (!pack) return null;
  products ??= polar('/v1/products/?is_archived=false&limit=100').then(result => result.items, cause => { products = undefined; throw cause; });
  const product = (await products).find(item => Number(item.metadata?.mumoo_videos) === pack.videos && !item.is_recurring);
  return product ? { id: product.id, ...pack } : null;
}

/** How many videos an order buys, from its product's metadata. Zero for anything that is not one of our packs. */
export function videosIn(order) {
  const videos = Number(order?.product?.metadata?.mumoo_videos);
  return PACKS.some(pack => pack.videos === videos) ? videos : 0;
}

/** A request older (or newer) than this is turned away, so a captured one cannot be sent again later. */
const FRESH_SECONDS = 5 * 60;

/**
 * The event Polar sent, or null when the request is not really from Polar. Polar signs `id.timestamp.body` with HMAC-SHA256
 * (Standard Webhooks). The key depends on when the secret was made: since 8 September 2026 it is the base64 after `whsec_`,
 * before then it is the whole secret string's bytes. Both are tried, as Polar's own SDKs do.
 */
export function polarEvent(rawBody, headers, secret = process.env.POLAR_WEBHOOK_SECRET, now = Date.now()) {
  const id = headers.get('webhook-id') ?? '';
  const timestamp = headers.get('webhook-timestamp') ?? '';
  const signatures = (headers.get('webhook-signature') ?? '').split(' ')
    .map(part => part.split(','))
    .filter(([version, value]) => version === 'v1' && value)
    .map(([, value]) => Buffer.from(value, 'base64'));
  if (!secret || !id || !/^\d+$/.test(timestamp) || !signatures.length) return null;
  if (Math.abs(now / 1000 - Number(timestamp)) > FRESH_SECONDS) return null;
  const keys = [Buffer.from(secret, 'utf8')];
  if (secret.startsWith('whsec_')) keys.unshift(Buffer.from(secret.slice('whsec_'.length), 'base64'));
  const signed = keys.map(key => createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest());
  if (!signed.some(mine => signatures.some(theirs => theirs.length === mine.length && timingSafeEqual(theirs, mine)))) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

/** Whose order it is: the account the checkout was opened for (we set it as Polar's external customer id). */
const accountOf = order => order?.customer?.external_id || order?.metadata?.mumoo_user || null;

/**
 * Records a paid order once (Polar may send the same event again), which adds its videos to the person's credits. An order for
 * an account deleted since is left out. Returns the account's id and email when this event recorded it for the first time.
 */
export async function recordPaid(order) {
  const userId = accountOf(order);
  const videos = videosIn(order);
  if (!userId || !videos || typeof order.id !== 'string') return false;
  const rows = await db()`
    insert into credit_orders (id, user_id, checkout_id, videos, amount, currency, invoice_number, status, paid_at)
    select ${order.id}, ${userId}, ${order.checkout_id ?? null}, ${videos}, ${order.total_amount ?? 0}, ${(order.currency ?? 'usd').toUpperCase()},
      ${order.invoice_number ?? null}, 'paid', ${order.created_at ?? new Date().toISOString()}
    where exists (select 1 from app_users where id = ${userId})
    on conflict (id) do update set invoice_number = coalesce(excluded.invoice_number, credit_orders.invoice_number)
    returning (xmax = 0) as first, (select email from app_users where id = ${userId}) as email`;
  return rows[0]?.first ? { userId, email: rows[0].email, videos } : null;
}

/** A fully refunded order takes its videos back. A partial refund leaves the credits as they are (it is settled by hand). */
export async function recordRefund(order) {
  if (order?.status !== 'refunded' || typeof order.id !== 'string') return false;
  const rows = await db()`update credit_orders set status = 'refunded', refunded_at = now() where id = ${order.id} and status = 'paid' returning id`;
  return rows.length > 0;
}
