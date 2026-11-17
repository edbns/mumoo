import { personFrom, recordPerson } from '../lib/person.mjs';
import { RANGES, summarise } from '../lib/link-stats.mjs';
import { setTracking, statsRows } from '../lib/smart-links.mjs';
import { seal } from '../lib/secret-box.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * One of the signed-in person's smart links: GET /api/links/stats?slug=&days=7|30|90|0 its analytics (`summarise`);
 * PUT /api/links/stats {slug, tracking} sets its ad accounts (`setTracking`; tokens are encrypted and never sent back).
 */
export default async function handler(request) {
  if (!['GET', 'PUT'].includes(request.method)) return reply(405, { error: 'Use GET or PUT.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Smart links are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to see your link’s analytics.' });
  try {
    if (!(await recordPerson(person))) return reply(401, { error: 'Sign in to see your link’s analytics.' });
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      const outcome = await setTracking(person.id, body?.slug ?? '', body?.tracking, seal);
      return outcome.error ? reply(outcome.status, { error: outcome.error }) : reply(200, { tracking: outcome.tracking });
    }
    const params = new URL(request.url).searchParams;
    const days = Number(params.get('days') ?? 7);
    if (!RANGES.includes(days)) return reply(400, { error: 'Choose 7, 30 or 90 days, or all time.' });
    const rows = await statsRows(person.id, params.get('slug') ?? '', days);
    if (!rows) return reply(404, { error: 'That link is not yours, or it was deleted.' });
    return reply(200, { stats: summarise(rows, days, new Date().toISOString().slice(0, 10)) });
  } catch (cause) {
    console.error('links stats:', cause);
    return reply(500, { error: 'The analytics are unavailable right now. Try again in a moment.' });
  }
}

export const config = { path: '/api/links/stats', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
