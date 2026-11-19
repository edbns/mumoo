import { creditsAdded } from '../lib/letters.mjs';
import { sendMail } from '../lib/mail.mjs';
import { creditsOf, polarEvent, recordPaid, recordRefund } from '../lib/polar.mjs';

const money = (cents, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

/** The receipt for a newly recorded order. Best effort: the credits are in either way, and the invoice is in Invoices. */
async function sendReceipt(order, recorded) {
  try {
    const credits = await creditsOf(recorded.userId);
    const paid = money(order.total_amount ?? 0, (order.currency ?? 'usd').toUpperCase());
    await sendMail({ to: recorded.email, ...creditsAdded(recorded.videos, credits, paid, process.env.URL), once: `credits-${order.id}` });
  } catch (cause) {
    console.error('credits receipt:', cause);
  }
}

/**
 * POST /api/polar/webhook — Polar's events (registered by `scripts/polar-setup.mjs`). `order.paid` adds the pack's videos to the
 * person's credits and emails them a receipt, `order.refunded` takes them back after a full refund. Anything not signed by Polar
 * is refused; events we do not use are acknowledged, so Polar does not send them again.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!process.env.DATABASE_URL || !process.env.POLAR_WEBHOOK_SECRET) return new Response(null, { status: 503 });
  const event = polarEvent(await request.text(), request.headers);
  if (!event) return new Response(null, { status: 403 });
  try {
    if (event.type === 'order.paid') {
      const recorded = await recordPaid(event.data);
      if (recorded?.email) await sendReceipt(event.data, recorded);
    }
    if (event.type === 'order.refunded' || event.type === 'order.updated') await recordRefund(event.data);
  } catch (cause) {
    // A failure is answered with an error, so Polar tries again (up to 10 times); recording is safe to repeat.
    console.error('polar webhook:', event.type, cause);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 202 });
}

export const config = { path: '/api/polar/webhook' };
