import { db } from './person.mjs';
import { ISRC, SERVICES, parseSource } from './song-lookup.mjs';

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
export const LABELS = {
  spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube', youtubeMusic: 'YouTube Music',
  deezer: 'Deezer', tidal: 'TIDAL', soundcloud: 'SoundCloud', amazon: 'Amazon Music',
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

export async function linksOf(userId) {
  return db()`select slug, link, created_at, updated_at from smart_links where user_id = ${userId} order by created_at desc`;
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
