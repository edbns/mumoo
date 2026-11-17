import { countClick } from '../lib/smart-links.mjs';
import { sourceOf } from '../lib/traffic-source.mjs';

const empty = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/links/click?slug=&service= — a fan pressed a button of a fan page. The browser sends it by itself (the link's `ping`,
 * see fan-page.mjs), so the button stays a plain link that opens the app. It names the page it came from (`Ping-From`, or the
 * referrer), which gives the traffic source. Only the counts are kept (`countClick`); the answer is always empty, so it tells
 * nobody whether a link exists.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return empty(405);
  if (!process.env.DATABASE_URL) return empty(204);
  const params = new URL(request.url).searchParams;
  const page = request.headers.get('ping-from') ?? request.headers.get('referer') ?? '';
  try {
    await countClick(params.get('slug') ?? '', params.get('service') ?? '', sourceOf(page));
  } catch (cause) {
    console.error('links click:', cause);
  }
  return empty(204);
}

export const config = { path: '/api/links/click', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
