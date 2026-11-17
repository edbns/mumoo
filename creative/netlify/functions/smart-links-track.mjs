import { forwardEvent } from '../lib/ad-forwarding.mjs';
import { open } from '../lib/secret-box.mjs';
import { eventTarget, recordEvent } from '../lib/smart-links.mjs';
import { adClick } from '../lib/traffic-source.mjs';
import { parseAgent } from '../lib/user-agent.mjs';

const MAX_BODY = 4000;
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/smart-links/track — {slug, event: 'view' | 'click', service, url, referrer}, sent by the fan page's small script
 * (fan-page.mjs) when it opens and when a button is pressed. Records the event for the artist's analytics (country from Netlify,
 * browser, device and system from the user agent, paid ad and network from the click IDs and campaign tags), then, after answering,
 * forwards it to the artist's Meta and TikTok accounts when the link has them. Robots aren't counted. Always an empty 204.
 */
export default async function handler(request, context) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!process.env.DATABASE_URL) return done();
  const text = await request.text().catch(() => '');
  let body;
  try { body = text.length <= MAX_BODY ? JSON.parse(text) : null; } catch { body = null; }
  if (!body || typeof body.slug !== 'string' || typeof body.url !== 'string') return done();
  const agent = request.headers.get('user-agent') ?? '';
  const device = parseAgent(agent);
  if (device.robot) return done();
  try {
    const kind = body.event === 'click' ? 'click' : 'view';
    const service = typeof body.service === 'string' ? body.service : null;
    const link = await eventTarget(body.slug, kind, service);
    if (!link) return done();
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : '';
    const ad = adClick(body.url, referrer);
    await recordEvent(body.slug, kind, service, { country: context?.geo?.country?.code, ...device, ...ad });
    const accounts = await accountsOf(link);
    if (accounts.meta || accounts.tiktok) {
      const forwarding = forwardEvent({
        kind, service, id: crypto.randomUUID(), at: Date.now(), url: body.url.slice(0, 2000), referrer, ip: context?.ip ?? null, agent,
        fbclid: ad.fbclid, ttclid: ad.ttclid, title: link.link.title, artist: link.link.artist,
      }, accounts);
      if (typeof context?.waitUntil === 'function') context.waitUntil(forwarding);
      else await forwarding;
    }
  } catch (cause) {
    console.error('smart link track:', cause);
  }
  return done();
}

async function accountsOf(link) {
  const [meta, tiktok] = await Promise.all([
    link.meta_pixel_id && link.meta_capi_token ? open(link.meta_capi_token) : null,
    link.tiktok_pixel_id && link.tiktok_events_token ? open(link.tiktok_events_token) : null,
  ]);
  return { meta: meta ? { pixel: link.meta_pixel_id, token: meta } : null, tiktok: tiktok ? { pixel: link.tiktok_pixel_id, token: tiktok } : null };
}

export const config = { path: '/api/smart-links/track', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
