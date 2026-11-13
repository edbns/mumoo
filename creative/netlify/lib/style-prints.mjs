import { db } from './person.mjs';

/**
 * Genre learning (see migrations 025 and 026): the sound print of a selected clip, kept with the style a person gave it,
 * and the brain's guess for a creator who does not know theirs.
 * What the browser says about the clip is checked here, not trusted.
 */
export const PRINT_SOURCES = ['creator', 'confirmed', 'corrected', 'seeded'];
export const PRINT_SIZE = 512;
const SHA = /^[a-f0-9]{64}$/;
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;

/** True for a clip and the style given to it: { sourceSha256, offsetMs, style, genre, subGenre, source }. */
export function validLabel(v) {
  if (!v || typeof v !== 'object') return false;
  if (typeof v.sourceSha256 !== 'string' || !SHA.test(v.sourceSha256)) return false;
  if (!Number.isInteger(v.offsetMs) || v.offsetMs < 0 || v.offsetMs > 86_400_000) return false;
  return name(v.style) && name(v.genre) && name(v.subGenre) && PRINT_SOURCES.includes(v.source);
}

/** True for what the sound print worker returns when it heard the clip. */
export function validPrint(v) {
  return v?.version === 1 && v.status === 'ready' && typeof v.model === 'string' && v.model.length <= 120
    && Array.isArray(v.values) && v.values.length === PRINT_SIZE
    && v.values.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1);
}

export async function storePrint(label, print) {
  await db()`
    insert into style_prints (source_sha256, offset_ms, style, genre, sub_genre, source, model, print)
    values (${label.sourceSha256}, ${label.offsetMs}, ${label.style.trim()}, ${label.genre.trim()},
            ${label.subGenre.trim()}, ${label.source}, ${print.model}, ${print.values}::real[])
    on conflict (source_sha256, offset_ms) do update set
      style = excluded.style, genre = excluded.genre, sub_genre = excluded.sub_genre, source = excluded.source,
      model = excluded.model, print = excluded.print, created_at = now()`;
}

export async function countUnknown() {
  await db()`
    insert into style_unknowns (day, count) values (current_date, 1)
    on conflict (day) do update set count = style_unknowns.count + 1`;
}

/**
 * How sure a guess must be before a creator is asked "We think it sounds like…": of the songs nearest the clip, at least
 * `agree` share its sub-genre and they carry `share` of the votes. A wrong guess a creator says yes to is kept as true,
 * so it is better to ask nothing than to ask on a weak guess.
 */
export const GUESS = { nearest: 7, agree: 2, share: 0.6 };
export const GUESS_ANSWERS = ['yes', 'no', 'unsure'];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

/**
 * The style a clip most likely is, from the kept prints (rows of style_prints), or null when the brain is not sure.
 * Each song votes once, by its clip nearest this one (cosine: prints are unit length), weighted by how alike they sound.
 * Votes are counted by sub-genre (a style only one song has could never win), and the sub-genre's most voted style is
 * the guess. The clip's own song is left out, so a song labelled before is guessed as honestly as a new one.
 */
export function guessStyle(print, rows, ownSha256, { nearest, agree, share } = GUESS) {
  const songs = new Map();
  for (const row of rows) {
    if (row.source_sha256 === ownSha256) continue;
    const alike = dot(print, row.print);
    if (!(songs.get(row.source_sha256)?.alike >= alike)) {
      songs.set(row.source_sha256, { style: row.style, genre: row.genre, subGenre: row.sub_genre, alike });
    }
  }
  const near = [...songs.values()].sort((a, b) => b.alike - a.alike).slice(0, nearest);
  const groups = new Map();
  let total = 0;
  for (const song of near) {
    const weight = Math.max(0, song.alike);
    total += weight;
    const key = `${song.genre}\n${song.subGenre}`;
    const group = groups.get(key) ?? { genre: song.genre, subGenre: song.subGenre, weight: 0, songs: 0, styles: new Map() };
    group.weight += weight;
    group.songs += 1;
    group.styles.set(song.style, (group.styles.get(song.style) ?? 0) + weight);
    groups.set(key, group);
  }
  const best = [...groups.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best || total <= 0 || best.songs < agree || best.weight < share * total) return null;
  const style = [...best.styles].sort((a, b) => b[1] - a[1])[0][0];
  return { style, genre: best.genre, subGenre: best.subGenre };
}

/**
 * What creators who do not know would see today: for each kept clip, hidden with its whole song, whether the site would
 * ask and whether its guess is the right sub-genre. A yes to a wrong guess is kept as true, so `right` matters most.
 */
export function readiness(rows) {
  let asked = 0;
  let right = 0;
  for (const row of rows) {
    const guess = guessStyle(row.print, rows, row.source_sha256);
    if (!guess) continue;
    asked += 1;
    if (guess.genre === row.genre && guess.subGenre === row.sub_genre) right += 1;
  }
  return { clips: rows.length, asked, right };
}

/** The sound print worker on Modal: `SUBMIT` takes a clip and returns a job id, `STATUS?id=` its print once ready. */
export const PRINT_WORKER = {
  SUBMIT: 'https://edbns-mumoo-staging--mumoo-sound-print-staging-submit.us-east.modal.run',
  STATUS: 'https://edbns-mumoo-staging--mumoo-sound-print-staging-status.us-east.modal.run',
};
export const CLIP_WAV_SIZE = 44 + 15 * 48_000 * 2;
export const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;

export async function loadPrints() {
  return db()`select source_sha256, style, genre, sub_genre, print from style_prints`;
}

export async function countGuessAnswer(style, answer) {
  await db()`
    insert into style_guess_answers (day, style, answer, count) values (current_date, ${style}, ${answer}, 1)
    on conflict (day, style, answer) do update set count = style_guess_answers.count + 1`;
}
