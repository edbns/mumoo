import { slugProblem, slugTaken } from '../lib/smart-links.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * GET /api/links/slug?name= — whether a smart link may be published at /l/<name>: {free: true}, or {free: false, error} in the words
 * to show. Open to anyone, so the address can be chosen while the link is still a draft.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL) return reply(503, { error: 'Smart links are unavailable.' });
  const name = new URL(request.url).searchParams.get('name') ?? '';
  const problem = slugProblem(name);
  if (problem) return reply(200, { free: false, error: problem });
  try {
    return (await slugTaken(name)) ? reply(200, { free: false, error: 'Someone already has that name. Try another.' }) : reply(200, { free: true });
  } catch (cause) {
    console.error('links slug:', cause);
    return reply(502, { error: 'Checking the name failed. Try again in a moment.' });
  }
}

export const config = { path: '/api/links/slug', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
