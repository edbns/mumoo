import { searchSongs } from '../lib/song-lookup.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * GET /api/links/search?q=<artist and title> — songs to choose from when the artist types a name instead of pasting a link
 * (`searchSongs`). Open to anyone, like the lookup, and each person is limited.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return reply(400, { error: 'Type your song’s name and artist.' });
  try {
    return reply(200, { results: await searchSongs(q) });
  } catch (cause) {
    console.error('links search:', cause);
    return reply(502, { error: 'Searching failed. Try again in a moment.' });
  }
}

export const config = { path: '/api/links/search', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
