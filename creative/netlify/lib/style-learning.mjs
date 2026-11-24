import { createHmac } from 'node:crypto';
import { db } from './person.mjs';
import ANCHORS from './genre-anchors.mjs';
import { BLEND, blendGuess, genreChances } from './style-prints.mjs';

/**
 * Genre learning from the public, without letting a few dishonest answers teach the brain (migration 057). Every answer waits
 * in style_print_candidates; the brain only learns from style_prints. Once a day `promote` takes the oldest `batch` waiting
 * answers (testing every known song takes about 10 s of the scheduled run's 30) and lets an answer in when:
 *   - the brain already hears that genre in the clip, or `agree` accounts gave the song that genre and are `share` of all
 *     who answered it (one voice per account and song, however often it answers) and the clip sounds like it could be that
 *     genre (one of its `topLanes` closest descriptions, or `chanceFloor` of the brain's chance);
 *   - nothing kept already says otherwise about the song (a kept answer is never replaced; a clash is held for a person);
 *   - adding it does not cost the brain a right guess, or add a wrong one, on the songs it knows (`batchTest`).
 * Answers no one confirms for `expireDays` are rejected. Nobody's use of mumoo is limited: only what the brain learns is.
 */
export const LEARNING = { agree: 3, share: 2 / 3, topLanes: 10, chanceFloor: 0.15, expireDays: 120, batch: 150 };
const DAY_MS = 86_400_000;

/** One account's code for one song: the same account answering another song gets another code. Null when not signed in. */
export function voterOf(person, sourceSha256, key) {
  if (!person?.id || typeof key !== 'string' || key.length < 32) return null;
  return createHmac('sha256', key).update(`mumoo-style-voter:${sourceSha256}:${person.id}`).digest('hex');
}

/** An answer waits for the daily check. An account's later answer for the same song replaces its earlier one while both wait. */
export async function submitLabel(label, print, voter = null) {
  const values = [label.sourceSha256, label.offsetMs, label.style.trim(), label.genre.trim(), label.subGenre.trim(), label.source, voter, print.model, print.values];
  if (voter) {
    await db().query(`
      insert into style_print_candidates (source_sha256, offset_ms, style, genre, sub_genre, source, voter, model, print)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::real[])
      on conflict (source_sha256, voter) where voter is not null do update set
        offset_ms = excluded.offset_ms, style = excluded.style, genre = excluded.genre, sub_genre = excluded.sub_genre,
        source = excluded.source, model = excluded.model, print = excluded.print, created_at = now()
      where style_print_candidates.status = 'waiting'`, values);
    return;
  }
  await db().query(`
    insert into style_print_candidates (source_sha256, offset_ms, style, genre, sub_genre, source, voter, model, print)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::real[])
    on conflict (source_sha256, offset_ms) where voter is null do update set
      style = excluded.style, genre = excluded.genre, sub_genre = excluded.sub_genre,
      source = excluded.source, model = excluded.model, print = excluded.print, created_at = now()
    where style_print_candidates.status = 'waiting'`, values);
}

const dot = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]; return sum; };

/** Whether the clip could be `genre`: one of its closest descriptions, or a fair share of the brain's chance. */
export function soundsLike(print, rows, ownSha256, genre) {
  const { chances, likeness } = genreChances(print, rows, ownSha256);
  const rank = ANCHORS.lanes.map((lane, i) => ({ lane, alike: likeness[i] })).sort((a, b) => b.alike - a.alike)
    .findIndex(({ lane }) => lane.genre === genre);
  return (rank >= 0 && rank < LEARNING.topLanes) || (chances[genre] ?? 0) >= LEARNING.chanceFloor;
}

