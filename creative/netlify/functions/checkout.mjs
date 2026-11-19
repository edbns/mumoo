import { db, personFrom, recordPerson } from '../lib/person.mjs';
import { creditsOf } from '../lib/credits.mjs';
import { polar, polarReady, productFor } from '../lib/polar.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const CHECKOUT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * POST /api/checkout with {usd} — opens Polar's checkout for that pack, for the signed-in person, and returns its {url}. Polar
 * brings them back to `/?checkout_id=…`; the credits are added when Polar's webhook says the order is paid (`polar-webhook.mjs`).
 * GET /api/checkout?id=… — whether that checkout's payment has reached us yet, the videos it added (and a friend's invite with it), and the person's credits.
 */
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'Use GET or POST.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });

  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!CHECKOUT_ID.test(id)) return reply(400, { error: 'Unknown checkout.' });
    const [order] = await db()`
      select o.videos, coalesce((select sum(b.videos) from credit_bonuses b where b.order_id = o.id and b.user_id = o.user_id and b.revoked_at is null), 0) as bonus
      from credit_orders o where o.checkout_id = ${id} and o.user_id = ${person.id} and o.status = 'paid' limit 1`;
    if (!order) return reply(200, { status: 'pending' });
    return reply(200, { status: 'paid', videos: order.videos, bonus: Number(order.bonus), credits: await creditsOf(person.id) });
  }

  if (!polarReady()) return reply(503, { error: 'Payments aren’t switched on yet.' });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.usd !== 'number') return reply(400, { error: 'Choose a pack.' });
  if (!await recordPerson(person)) return reply(401, { error: 'Sign in to continue.' });
  try {
    const product = await productFor(body.usd);
    if (!product) return reply(400, { error: 'That pack isn’t on sale.' });
    const origin = new URL(request.url).origin;
    const open = email => polar('/v1/checkouts/', {
      method: 'POST',
      body: {
        products: [product.id],
        external_customer_id: person.id,
        ...(email ? { customer_email: email } : {}),
        metadata: { mumoo_user: person.id },
        success_url: `${origin}/?checkout_id={CHECKOUT_ID}`,
        return_url: `${origin}/`,
      },
    });
    // Polar refuses an address whose domain it cannot deliver to; the person then types one on Polar's page instead.
    const checkout = await open(person.email).catch(cause => {
      if (cause.status === 422 && /customer_email/.test(cause.detail ?? '')) return open(null);
      throw cause;
    });
    return reply(200, { url: checkout.url });
  } catch (cause) {
    console.error('checkout:', cause.message, cause.detail ?? '');
    return reply(502, { error: 'Checkout is unavailable right now. Try again in a moment.' });
  }
}

export const config = { path: '/api/checkout', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
