/**
 * Where a fan page visit came from, read from the page's address and the referring page: the ad platforms' click IDs (`fbclid`
 * Meta, `ttclid` TikTok, `gclid` / `gbraid` / `wbraid` Google), the campaign tags (`utm_source`, `utm_medium`, `utm_campaign`) and
 * the referring site. The click IDs are returned only to forward to the artist's own ad accounts; they are never kept.
 */

const PAID = /^(paid|cpc|ppc|cpm|cpv|ads?|paid[_-]?social|paidsocial|social[_-]?paid|display|sponsored|promoted)$/;
/** A medium the artist set that says it is not an ad, which wins over a click ID (Meta adds `fbclid` to posts too). */
const ORGANIC = /^(organic|social|bio|link[_-]?in[_-]?bio|post|story|stories|reel|referral|email|newsletter|sms|qr)$/;
const NETWORKS = [
  [/^(facebook|fb|instagram|ig|meta|messenger|threads)$/, 'meta'],
  [/^tiktok$/, 'tiktok'],
  [/^(google|adwords|gads|youtube|yt)$/, 'google'],
];
const TAG_LENGTH = 100;

const clean = (value) => (value ?? '').trim().toLowerCase().slice(0, TAG_LENGTH) || null;

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^(www|m|l|lm)\./, '') || null; } catch { return null; }
}

/**
 * {is_paid_ad, ad_network, utm_source, utm_medium, utm_campaign, referrer, fbclid, ttclid} for a visit to `pageUrl` from
 * `referrer`. Paid when the page has an ad platform's click ID (unless its tags say otherwise) or a paid `utm_medium`; the network
 * comes from the click ID, else from `utm_source`.
 */
export function adClick(pageUrl, referrer = '') {
  let params;
  try { params = new URL(pageUrl).searchParams; } catch { params = new URLSearchParams(); }
  const utm_source = clean(params.get('utm_source'));
  const utm_medium = clean(params.get('utm_medium'));
  const utm_campaign = clean(params.get('utm_campaign'));
  const fbclid = params.get('fbclid')?.slice(0, 500) || null;
  const ttclid = params.get('ttclid')?.slice(0, 500) || null;
  const google = ['gclid', 'gbraid', 'wbraid'].some(id => params.has(id));
  const byClick = fbclid ? 'meta' : ttclid ? 'tiktok' : google ? 'google' : null;
  const byTag = NETWORKS.find(([pattern]) => utm_source && pattern.test(utm_source))?.[1] ?? null;
  const tagged = utm_medium && PAID.test(utm_medium);
  const is_paid_ad = Boolean(tagged || (byClick && !(utm_medium && ORGANIC.test(utm_medium))));
  const own = hostOf(pageUrl);
  const from = hostOf(referrer);
  return {
    is_paid_ad, ad_network: is_paid_ad ? byClick ?? byTag : null, utm_source, utm_medium, utm_campaign,
    referrer: from && from !== own ? from : null, fbclid, ttclid,
  };
}

const SOURCE_NAMES = [
  [/^(instagram|ig|instagram\.com)$/, 'Instagram'], [/^(facebook|fb|facebook\.com|messenger(\.com)?)$/, 'Facebook'],
  [/^(tiktok|tiktok\.com)$/, 'TikTok'], [/^(x|twitter|t\.co|x\.com|twitter\.com)$/, 'X'], [/^(youtube|yt|youtube\.com|youtu\.be)$/, 'YouTube'],
  [/^(google|google\.[a-z.]+)$/, 'Google'], [/^(linktree|linktr\.ee)$/, 'Linktree'], [/^(threads|threads\.net|threads\.com)$/, 'Threads'],
  [/^(snapchat|snapchat\.com)$/, 'Snapchat'], [/^(reddit|reddit\.com)$/, 'Reddit'], [/^(whatsapp|wa\.me|whatsapp\.com)$/, 'WhatsApp'],
];

/** A readable name for where a visit came from (the `utm_source` tag, else the referring site), so a tag and its site count as one. */
export function sourceLabel(source) {
  if (!source) return 'Direct';
  return SOURCE_NAMES.find(([pattern]) => pattern.test(source))?.[1] ?? source;
}
