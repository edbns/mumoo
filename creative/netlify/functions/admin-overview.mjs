import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';

/**
 * GET /api/admin/overview: who is signed in and the few numbers for the first page, money included. This is also how the page
 * learns whether the person may be there.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return refuse(405, 'Use GET.');
  const { admin, refusal } = await adminFrom(request);
  if (refusal) return refusal;
  try {
    const [counts] = await db()`
      select
        (select count(*)::int from library_items where arrived and status = 'approved') as approved,
        (select count(*)::int from library_items where arrived and status = 'pending') as pending,
        (select count(*)::int from library_items where arrived and status = 'hidden') as hidden,
        (select count(*)::int from problems where seen_at is null) as unseen_problems,
        (select count(*)::int from app_users) as people`;
    // Amounts are in cents, as Polar sends them. One currency today (USD); each is summed on its own all the same.
    const [money, sales, recent] = await Promise.all([
      db()`
        select
          coalesce((select sum(videos) from credit_orders where status = 'paid'), 0)::int as sold,
          coalesce((select sum(videos) from credit_bonuses where revoked_at is null), 0)::int as bonus,
          coalesce((select sum(videos) from credit_spends where not free and render_id is not null), 0)::int as used,
          (select count(*)::int from credit_spends where free and render_id is not null) as free,
          (select count(distinct user_id)::int from credit_orders where status = 'paid') as buyers`,
      db()`
        select currency, status, count(*)::int as orders, coalesce(sum(amount), 0)::bigint as amount,
          coalesce(sum(amount) filter (where paid_at > now() - interval '30 days'), 0)::bigint as last30
        from credit_orders group by currency, status order by currency, status`,
      db()`select paid_at, videos, amount, currency, status from credit_orders order by paid_at desc limit 10`,
    ]);
    const [credits] = money;
    return reply(200, {
      email: admin.email,
      library: { approved: counts.approved, pending: counts.pending, hidden: counts.hidden },
      problems: { unseen: counts.unseen_problems },
      people: counts.people,
      money: {
        sales: sales.map(row => ({ currency: row.currency, status: row.status, orders: row.orders, amount: Number(row.amount), last30: Number(row.last30) })),
        credits: { sold: credits.sold, bonus: credits.bonus, used: credits.used, free: credits.free, buyers: credits.buyers },
        recent: recent.map(row => ({ at: row.paid_at, videos: row.videos, amount: row.amount, currency: row.currency, status: row.status })),
      },
    });
  } catch (cause) {
    console.error('admin overview:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/overview', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
