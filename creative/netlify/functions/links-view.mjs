import { countView } from '../lib/smart-links.mjs';
import { sourceOf } from '../lib/traffic-source.mjs';

/** A transparent 1×1 GIF. */
const DOT = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
const dot = () => new Response(DOT, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });

/**
 * GET /api/links/view?slug= — a fan opened a fan page (its one invisible image; the page itself is cached, so it never reaches us).
 * The referrer is the page's address, which gives the traffic source. Only the count is kept (`countView`), and the answer is
 * always the same image.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  if (!process.env.DATABASE_URL) return dot();
  try {
    await countView(new URL(request.url).searchParams.get('slug') ?? '', sourceOf(request.headers.get('referer') ?? ''));
  } catch (cause) {
    console.error('links view:', cause);
  }
  return dot();
}

export const config = { path: '/api/links/view', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
