import { polarEvent, recordPaid, recordRefund } from '../lib/polar.mjs';

/**
 * POST /api/polar/webhook — Polar's events (registered by `scripts/polar-setup.mjs`). `order.paid` adds the pack's videos to the
 * person's credits, `order.refunded` takes them back after a full refund. Anything not signed by Polar is refused; events we do
 * not use are acknowledged, so Polar does not send them again.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!process.env.DATABASE_URL || !process.env.POLAR_WEBHOOK_SECRET) return new Response(null, { status: 503 });
  const event = polarEvent(await request.text(), request.headers);
  if (!event) return new Response(null, { status: 403 });
  try {
    if (event.type === 'order.paid') await recordPaid(event.data);
    if (event.type === 'order.refunded' || event.type === 'order.updated') await recordRefund(event.data);
  } catch (cause) {
    // A failure is answered with an error, so Polar tries again (up to 10 times); recording is safe to repeat.
    console.error('polar webhook:', event.type, cause);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 202 });
}

export const config = { path: '/api/polar/webhook' };
