import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';

/** Newest first, at most this many: the page sorts, filters and exports them on the computer. */
const LIMIT = 5000;

/** One query per list. Emails are shown to the admin only; tokens, secrets and file addresses never leave the database. */
const LISTS = {
  people: sql => sql`
    select u.member_no, u.email, u.created_at, u.last_seen_at,
      coalesce(o.orders, 0)::int as orders, coalesce(o.spent, 0)::bigint as spent_cents, coalesce(o.bought, 0)::int as credits_bought,
      coalesce(b.given, 0)::int as credits_given, coalesce(s.used, 0)::int as credits_used, coalesce(s.free, false) as free_used,
      coalesce(q.done, 0)::int as videos, coalesce(q.failed, 0)::int as failed, coalesce(up.n, 0)::int as uploads,
      coalesce(up.bytes, 0)::bigint + coalesce(rd.bytes, 0)::bigint as stored_bytes, coalesce(l.n, 0)::int as links,
      ref.email as referred_by
    from app_users u
    left join (select user_id, count(*) as orders, sum(amount) filter (where currency = 'USD') as spent, sum(videos) as bought
               from credit_orders where status = 'paid' group by user_id) o on o.user_id = u.id
    left join (select user_id, sum(videos) as given from credit_bonuses where revoked_at is null group by user_id) b on b.user_id = u.id
    left join (select user_id, sum(videos) filter (where not free and render_id is not null) as used, bool_or(free and render_id is not null) as free
               from credit_spends group by user_id) s on s.user_id = u.id
    left join (select user_id, count(*) filter (where status = 'done') as done, count(*) filter (where status = 'failed') as failed
               from render_queue group by user_id) q on q.user_id = u.id
    left join (select user_id, count(*) as n, sum(bytes) as bytes from uploads group by user_id) up on up.user_id = u.id
    left join (select user_id, sum(bytes) as bytes from renders group by user_id) rd on rd.user_id = u.id
    left join (select user_id, count(*) as n from smart_links group by user_id) l on l.user_id = u.id
    left join referrals r on r.friend_id = u.id
    left join app_users ref on ref.id = r.referrer_id
    order by u.created_at desc limit ${LIMIT}`,
  orders: sql => sql`
    select o.invoice_number, o.id, u.email, o.videos, o.amount, o.currency, o.status, o.paid_at, o.refunded_at
    from credit_orders o join app_users u on u.id = o.user_id
    order by o.paid_at desc limit ${LIMIT}`,
  videos: sql => sql`
    select q.id, u.email, q.status, q.attempts, q.error, q.created_at, q.started_at, q.finished_at,
      extract(epoch from q.started_at - q.created_at)::int as wait_s, extract(epoch from q.finished_at - q.started_at)::int as make_s,
      coalesce(s.free, false) as free
    from render_queue q join app_users u on u.id = q.user_id left join credit_spends s on s.render_id = q.id
    order by q.created_at desc limit ${LIMIT}`,
  links: sql => sql`
    select l.slug, u.email, l.link->>'title' as title, l.link->>'artist' as artist, l.created_at, l.updated_at,
      coalesce(v.views, 0)::int as views, coalesce(c.clicks, 0)::int as clicks, c.top_service,
      (l.meta_pixel_id is not null or l.tiktok_pixel_id is not null or l.google_ads_id is not null) as ad_tracking
    from smart_links l join app_users u on u.id = l.user_id
    left join (select slug, sum(views) as views from smart_link_views group by slug) v on v.slug = l.slug
    left join (select slug, sum(clicks) as clicks, (array_agg(service order by clicks desc))[1] as top_service from smart_link_clicks group by slug) c on c.slug = l.slug
    order by l.created_at desc limit ${LIMIT}`,
  uploads: sql => sql`
    select up.id, u.email, up.kind, up.status, up.bytes, up.error, up.created_at
    from uploads up join app_users u on u.id = up.user_id
    order by up.created_at desc limit ${LIMIT}`,
  referrals: sql => sql`
    select friend.email as friend, referrer.email as referrer, r.created_at, r.rewarded_at, r.order_id
    from referrals r join app_users friend on friend.id = r.friend_id join app_users referrer on referrer.id = r.referrer_id
    order by r.created_at desc limit ${LIMIT}`,
};

/** GET /api/admin/records?list=people|orders|videos|links|uploads|referrals: one list, for the admin's tables and their CSV. */
export default async function handler(request) {
  if (request.method !== 'GET') return refuse(405, 'Use GET.');
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  const list = new URL(request.url).searchParams.get('list') ?? '';
  if (!Object.hasOwn(LISTS, list)) return refuse(400, `Pick one of: ${Object.keys(LISTS).join(', ')}.`);
  try {
    const rows = await LISTS[list](db());
    return reply(200, { list, rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]))), limit: LIMIT });
  } catch (cause) {
    console.error('admin records:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/records', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
