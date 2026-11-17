import { db } from './person.mjs';
import { LABELS, SERVICES } from './services.mjs';
import { ISRC, parseSource } from './song-lookup.mjs';
export { LABELS };

/**
 * Smart links the artists publish (`smart_links`): the address at /l/<slug>, and what the fan page shows. Everything the editor sends
 * is checked here, since the fan page shows it to anyone: each button must go to its own service, and the cover and preview must
 * come from the music services the lookup found them on.
 */

/** 3 to 40 lowercase letters, digits and single dashes, starting and ending with a letter or digit. */
const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/;
/** Names of our own pages and ones people would take for ours. */
export const RESERVED = new Set([
  'about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'brand', 'callback', 'contact',
  'create', 'credit', 'credits', 'dashboard', 'delete', 'docs', 'download', 'downloads', 'edit', 'email', 'explore', 'faq',
  'favicon', 'help', 'history', 'home', 'index', 'invoices', 'legal', 'link', 'links', 'login', 'logout', 'mail', 'moo', 'mumoo',
  'new', 'null', 'oauth', 'official', 'phone', 'pricing', 'privacy', 'profile', 'register', 'render', 'renders', 'robots',
  'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'staff', 'static', 'status', 'support', 'team', 'terms',
  'test-media', 'undefined', 'upload', 'uploads', 'www',
]);
/** How many links one person may publish. */
export const MAX_LINKS = 50;
const MAX_TEXT = 200;

/** What is wrong with a wanted address, in the words to show, or null when it may be used (if nobody has it). */
export function slugProblem(slug) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return 'Use 3 to 40 lowercase letters, numbers and dashes.';
  if (RESERVED.has(slug)) return 'That name is reserved. Try another.';
  return null;
}

