/**
 * A smart link's analytics, for its page in My Smart Links, from its events counted together by day and by everything shown
 * (`statsRows` in smart-links.mjs): totals, a day-by-day timeline, and visits and clicks per service, traffic (organic or the ad
 * network), source, country, browser, device and operating system.
 */

import { sourceLabel } from './traffic-source.mjs';

const DAY_MS = 86_400_000;
export const RANGES = [7, 30, 90, 0];

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Rows of {key, views, clicks}, most visited first (most clicked for services). */
function tally(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const entry = counts.get(key) ?? counts.set(key, { key, views: 0, clicks: 0 }).get(key);
    entry[row.kind === 'view' ? 'views' : 'clicks'] += row.n;
  }
  return [...counts.values()].sort((a, b) => b.views - a.views || b.clicks - a.clicks || String(a.key).localeCompare(String(b.key)));
}

/**
 * `rows`: [{day: 'YYYY-MM-DD', kind, service, country, browser, device, os, is_paid_ad, ad_network, source, n}]. `days`: one of
 * RANGES (0 is all time). `today`: 'YYYY-MM-DD', the last day of the timeline.
 */
export function summarise(rows, days, today) {
  const views = rows.filter(row => row.kind === 'view').reduce((sum, row) => sum + row.n, 0);
  const clicks = rows.filter(row => row.kind === 'click').reduce((sum, row) => sum + row.n, 0);
  const paid = rows.filter(row => row.is_paid_ad);
  const end = Date.parse(`${today}T00:00:00Z`);
  const first = rows.reduce((earliest, row) => (row.day < earliest ? row.day : earliest), today);
  const start = days ? end - (days - 1) * DAY_MS : Date.parse(`${first}T00:00:00Z`);
  const byDay = new Map();
  for (let at = start; at <= end; at += DAY_MS) byDay.set(isoDay(at), { day: isoDay(at), views: 0, clicks: 0 });
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (entry) entry[row.kind === 'view' ? 'views' : 'clicks'] += row.n;
  }
  return {
    days, from: isoDay(start), to: today,
    totals: {
      views, clicks, engagement: views ? Math.min(1, clicks / views) : 0,
      paid_views: paid.filter(row => row.kind === 'view').reduce((sum, row) => sum + row.n, 0),
      paid_clicks: paid.filter(row => row.kind === 'click').reduce((sum, row) => sum + row.n, 0),
    },
    daily: [...byDay.values()],
    services: tally(rows.filter(row => row.kind === 'click'), row => row.service).sort((a, b) => b.clicks - a.clicks),
    traffic: tally(rows, row => (row.is_paid_ad ? row.ad_network ?? 'other_ads' : 'organic')),
    sources: tally(rows.filter(row => !row.is_paid_ad), row => sourceLabel(row.source)),
    countries: tally(rows, row => row.country ?? 'Unknown'),
    browsers: tally(rows, row => row.browser ?? 'Unknown'),
    devices: tally(rows, row => row.device ?? 'Unknown'),
    systems: tally(rows, row => row.os ?? 'Unknown'),
  };
}
