import { ISRC, lookupSongKept, parseSource, spotifyState } from '../lib/song-lookup.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * POST /api/links/lookup with {url, pick?} — the song behind a pasted Spotify, Apple Music or YouTube link and its link on every
 * service (`song-lookup.mjs`). Open to anyone, so a smart link can be drafted before signing in; only known song links are
 * looked up, and each person is limited. `pick` is the ISRC of the candidate the artist chose when the first answer was not sure.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!process.env.DATABASE_URL) return reply(503, { error: 'Smart links are unavailable.' });
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.slice(0, 500) : '';
  if (!parseSource(url)) return reply(400, { error: 'Paste a song link from Spotify, Apple Music or YouTube.' });
  try {
    const pick = typeof body?.pick === 'string' && ISRC.test(body.pick) ? body.pick : null;
    const song = await lookupSongKept(url, fetch, pick);
    const answer = song ? reply(200, { song }) : reply(404, { error: 'We could not find that song. Check the link and try again.' });
    if (song?.source.startsWith('spotify:')) answer.headers.set('X-Spotify-Api', spotifyState);
    return answer;
  } catch (cause) {
    console.error('links lookup:', cause);
    return reply(502, { error: 'Looking up the song failed. Try again in a moment.' });
  }
}

export const config = { path: '/api/links/lookup', rateLimit: { windowSize: 60, windowLimit: 20, aggregateBy: ['ip'] } };
