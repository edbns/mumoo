/**
 * Visits and stream clicks sent on to the artist's own ad accounts, from our server, so the fan page needs no pixel script:
 * Meta's Conversions API (PageView, and "Mumoo Smart Link Click" as a custom event the artist picks as a conversion) and TikTok's
 * Events API 2.0 (ViewContent, as it has no page view event, and "Mumoo_Smart_Link_Click"). The fan's IP address and user agent go with them, as
 * both ask for, and the ad's click ID when there is one; none of it is kept. Google Ads has no such API with only a tag ID, so its
 * ID is kept for later. Failures are logged and never reach the fan.
 */

import { LABELS } from './services.mjs';

/** The click's name in the artist's Events Manager and Ads Manager conversion list, where it reads as ours. */
export const META_CLICK_EVENT = 'Mumoo Smart Link Click';
/** The same on TikTok, whose custom event names allow only letters, digits, underscores and dashes. */
export const TIKTOK_CLICK_EVENT = 'Mumoo_Smart_Link_Click';
const META_API = 'https://graph.facebook.com/v23.0';
const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const TIMEOUT_MS = 5000;

/**
 * `event`: {kind: 'view' | 'click', service, id (shared by both platforms, for deduplication), at (ms), url, referrer, ip, agent,
 * fbclid, ttclid, title, artist}. `accounts`: {meta: {pixel, token} | null, tiktok: {pixel, token} | null}.
 */
export async function forwardEvent(event, accounts, fetcher = fetch) {
  const sends = [];
  if (accounts.meta) sends.push(['meta', sendToMeta(event, accounts.meta, fetcher)]);
  if (accounts.tiktok) sends.push(['tiktok', sendToTikTok(event, accounts.tiktok, fetcher)]);
  const outcomes = await Promise.allSettled(sends.map(([, send]) => send));
  return Object.fromEntries(outcomes.map((outcome, index) => {
    const [network] = sends[index];
    if (outcome.status === 'rejected') console.error(`${network} forwarding:`, outcome.reason?.message ?? outcome.reason);
    return [network, outcome.status === 'fulfilled' && outcome.value];
  }));
}

async function post(fetcher, url, body, headers = {}) {
  const response = await fetcher(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
  return true;
}

function sendToMeta(event, { pixel, token }, fetcher) {
  const seconds = Math.floor(event.at / 1000);
  const user_data = { client_ip_address: event.ip || undefined, client_user_agent: event.agent || undefined };
  if (event.fbclid) user_data.fbc = `fb.1.${event.at}.${event.fbclid}`;
  return post(fetcher, `${META_API}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
    data: [{
      event_name: event.kind === 'view' ? 'PageView' : META_CLICK_EVENT, event_time: seconds, event_id: event.id,
      action_source: 'website', event_source_url: event.url, user_data,
      ...(event.kind === 'click' ? { custom_data: { content_name: event.title, platform: LABELS[event.service] ?? event.service } } : {}),
    }],
  });
}

function sendToTikTok(event, { pixel, token }, fetcher) {
  const user = { ip: event.ip || undefined, user_agent: event.agent || undefined };
  if (event.ttclid) user.ttclid = event.ttclid;
  return post(fetcher, TIKTOK_API, {
    event_source: 'web', event_source_id: pixel,
    data: [{
      event: event.kind === 'view' ? 'ViewContent' : TIKTOK_CLICK_EVENT, event_time: Math.floor(event.at / 1000), event_id: event.id,
      user, page: { url: event.url, referrer: event.referrer || undefined },
      properties: { content_name: event.title, ...(event.kind === 'click' ? { description: LABELS[event.service] ?? event.service } : {}) },
    }],
  }, { 'Access-Token': token });
}