/** Each account's latest genre for each song, from answers that still count (waiting or let in). */
function voicesBySong(votes) {
  const songs = new Map();
  for (const vote of [...votes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    if (!vote.voter) continue;
    (songs.get(vote.source_sha256) ?? songs.set(vote.source_sha256, new Map()).get(vote.source_sha256)).set(vote.voter, vote.genre);
  }
  return songs;
}

/** True when enough accounts gave the song this genre, and they are most of those who answered it. */
export function agreed(voices, genre) {
  if (!voices) return false;
  const same = [...voices.values()].filter(given => given === genre).length;
  return same >= LEARNING.agree && same >= LEARNING.share * voices.size;
}

/**
 * The known songs the brain is tested on (kept, not from licensed seed sets), each clip with how the brain does on it now and
 * how alike its `nearest`-th closest other song is: an added print nearer than that is the only way to change its guess.
 */
export function testClips(trusted) {
  return trusted.filter(row => !row.licensed).map(row => {
    const { songs } = genreChances(row.print, trusted, row.source_sha256);
    const guess = blendGuess(row.print, trusted, row.source_sha256);
    return { row, reach: songs[BLEND.nearest - 1]?.alike ?? -Infinity, now: guess ? (guess.genre === row.genre ? 'right' : 'wrong') : 'none' };
  });
}

/** What adding `prints` does to the test clips it can reach: right and wrong guesses before and after. */
export function batchTest(clips, trusted, prints) {
  const shas = new Set(prints.map(item => item.source_sha256));
  const reached = clips.filter(clip => !shas.has(clip.row.source_sha256) && prints.some(item => dot(item.print, clip.row.print) > clip.reach));
  const rows = [...trusted, ...prints];
  const tally = { reached: reached.length, before: { right: 0, wrong: 0 }, after: { right: 0, wrong: 0 } };
  for (const clip of reached) {
    if (clip.now !== 'none') tally.before[clip.now] += 1;
    const guess = blendGuess(clip.row.print, rows, clip.row.source_sha256);
    if (guess) tally.after[guess.genre === clip.row.genre ? 'right' : 'wrong'] += 1;
  }
  tally.harmless = tally.after.right >= tally.before.right && tally.after.wrong <= tally.before.wrong;
  return tally;
}

/**
 * The daily decision, without the database: for each waiting answer (with `print` and `created_at`), accepted (`keep`: let
 * into the brain; else already known), held or rejected with its reason, or left waiting. `votes` are all answers that
 * still count for the songs, waiting ones included.
 */
export function judge({ trusted, waiting, votes, now = Date.now() }) {
  const voices = voicesBySong(votes);
  const keptByClip = new Map(trusted.map(row => [`${row.source_sha256}:${row.offset_ms}`, row]));
  const keptGenres = new Map();
  for (const row of trusted) (keptGenres.get(row.source_sha256) ?? keptGenres.set(row.source_sha256, new Set()).get(row.source_sha256)).add(row.genre);
  const decisions = new Map();
  const decide = (item, status, reason, keep = false) => decisions.set(item.id, { item, status, reason, keep });

  const ready = [];
  for (const item of waiting) {
    const kept = keptByClip.get(`${item.source_sha256}:${item.offset_ms}`);
    if (kept) { decide(item, kept.genre === item.genre ? 'accepted' : 'held', kept.genre === item.genre ? 'already known' : 'differs from the kept answer'); continue; }
    if ([...(keptGenres.get(item.source_sha256) ?? [])].some(genre => genre !== item.genre)) { decide(item, 'held', 'differs from the kept answer'); continue; }
    const hears = blendGuess(item.print, trusted, item.source_sha256)?.genre === item.genre;
    const agreedOn = agreed(voices.get(item.source_sha256), item.genre);
    if (!hears && !agreedOn) {
      if (now - new Date(item.created_at).getTime() > LEARNING.expireDays * DAY_MS) decide(item, 'rejected', 'never confirmed');
      continue;
    }
    if (!hears && !soundsLike(item.print, trusted, item.source_sha256, item.genre)) { decide(item, 'held', 'does not sound like it'); continue; }
    ready.push({ item, why: hears ? 'the brain hears it' : 'accounts agree' });
  }

  // One answer per clip goes in: the latest, unless ready answers for the clip disagree.
  const byClip = new Map();
  for (const entry of ready) (byClip.get(`${entry.item.source_sha256}:${entry.item.offset_ms}`) ?? byClip.set(`${entry.item.source_sha256}:${entry.item.offset_ms}`, []).get(`${entry.item.source_sha256}:${entry.item.offset_ms}`)).push(entry);
  const picks = [];
  for (const entries of byClip.values()) {
    if (new Set(entries.map(entry => entry.item.genre)).size > 1) { for (const { item } of entries) decide(item, 'held', 'answers for the clip disagree'); continue; }
    entries.sort((a, b) => new Date(b.item.created_at) - new Date(a.item.created_at));
    picks.push(entries[0]);
    for (const { item } of entries.slice(1)) decide(item, 'accepted', 'same as another answer');
  }

  // Each song's answers must do no harm on their own, then all of them together.
  const clips = picks.length ? testClips(trusted) : [];
  const bySong = new Map();
  for (const entry of picks) (bySong.get(entry.item.source_sha256) ?? bySong.set(entry.item.source_sha256, []).get(entry.item.source_sha256)).push(entry);
  const passed = [];
  for (const entries of bySong.values()) {
    if (batchTest(clips, trusted, entries.map(entry => entry.item)).harmless) passed.push(...entries);
    else for (const { item } of entries) decide(item, 'held', 'made the brain worse on known songs');
  }
  const together = batchTest(clips, trusted, passed.map(entry => entry.item));
  for (const { item, why } of passed) {
    if (together.harmless) decide(item, 'accepted', why, true);
    else decide(item, 'held', 'the week\'s answers together made the brain worse on known songs');
  }
  return { decisions: [...decisions.values()], test: together, tested: clips.length };
}

/** The daily check in one line, for the log and the dry run. */
export function summary(result) {
  const { test } = result;
  return `${result.waiting} waiting: ${result.learned} learned, ${result.accepted - result.learned} already known, ${result.held} held, `
    + `${result.rejected} rejected, ${result.stillWaiting} still waiting; on ${test.reached} of ${result.tested} known clips it reaches, `
    + `right ${test.before.right} -> ${test.after.right}, wrong ${test.before.wrong} -> ${test.after.wrong}`;
}

/** The daily check: decides the oldest waiting answers and, with `write`, lets the accepted ones into the brain. */
export async function promote({ write = false, only = null, batch = LEARNING.batch } = {}) {
  const sql = db();
  const trusted = await sql`
    select p.source_sha256, p.offset_ms, p.style, p.genre, p.sub_genre, p.print, (l.source_sha256 is not null) as licensed
    from style_prints p left join style_seed_licences l using (source_sha256)`;
  const waiting = only
    ? await sql`select * from style_print_candidates where status = 'waiting' and source_sha256 = any(${only}) order by created_at limit ${batch}`
    : await sql`select * from style_print_candidates where status = 'waiting' order by created_at limit ${batch}`;
  const shas = [...new Set(waiting.map(item => item.source_sha256))];
  const votes = shas.length
    ? await sql`select source_sha256, voter, genre, created_at from style_print_candidates where status in ('waiting', 'accepted') and voter is not null and source_sha256 = any(${shas})`
    : [];
  const result = judge({ trusted, waiting, votes });
  if (write) {
    for (const { item, status, reason, keep } of result.decisions) {
      if (keep) {
        await sql`
          insert into style_prints (source_sha256, offset_ms, style, genre, sub_genre, source, model, print)
          values (${item.source_sha256}, ${item.offset_ms}, ${item.style}, ${item.genre}, ${item.sub_genre}, ${item.source}, ${item.model}, ${item.print}::real[])
          on conflict (source_sha256, offset_ms) do nothing`;
      }
      await sql`update style_print_candidates set status = ${status}, reason = ${reason}, decided_at = now() where id = ${item.id} and status = 'waiting'`;
    }
  }
  const count = status => result.decisions.filter(d => d.status === status).length;
  return {
    waiting: waiting.length, learned: result.decisions.filter(d => d.keep).length, accepted: count('accepted'),
    held: count('held'), rejected: count('rejected'), stillWaiting: waiting.length - result.decisions.length,
    test: result.test, tested: result.tested, decisions: result.decisions,
  };
}
