import { db, personFrom } from '../lib/person.mjs';
import { polar, polarReady } from '../lib/polar.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const ORDER_ID = /^[A-Za-z0-9_-]{8,64}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Polar's invoice file for an order (a link that works for a short while). Polar makes it on first request, which takes a moment. */
async function invoiceUrl(orderId) {
  const path = `/v1/orders/${orderId}/invoice`;
  const read = () => polar(path).then(invoice => invoice?.url ?? null, cause => { if (cause.status === 404) return null; throw cause; });
  let url = await read();
  if (url) return url;
  await polar(path, { method: 'POST' }).catch(cause => { if (cause.status !== 409) throw cause; });
  for (let tries = 0; tries < 4 && !url; tries++) {
    await sleep(1500);
    url = await read();
  }
  return url;
}

/**
 * GET /api/invoices — the person's payments, newest first, as the Invoices page lists them.
 * GET /api/invoices?id=… — the invoice file for one of them: {url}.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  const id = new URL(request.url).searchParams.get('id');

  if (id === null) {
    const rows = await db()`
      select id, invoice_number, videos, amount, currency, status, paid_at from credit_orders
      where user_id = ${person.id} order by paid_at desc limit 200`;
    return reply(200, {
      invoices: rows.map(row => ({
        id: row.id, number: row.invoice_number ?? row.id.slice(0, 8).toUpperCase(), createdAt: row.paid_at,
        description: `${row.videos.toLocaleString('en')} video credits`, amount: row.amount, currency: row.currency, status: row.status,
      })),
    });
  }

  if (!ORDER_ID.test(id)) return reply(400, { error: 'Unknown invoice.' });
  const [mine] = await db()`select id from credit_orders where id = ${id} and user_id = ${person.id}`;
  if (!mine) return reply(404, { error: 'Unknown invoice.' });
  if (!polarReady()) return reply(503, { error: 'Invoices are unavailable right now.' });
  try {
    const url = await invoiceUrl(id);
    return url ? reply(200, { url }) : reply(202, { error: 'Your invoice is being prepared. Try again in a minute.' });
  } catch (cause) {
    console.error('invoice:', cause.message, cause.detail ?? '');
    return reply(502, { error: 'Your invoice is unavailable right now. Try again in a moment.' });
  }
}

export const config = { path: '/api/invoices', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
