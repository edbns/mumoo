import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';

const PERIODS = new Set([7, 30, 90, 365]);

/**
 * GET /api/admin/stats?days=30: the overview's charts and totals for the last `days` days (UTC days, today included), each
 * total beside the same length of time just before it. Amounts are in cents; sales in other currencies than USD are counted
 * as orders but left out of the revenue line.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return refuse(405, 'Use GET.');
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  const days = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!PERIODS.has(days)) return refuse(400, 'Pick 7, 30, 90 or 365 days.');
  try {
    const sql = db();
    // Twice the period: the first half is the one before, for the change beside each total.
    const span = days * 2;
    const [daily, renders, services, clicksByService, viewsByCountry, viewsBySource, people] = await Promise.all([
      sql`
        with d as (select generate_series(current_date - (${span}::int - 1), current_date, interval '1 day')::date as day),
        since as (select current_date - (${span}::int - 1) as day),
        u as (select created_at::date as day, count(*)::int as n from app_users where created_at >= (select day from since) group by 1),
        seen as (select last_seen_at::date as day, count(*)::int as n from app_users where last_seen_at >= (select day from since) group by 1),
        o as (select paid_at::date as day, count(*)::int as n, coalesce(sum(amount) filter (where currency = 'USD'), 0)::bigint as cents, sum(videos)::int as credits
              from credit_orders where status = 'paid' and paid_at >= (select day from since) group by 1),
        r as (select refunded_at::date as day, count(*)::int as n from credit_orders where status = 'refunded' and refunded_at >= (select day from since) group by 1),
        q as (select finished_at::date as day, count(*) filter (where status = 'done')::int as done, count(*) filter (where status = 'failed')::int as failed
              from render_queue where finished_at >= (select day from since) group by 1),
        f as (select created_at::date as day, count(*)::int as n from credit_spends where free and render_id is not null and created_at >= (select day from since) group by 1),
        up as (select created_at::date as day, count(*)::int as n from uploads where created_at >= (select day from since) group by 1),
        l as (select created_at::date as day, count(*)::int as n from smart_links where created_at >= (select day from since) group by 1),
        v as (select day, sum(views)::int as n from smart_link_views where day >= (select day from since) group by 1),
        c as (select day, sum(clicks)::int as n from smart_link_clicks where day >= (select day from since) group by 1)
        select d.day, coalesce(u.n, 0) as signups, coalesce(o.n, 0) as orders, coalesce(o.cents, 0) as revenue, coalesce(r.n, 0) as refunds,
          coalesce(o.credits, 0) as credits_sold, coalesce(q.done, 0) as videos, coalesce(q.failed, 0) as failed, coalesce(f.n, 0) as free_videos,
          coalesce(up.n, 0) as uploads, coalesce(l.n, 0) as links, coalesce(v.n, 0) as link_views, coalesce(c.n, 0) as link_clicks, coalesce(seen.n, 0) as last_seen
        from d left join u using (day) left join seen using (day) left join o using (day) left join r using (day) left join q using (day)
          left join f using (day) left join up using (day) left join l using (day) left join v using (day) left join c using (day)
        order by d.day`,
      sql`
        select status, count(*)::int as count,
          percentile_cont(0.5) within group (order by extract(epoch from finished_at - started_at)) filter (where status = 'done' and started_at is not null) as make_s,
          percentile_cont(0.5) within group (order by extract(epoch from coalesce(started_at, now()) - created_at)) filter (where started_at is not null) as wait_s
        from render_queue where created_at > now() - make_interval(days => ${days}) group by status`,
      sql`
        select service, count(*)::int as calls, count(*) filter (where ok)::int as ok, round(avg(ms))::int as avg_ms,
          percentile_cont(0.95) within group (order by ms)::int as p95_ms
        from service_events where at > now() - make_interval(days => ${days}) group by service order by service`,
      sql`select service, sum(clicks)::int as clicks from smart_link_clicks where day > current_date - ${days}::int group by service order by clicks desc limit 12`,
      sql`select coalesce(country, '?') as country, count(*)::int as views from smart_link_events where kind = 'view' and at > now() - make_interval(days => ${days}) group by 1 order by views desc limit 12`,
      sql`select source, sum(views)::int as views from smart_link_views where day > current_date - ${days}::int group by source order by views desc limit 12`,
      sql`
        select
          (select count(*)::int from app_users) as people,
          (select count(*)::int from app_users where last_seen_at > now() - interval '1 day') as active_1,
          (select count(*)::int from app_users where last_seen_at > now() - interval '7 days') as active_7,
          (select count(*)::int from app_users where last_seen_at > now() - interval '30 days') as active_30,
          (select count(distinct user_id)::int from credit_orders where status = 'paid') as buyers,
          (select count(distinct user_id)::int from credit_spends where render_id is not null) as makers,
          (select count(*)::int from render_queue where status in ('queued', 'starting', 'running')) as rendering,
          (select count(*)::int from smart_links) as links,
          (select count(*)::int from referrals) as referred,
          (select count(*)::int from referrals where rewarded_at is not null) as referred_paid,
          (select coalesce(sum(bytes), 0)::bigint from uploads) + (select coalesce(sum(bytes), 0)::bigint from renders) as stored_bytes`,
    ]);
    const series = daily.map(row => ({
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      signups: row.signups, orders: row.orders, revenue: Number(row.revenue), refunds: row.refunds, creditsSold: row.credits_sold,
      videos: row.videos, failed: row.failed, freeVideos: row.free_videos, uploads: row.uploads, links: row.links,
      linkViews: row.link_views, linkClicks: row.link_clicks, lastSeen: row.last_seen,
    }));
    const [p] = people;
    return reply(200, {
      days,
      series: series.slice(days),
      before: series.slice(0, days),
      renders: renders.map(row => ({ status: row.status, count: row.count, makeSeconds: row.make_s === null ? null : Number(row.make_s), waitSeconds: row.wait_s === null ? null : Number(row.wait_s) })),
      services: services.map(row => ({ service: row.service, calls: row.calls, ok: row.ok, avgMs: row.avg_ms, p95Ms: row.p95_ms })),
      clicksByService, viewsByCountry, viewsBySource,
      people: {
        total: p.people, active1: p.active_1, active7: p.active_7, active30: p.active_30, buyers: p.buyers, makers: p.makers,
        rendering: p.rendering, links: p.links, referred: p.referred, referredPaid: p.referred_paid, storedBytes: Number(p.stored_bytes),
      },
    });
  } catch (cause) {
    console.error('admin stats:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/stats', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
