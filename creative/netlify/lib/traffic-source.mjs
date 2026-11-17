/**
 * Where a fan page visit came from, read from the page's own address: the campaign tags artists add (`utm_source`, `utm_medium`)
 * and the click IDs Meta, TikTok and Google add to their links. Only the category is kept, never the tag or the ID, so it says
 * nothing about the fan.
 */
export const SOURCES = ['direct', 'meta_ads', 'meta', 'tiktok_ads', 'tiktok', 'google_ads', 'youtube', 'other'];

export const SOURCE_LABELS = {
  direct: 'Direct and bio links', meta_ads: 'Meta ads', meta: 'Facebook and Instagram', tiktok_ads: 'TikTok ads', tiktok: 'TikTok',
  google_ads: 'Google ads', youtube: 'YouTube', other: 'Other campaigns',
};

const PAID = /^(paid|cpc|ppc|cpm|ads?|paid[_-]?social|paidsocial|social[_-]?paid|display|sponsored)$/;
const PLATFORMS = [
  [/^(facebook|fb|instagram|ig|meta|messenger|threads)$/, 'meta'],
  [/^tiktok$/, 'tiktok'],
  [/^(google|adwords|gads)$/, 'google'],
  [/^(youtube|yt)$/, 'youtube'],
];

/** The source of a visit to `pageUrl`, the fan page's full address; anything unreadable is "direct". */
export function sourceOf(pageUrl) {
  let params;
  try { params = new URL(pageUrl).searchParams; } catch { return 'direct'; }
  const tag = (name) => (params.get(name) ?? '').trim().toLowerCase();
  const paid = PAID.test(tag('utm_medium'));
  const named = PLATFORMS.find(([pattern]) => pattern.test(tag('utm_source')))?.[1];
  const platform = named ?? (params.has('fbclid') ? 'meta' : params.has('ttclid') ? 'tiktok'
    : ['gclid', 'gbraid', 'wbraid'].some(id => params.has(id)) ? 'google' : null);
  if (platform === 'meta') return paid ? 'meta_ads' : 'meta';
  // TikTok and Google only add their click IDs to ads.
  if (platform === 'tiktok') return paid || params.has('ttclid') ? 'tiktok_ads' : 'tiktok';
  if (platform === 'google') return paid || !named ? 'google_ads' : 'other';
  if (platform === 'youtube') return 'youtube';
  return tag('utm_source') || tag('utm_medium') || tag('utm_campaign') ? 'other' : 'direct';
}
