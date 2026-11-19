import { personFrom, recordPerson } from '../lib/person.mjs';
import { RANGES, summarise } from '../lib/link-stats.mjs';
import { statsRows } from '../lib/smart-links.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** One of the signed-in person's smart links' analytics: GET /api/links/stats?slug=&days=7|30|90|0 (`summarise`). */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Smart links are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to see your link’s analytics.' });
  try {
    if (!(await recordPerson(person))) return reply(401, { error: 'Sign in to see your link’s analytics.' });
    const params = new URL(request.url).searchParams;
    const days = Number(params.get('days') ?? 7);
    if (!RANGES.includes(days)) return reply(400, { error: 'Choose 7, 30 or 90 days, or all time.' });
    const rows = await statsRows(person.id, params.get('slug') ?? '', days);
    if (!rows) return reply(404, { error: 'That link isn’t yours or was deleted.' });
    return reply(200, { stats: summarise(rows, days, new Date().toISOString().slice(0, 10)) });
  } catch (cause) {
    console.error('links stats:', cause);
    return reply(500, { error: 'Analytics are unavailable right now. Try again in a moment.' });
  }
}

export const config = { path: '/api/links/stats', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
