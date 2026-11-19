import { creditsOf } from '../lib/credits.mjs';
import { creditsAdded, referralEarned } from '../lib/letters.mjs';
import { sendMail } from '../lib/mail.mjs';
import { polarEvent, recordPaid, recordRefund } from '../lib/polar.mjs';
import { REFERRAL_VIDEOS, revokeReferral, rewardReferral } from '../lib/referrals.mjs';

const money = (cents, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

/** The receipt for a newly recorded order. Best effort: the credits are in either way, and the invoice is in Invoices. */
async function sendReceipt(order, recorded, bonus) {
  try {
    const credits = await creditsOf(recorded.userId);
    const paid = money(order.total_amount ?? 0, (order.currency ?? 'usd').toUpperCase());
    await sendMail({ to: recorded.email, ...creditsAdded(recorded.videos, credits, paid, process.env.URL, bonus), once: `credits-${order.id}` });
  } catch (cause) {
    console.error('credits receipt:', cause);
  }
}

/** Tells the inviter their friend's purchase earned them videos. Best effort, like the receipt. */
async function tellReferrer(order, reward) {
  try {
    const credits = await creditsOf(reward.referrerId);
    await sendMail({ to: reward.email, ...referralEarned(REFERRAL_VIDEOS, credits, process.env.URL), once: `referral-${order.id}` });
  } catch (cause) {
    console.error('referral email:', cause);
  }
}

/**
 * POST /api/polar/webhook — Polar's events (registered by `scripts/polar-setup.mjs`). `order.paid` adds the pack's videos to the
 * person's credits, gives the referral bonuses when it is an invited friend's first pack, and emails a receipt; `order.refunded`
 * takes the videos (and those bonuses) back after a full refund. Anything not signed by Polar is refused; events we do not use are
 * acknowledged, so Polar does not send them again.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!process.env.DATABASE_URL || !process.env.POLAR_WEBHOOK_SECRET) return new Response(null, { status: 503 });
  const event = polarEvent(await request.text(), request.headers);
  if (!event) return new Response(null, { status: 403 });
  try {
    if (event.type === 'order.paid') {
      const recorded = await recordPaid(event.data);
      // Rewarding is safe to repeat, so a retry after a failure here still gives the bonuses (and then the receipt) once.
      const reward = recorded ? await rewardReferral(recorded.userId, event.data.id) : null;
      if (recorded?.email && (recorded.first || reward)) await sendReceipt(event.data, recorded, reward ? REFERRAL_VIDEOS : 0);
      if (reward?.rewarded && reward.email) await tellReferrer(event.data, reward);
    }
    if (event.type === 'order.refunded' || event.type === 'order.updated') {
      await recordRefund(event.data);
      // Also on a retry, after the order was marked refunded by an attempt that then failed.
      if (event.data?.status === 'refunded' && typeof event.data.id === 'string') await revokeReferral(event.data.id);
    }
  } catch (cause) {
    // A failure is answered with an error, so Polar tries again (up to 10 times); recording is safe to repeat.
    console.error('polar webhook:', event.type, cause);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 202 });
}

export const config = { path: '/api/polar/webhook' };