/** Where each service's button may go: its own sites, and their subdomains. */
const SERVICE_HOSTS = {
  spotify: ['spotify.com', 'spotify.link'],
  apple: ['music.apple.com', 'itunes.apple.com'],
  youtube: ['youtube.com', 'youtu.be'],
  youtubeMusic: ['music.youtube.com'],
  deezer: ['deezer.com', 'deezer.page.link'],
  tidal: ['tidal.com'],
  soundcloud: ['soundcloud.com'],
  amazon: ['music.amazon.com', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.co.jp', 'amazon.com.au', 'amazon.com.br', 'amazon.in', 'amazon.com.mx', 'amzn.to'],
};
/** Where covers and previews come from: Apple, Deezer, Spotify and YouTube's image and audio servers. */
const MEDIA_HOSTS = ['mzstatic.com', 'apple.com', 'dzcdn.net', 'scdn.co', 'spotifycdn.com', 'ytimg.com'];

function httpsOn(raw, hosts) {
  if (typeof raw !== 'string' || raw.length > 1000) return null;
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
}

function text(value, required) {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '';
  return clean || (required ? null : '');
}

/**
 * The link as it is kept and shown, from what the editor sent, or {error} in the words to show.
 * {source, title, artist, cover, preview, isrc, services: [{service, url, hidden}]}, the buttons in the order they appear.
 */
export function cleanLink(input) {
  if (!input || typeof input !== 'object') return { error: 'Find your song first.' };
  const source = typeof input.source === 'string' ? input.source.trim().slice(0, 500) : '';
  if (!parseSource(source)) return { error: 'Find your song first.' };
  const title = text(input.title, true);
  const artist = text(input.artist, true);
  if (!title || !artist) return { error: 'Add the song’s title and artist.' };
  const cover = input.cover ? httpsOn(input.cover, MEDIA_HOSTS) : null;
  const preview = input.preview ? httpsOn(input.preview, MEDIA_HOSTS) : null;
  if ((input.cover && !cover) || (input.preview && !preview)) return { error: 'Find your song again: its cover or preview did not come from a music service.' };
  const isrc = typeof input.isrc === 'string' && ISRC.test(input.isrc) ? input.isrc : null;
  if (!Array.isArray(input.services)) return { error: 'Add at least one button.' };
  const seen = new Set();
  const services = [];
  for (const row of input.services) {
    const service = row?.service;
    if (!SERVICES.includes(service) || seen.has(service)) return { error: 'One of the buttons is not a service we know.' };
    seen.add(service);
    const url = httpsOn(row.url, SERVICE_HOSTS[service]);
    if (!url) return { error: `The ${LABELS[service]} button must link to ${LABELS[service]} (https://…).` };
    services.push({ service, url, hidden: row.hidden === true });
  }
  if (!services.some(row => !row.hidden)) return { error: 'Show at least one button.' };
  return { link: { source, title, artist, cover, preview, isrc, services } };
}

/** Whether someone has already published at this address. */
export async function slugTaken(slug) {
  const [row] = await db()`select 1 from smart_links where slug = ${slug}`;
  return Boolean(row);
}

/** How far back "this week" goes in the list's counts. */
const WEEK_DAYS = 7;

/** What the editor and My Smart Links may see of a link's ad accounts: the IDs, and only whether each token is set. */
const TRACKING = (l) => `jsonb_build_object('meta_pixel_id', ${l}.meta_pixel_id, 'meta_capi_token', ${l}.meta_capi_token is not null,
  'tiktok_pixel_id', ${l}.tiktok_pixel_id, 'tiktok_events_token', ${l}.tiktok_events_token is not null, 'google_ads_id', ${l}.google_ads_id)`;

/**
 * The person's links, each with its visits and clicks ever and of the last week, its clicks per service, its paid-ad visits, and
 * its ad accounts (`tracking`, without the tokens).
 */
export async function linksOf(userId) {
  const sql = db();
  return sql`select l.slug, l.link, l.created_at, l.updated_at, ${sql.unsafe(TRACKING('l'))} as tracking,
      coalesce(e.views, 0) as views, coalesce(e.clicks, 0) as clicks, coalesce(e.week_views, 0) as week_views,
      coalesce(e.week_clicks, 0) as week_clicks, coalesce(e.paid_views, 0) as paid_views,
      coalesce((select jsonb_object_agg(service, total) from (select service, count(*)::int as total from smart_link_events s
        where s.slug = l.slug and s.kind = 'click' group by service) per_service), '{}'::jsonb) as services
    from smart_links l left join lateral (
      select count(*) filter (where kind = 'view')::int as views, count(*) filter (where kind = 'click')::int as clicks,
        count(*) filter (where kind = 'view' and at > now() - make_interval(days => ${WEEK_DAYS}))::int as week_views,
        count(*) filter (where kind = 'click' and at > now() - make_interval(days => ${WEEK_DAYS}))::int as week_clicks,
        count(*) filter (where kind = 'view' and is_paid_ad)::int as paid_views
      from smart_link_events where slug = l.slug) e on true
    where l.user_id = ${userId} order by l.created_at desc`;
}

/**
 * The link a fan page event is for, with what forwarding needs (the title, artist and ad accounts, tokens still sealed), or null
 * when there is no such link or, for a click, the page does not show that service's button.
 */
export async function eventTarget(slug, kind, service) {
  if (slugProblem(slug) || !['view', 'click'].includes(kind) || (kind === 'click' && !SERVICES.includes(service))) return null;
  const [row] = await db()`select link, meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_events_token from smart_links where slug = ${slug}`;
  if (!row) return null;
  if (kind === 'click' && !row.link.services.some(button => button.service === service && !button.hidden)) return null;
  return row;
}

/** One fan page event (`fields`: country, browser, device, os, is_paid_ad, ad_network, utm_source, utm_medium, utm_campaign, referrer). */
export async function recordEvent(slug, kind, service, fields) {
  const text = (value, length = 100) => (typeof value === 'string' && value ? value.slice(0, length) : null);
  await db()`insert into smart_link_events (slug, kind, service, country, browser, device, os, is_paid_ad, ad_network, utm_source, utm_medium, utm_campaign, referrer)
    values (${slug}, ${kind}, ${kind === 'click' ? service : null}, ${text(fields.country, 2)}, ${text(fields.browser, 40)}, ${text(fields.device, 20)},
      ${text(fields.os, 20)}, ${fields.is_paid_ad === true}, ${['meta', 'tiktok', 'google'].includes(fields.ad_network) ? fields.ad_network : null},
      ${text(fields.utm_source)}, ${text(fields.utm_medium)}, ${text(fields.utm_campaign)}, ${text(fields.referrer)})`;
}

/**
 * One of the person's links' events of the last `days` (0: all), counted together per day and everything the stats page shows
 * (the rows `summarise` in link-stats.mjs takes), or null when the link is not theirs.
 */
export async function statsRows(userId, slug, days) {
  const sql = db();
  const [owned] = await sql`select 1 from smart_links where slug = ${slug} and user_id = ${userId}`;
  if (!owned) return null;
  return sql`select to_char(at at time zone 'UTC', 'YYYY-MM-DD') as day, kind, service, country, browser, device, os, is_paid_ad, ad_network,
      coalesce(utm_source, referrer) as source, count(*)::int as n
    from smart_link_events where slug = ${slug} and (${days}::int = 0 or at >= (now() at time zone 'UTC')::date - (${days}::int - 1))
    group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10`;
}

const PIXEL_FIELDS = {
  meta_pixel_id: [/^\d{10,20}$/, 'A Meta Pixel ID is 10 to 20 digits (Events Manager → Data sources).'],
  tiktok_pixel_id: [/^[A-Z0-9]{15,30}$/i, 'A TikTok Pixel ID is letters and digits (Events Manager → Web events).'],
  google_ads_id: [/^AW-\d{6,15}$/i, 'A Google Ads ID looks like AW-123456789.'],
};
const TOKEN = /^[A-Za-z0-9_\-.|=+/]{20,600}$/;

/**
 * Sets the ad accounts of one of the person's links. IDs are replaced (an empty one clears it); a token is replaced when a new one
 * is sent, cleared when it is null or empty, and kept when it is left out. {tracking} or {status, error}.
 */
export async function setTracking(userId, slug, input, sealer) {
  if (!input || typeof input !== 'object') return { status: 400, error: 'Nothing to save.' };
  const ids = {};
  for (const [field, [pattern, problem]] of Object.entries(PIXEL_FIELDS)) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (value && !pattern.test(value)) return { status: 400, error: problem };
    ids[field] = value ? (field === 'google_ads_id' ? value.toUpperCase() : value) : null;
  }
  const tokens = {};
  for (const field of ['meta_capi_token', 'tiktok_events_token']) {
    if (input[field] === undefined) continue;
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (!value) { tokens[field] = null; continue; }
    if (!TOKEN.test(value)) return { status: 400, error: 'That token doesn’t look right. Copy it again from the platform.' };
    tokens[field] = await sealer(value);
    if (!tokens[field]) return { status: 503, error: 'Ad tokens can’t be saved yet. Try again later.' };
  }
  const keep = (field) => !(field in tokens);
  const sql = db();
  const [row] = await sql`update smart_links set meta_pixel_id = ${ids.meta_pixel_id}, tiktok_pixel_id = ${ids.tiktok_pixel_id}, google_ads_id = ${ids.google_ads_id},
      meta_capi_token = case when ${keep('meta_capi_token')} then meta_capi_token else ${tokens.meta_capi_token ?? null} end,
      tiktok_events_token = case when ${keep('tiktok_events_token')} then tiktok_events_token else ${tokens.tiktok_events_token ?? null} end
    where slug = ${slug} and user_id = ${userId} returning ${sql.unsafe(TRACKING('smart_links'))} as tracking`;
  return row ? { tracking: row.tracking } : { status: 404, error: 'That link is not yours, or it was deleted.' };
}

