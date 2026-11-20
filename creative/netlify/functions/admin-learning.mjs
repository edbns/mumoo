import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';

/**
 * GET /api/admin/learning?days=30: what people did with the creatives (brain_feedback), summed up for reading. Counts and codes only:
 * which rows, kinds of card, looks, vibes, library pictures and genre colour matches are shown, played, watched, chosen and downloaded. Never who did it,
 * never any words. Rows, cards and pictures come most downloaded first: downloads out of the cards shown are what the shelf learns from
 * (`learnedShelf`, `learnedCounts`), overall and per lane. `templates` sets each template's period beside the one before it, so a template
 * that stops working shows.
 */
const DAYS = [7, 30, 90];
const COLOUR_ORDER = ['strong', 'some', 'weak', 'none'];

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
      count(*) filter (where event = 'shown')::int as shown,
      count(*) filter (where event = 'play')::int as plays,
      count(*) filter (where event = 'select')::int as selects,
      count(*) filter (where event = 'download')::int as downloads,
      count(*) filter (where event = 'delivered')::int as delivered,
      count(*) filter (where event = 'refresh')::int as refreshes,
      coalesce(round(avg(watch_ms) filter (where event = 'watch'))::int, 0) as avg_watch_ms`;
    const [totals] = await sql`select ${tally}, count(distinct clip_sha256)::int as songs from brain_feedback where ${since}`;
    const rows = await sql`select row_id as key, ${tally} from brain_feedback where ${since} and row_id is not null and event <> 'refresh' group by row_id order by delivered desc, shown desc, key`;
    // Each template now and in the period just before, for the trend.
    const before = sql`created_at <= now() - make_interval(days => ${days}) and created_at > now() - make_interval(days => ${2 * days})`;
    const earlier = await sql`
      select row_id as key, count(*) filter (where event = 'shown')::int as shown, count(*) filter (where event = 'play')::int as plays,
        count(*) filter (where event = 'delivered')::int as delivered
      from brain_feedback where ${before} and row_id is not null and event in ('shown', 'play', 'delivered') group by row_id`;
    const cards = await sql`
      select row_id || ' · ' || look as key, ${tally} from brain_feedback where ${since} and row_id is not null and look is not null and event <> 'refresh'
      group by 1 order by delivered desc, selects desc, plays desc, key limit 40`;
    const rowLanes = await sql`
      select row_id || ' · ' || coalesce(lane, 'unknown') as key, ${tally} from brain_feedback where ${since} and row_id is not null and event <> 'refresh'
      group by 1 order by delivered desc, selects desc, plays desc, key limit 60`;
    // How the shelf's place plays into it: a template near the top gets played more just for being there.
    const places = await sql`
      select shelf_place::text as key, ${tally} from brain_feedback where ${since} and shelf_place is not null and event <> 'refresh'
      group by shelf_place order by shelf_place`;
    const looks = await sql`select coalesce(look, type_style, style) as key, ${tally} from brain_feedback where ${since} and event <> 'refresh' group by 1 order by plays desc, key limit 30`;
    const vibes = await sql`select coalesce(vibe, 'unread') || ' · ' || lane as key, ${tally} from brain_feedback where ${since} group by 1 order by plays desc, key limit 30`;
    const boards = await sql`select board as key, ${tally} from brain_feedback where ${since} and board is not null group by board order by plays desc, key`;
    const boardGenres = await sql`
      select board || ' · ' || genre as key, ${tally} from brain_feedback where ${since} and board is not null
      group by 1 order by plays desc, key limit 40`;
    const moods = await sql`select coalesce(attitude, 'unread') as key, ${tally} from brain_feedback where ${since} group by 1 order by plays desc, key`;
    const pictures = await sql`
      select id as key, ${tally} from (
        select *, unnest(coalesce(reel_ids, array[library_id])) as id from brain_feedback
        where ${since} and (library_id is not null or reel_ids is not null) and own_picture is not true
      ) used group by id order by delivered desc, plays desc, key limit 40`;
    // Does a picture in the genre's colours get downloaded more? Cards on our pictures, by how well the picture carried them (`colourFit`).
    const colours = await sql`
      select case when colour_fit is null then 'none' when colour_fit >= 0.66 then 'strong' when colour_fit >= 0.33 then 'some' else 'weak' end as key, ${tally}
      from brain_feedback where ${since} and (library_id is not null or reel_ids is not null) and own_picture is not true and event <> 'refresh'
      group by 1`;
    colours.sort((a, b) => COLOUR_ORDER.indexOf(a.key) - COLOUR_ORDER.indexOf(b.key));
    const recent = await sql`
      select created_at, event, row_id, coalesce(look, type_style, style) as look, vibe, lane, attitude, genre, watch_ms, nth_download
      from brain_feedback where ${since} order by created_at desc limit 50`;
    // Genre learning: what the brain has to learn from (all time), and how creators who did not know answered its guesses.
    const [prints] = await sql`
      select count(distinct source_sha256)::int as songs,
        count(*) filter (where source = 'creator')::int as creator, count(*) filter (where source = 'confirmed')::int as confirmed,
        count(*) filter (where source = 'seeded')::int as seeded
      from style_prints`;
    const [unknowns] = await sql`select coalesce(sum(count), 0)::int as count from style_unknowns where day > current_date - ${days}::int`;
    const answers = await sql`
      select style,
        coalesce(sum(count) filter (where answer = 'yes'), 0)::int as yes,
        coalesce(sum(count) filter (where answer = 'no'), 0)::int as no,
        coalesce(sum(count) filter (where answer = 'unsure'), 0)::int as unsure
      from style_guess_answers where day > current_date - ${days}::int group by style having sum(count) > 0
      order by sum(count) desc, style limit 30`;
    const shape = list => list.map(({ key, shown, plays, selects, downloads, delivered, refreshes, avg_watch_ms: avgWatchMs }) => ({ key, shown, plays, selects, downloads, delivered, refreshes, avgWatchMs }));
    return reply(200, {
      days,
      totals: { ...shape([{ key: 'all', ...totals }])[0], songs: totals.songs },
      rows: shape(rows),
      earlier: earlier.map(({ key, shown, plays, delivered }) => ({ key, shown, plays, delivered })),
      cards: shape(cards),
      rowLanes: shape(rowLanes),
      places: shape(places),
      looks: shape(looks),
      vibes: shape(vibes),
      moods: shape(moods),
      pictures: shape(pictures),
      boards: shape(boards),
      colours: shape(colours),
      boardGenres: shape(boardGenres),
      genre: { prints, unknowns: unknowns.count, answers },
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
