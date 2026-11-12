import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';

/**
 * GET /api/admin/learning?days=30: what people did with the creatives (brain_feedback), summed up for reading. Counts and codes only:
 * which rows, looks, vibes and library pictures are played, watched, kept and delivered. Never who did it, never any words.
 */
const DAYS = [7, 30, 90];

export default async function handler(request) {
  if (request.method !== 'GET') return refuse(405, 'Use GET.');
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  const asked = Number(new URL(request.url).searchParams.get('days'));
  const days = DAYS.includes(asked) ? asked : 30;
  try {
    const sql = db();
    const since = sql`created_at > now() - make_interval(days => ${days})`;
    const tally = sql`
      count(*) filter (where event = 'play')::int as plays,
      count(*) filter (where event = 'select')::int as selects,
      count(*) filter (where event = 'download')::int as downloads,
      count(*) filter (where event = 'delivered')::int as delivered,
      count(*) filter (where event = 'refresh')::int as refreshes,
      coalesce(round(avg(watch_ms) filter (where event = 'watch'))::int, 0) as avg_watch_ms`;
    const [totals] = await sql`select ${tally}, count(distinct clip_sha256)::int as songs from brain_feedback where ${since}`;
    const rows = await sql`select row_id as key, ${tally} from brain_feedback where ${since} and row_id is not null group by row_id order by plays desc, key`;
    const looks = await sql`select coalesce(look, type_style, style) as key, ${tally} from brain_feedback where ${since} and event <> 'refresh' group by 1 order by plays desc, key limit 30`;
    const vibes = await sql`select coalesce(vibe, 'unread') || ' · ' || lane as key, ${tally} from brain_feedback where ${since} group by 1 order by plays desc, key limit 30`;
    const moods = await sql`select coalesce(attitude, 'unread') as key, ${tally} from brain_feedback where ${since} group by 1 order by plays desc, key`;
    const pictures = await sql`
      select id as key, ${tally} from (
        select *, unnest(coalesce(reel_ids, array[library_id])) as id from brain_feedback
        where ${since} and (library_id is not null or reel_ids is not null) and own_picture is not true
      ) used group by id order by plays desc, key limit 40`;
    const recent = await sql`
      select created_at, event, row_id, coalesce(look, type_style, style) as look, vibe, lane, attitude, genre, watch_ms, nth_download
      from brain_feedback where ${since} order by created_at desc limit 50`;
    const shape = list => list.map(({ key, plays, selects, downloads, delivered, refreshes, avg_watch_ms: avgWatchMs }) => ({ key, plays, selects, downloads, delivered, refreshes, avgWatchMs }));
    return reply(200, {
      days,
      totals: { ...shape([{ key: 'all', ...totals }])[0], songs: totals.songs },
      rows: shape(rows),
      looks: shape(looks),
      vibes: shape(vibes),
      moods: shape(moods),
      pictures: shape(pictures),
      recent: recent.map(row => ({
        at: row.created_at, event: row.event, row: row.row_id, look: row.look, vibe: row.vibe, lane: row.lane,
        mood: row.attitude, genre: row.genre, watchMs: row.watch_ms, nthDownload: row.nth_download,
      })),
    });
  } catch (cause) {
    console.error('admin learning:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/learning', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