/** Publishes at a free address. {link} or {status, error}. */
export async function publishLink(userId, slug, input) {
  const problem = slugProblem(slug);
  if (problem) return { status: 400, error: problem };
  const cleaned = cleanLink(input);
  if (cleaned.error) return { status: 400, error: cleaned.error };
  const sql = db();
  const [{ count }] = await sql`select count(*)::int as count from smart_links where user_id = ${userId}`;
  if (count >= MAX_LINKS) return { status: 409, error: `You have ${MAX_LINKS} links. Delete one to make another.` };
  const [row] = await sql`insert into smart_links (slug, user_id, link) values (${slug}, ${userId}, ${JSON.stringify(cleaned.link)}::jsonb)
    on conflict (slug) do nothing returning slug, link, created_at, updated_at`;
  return row ? { link: row } : { status: 409, error: 'Someone already has that name. Try another.' };
}

/** Changes one of the person's own links (its address stays: it may already be shared). */
export async function updateLink(userId, slug, input) {
  const cleaned = cleanLink(input);
  if (cleaned.error) return { status: 400, error: cleaned.error };
  const [row] = await db()`update smart_links set link = ${JSON.stringify(cleaned.link)}::jsonb, updated_at = now()
    where slug = ${slug} and user_id = ${userId} returning slug, link, created_at, updated_at`;
  return row ? { link: row } : { status: 404, error: 'That link is not yours, or it was deleted.' };
}

export async function deleteLink(userId, slug) {
  const rows = await db()`delete from smart_links where slug = ${slug} and user_id = ${userId} returning slug`;
  return rows.length > 0;
}
