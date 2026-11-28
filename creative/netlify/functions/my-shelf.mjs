import { db, personFrom } from '../lib/person.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
/** What a person kept counts for this long; after that their taste has likely moved on. */
const KEPT_DAYS = 180;
const MOST_LINES = 1500;

/**
 * GET /api/my-shelf (signed in): what this person kept before, so their shelf leads with it (`shelfOrder`, `keptScores`). One line per
 * template, kind of card and kind of song (lane, genre, lyrics or none), with how long ago in weeks and how many times they chose,
 * exported or got a video of it. Only their own, never anybody else's. Signed out, or on any error, nothing is kept: the shelf then
 * leads with what everybody downloads.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
  if (!process.env.DATABASE_URL) return reply(200, { kept: [] });
  const person = await personFrom(request).catch(() => null);
  if (!person) return reply(401, { error: 'Sign in to keep going.' });
  try {
    const rows = await db()`
      select row_id as row, look, lane, genre, lyrics_origin = 'none' as wordless, event,
        floor(extract(epoch from now() - created_at) / 604800)::int as weeks, count(*)::int as n
      from brain_feedback
      where user_id = ${person.id} and created_at > now() - make_interval(days => ${KEPT_DAYS})
        and event in ('select', 'download', 'delivered') and row_id is not null
      group by 1, 2, 3, 4, 5, 6, 7
      order by weeks, n desc
      limit ${MOST_LINES}`;
    return reply(200, { kept: rows.map(({ wordless, ...line }) => ({ ...line, words: wordless !== true })) });
  } catch (cause) {
    console.error('my shelf:', cause);
    return reply(200, { kept: [] });
  }
}

export const config = { path: '/api/my-shelf', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
