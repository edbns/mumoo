import { db } from './person.mjs';
import ANCHORS from './genre-anchors.mjs';

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

/** True for a clip's tempo as the song reader heard it: { sourceSha256, offsetMs, bpm, energy }, either of the two may be null. */
export function validTempo(v) {
  if (!v || typeof v !== 'object' || typeof v.sourceSha256 !== 'string' || !SHA.test(v.sourceSha256)) return false;
  if (!Number.isInteger(v.offsetMs) || v.offsetMs < 0 || v.offsetMs > 86_400_000) return false;
  const bpm = v.bpm === null || (typeof v.bpm === 'number' && Number.isFinite(v.bpm) && v.bpm > 0 && v.bpm <= 400);
  const energy = v.energy === null || (typeof v.energy === 'number' && Number.isFinite(v.energy) && v.energy >= 0 && v.energy <= 1);
  return bpm && energy && (v.bpm !== null || v.energy !== null);
}

export async function storeTempo({ sourceSha256, offsetMs, bpm, energy }) {
  await db()`
    insert into style_clip_tempos (source_sha256, offset_ms, bpm, energy) values (${sourceSha256}, ${offsetMs}, ${bpm}, ${energy})
    on conflict (source_sha256, offset_ms) do update set bpm = excluded.bpm, energy = excluded.energy, created_at = now()`;
}

export async function loadTempo({ sourceSha256, offsetMs }) {
  const [row] = await db()`select bpm, energy from style_clip_tempos where source_sha256 = ${sourceSha256} and offset_ms = ${offsetMs}`;
  return row ? { bpm: row.bpm, energy: row.energy } : null;
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
 * The guess before the blend (kept to measure against): the style a clip most likely is from the kept prints alone, or null.
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
 * The brain's genre guess blends what the clip sounds like next to the songs it knows with how it matches words describing
 * each genre's sound (`genre-anchors.mjs`, CLAP text prompts). The words are a quarter of the chance, so a genre is only
 * guessed once songs of it are kept; they settle a clip the nearest songs are split over. Measured
 * 2026-11-23 on 536 staging clips (163 songs, settings chosen on other songs, 5 folds): the songs alone name the right genre
 * 76% of the time, the words alone 55–61%, a quarter words and three quarters songs 77.5%.
 * `guessAt`: "I don't know" is offered a guess for about 65% of songs, the right genre 90% of the time (the songs' sub-genre
 * vote this replaced offered one for 20%). `checkAt`: a creator's pick is questioned only this sure; it would wrongly
 * question about 1 correct pick in 250 and is sure enough to question on about a quarter of songs.
 */
export const BLEND = { words: 0.25, temperature: 0.03, nearest: 7, guessAt: 0.56, checkAt: 0.85 };
export const CHECK_ANSWERS = { yes: 'switch', no: 'keep', unsure: 'unsure' };

/**
 * Tempo and loudness guardrails: `bpm` as the song reader heard it, `energy` its mean frame loudness (RMS, 0–1; loud masters
 * sit near 0.4). Each is a nudge to how alike the clip is to a lane's words, and in the house or techno question to its songs,
 * never a ban: at the blend's temperature `nudge` makes a lane or song about 1.6 times as likely, or as unlikely.
 * Trap, drill and drum and bass are often heard at half time (140 as 70), so below `halfTimeBelow` their tempo counts double.
 * Unmeasured: on for staging, off elsewhere, until about 100 clips with tempo are kept and checked (ENABLE_BPM_GUARDRAILS=true|false overrides).
 */
export const GUARDRAILS = { nudge: 0.015, halfTimeBelow: 95, technoFrom: 126, houseTo: 132, quietBelow: 0.35, slowBelow: 105 };
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
export const guardrailsOn = () => process.env.ENABLE_BPM_GUARDRAILS
  ? process.env.ENABLE_BPM_GUARDRAILS === 'true'
  : process.env.SITE_ID === STAGING_SITE;
/** The lowest tempo, counted at full time, of the lanes often heard at half time. */
const HALF_TIME = { trap: 120, drill: 120, 'drum-and-bass': 150 };
/** Lanes boosted only for a slow, quiet clip, and, with no song of their sub-genre kept yet, guessed by their words. */
const QUIET = new Set(['ambient', 'lo-fi']);
const ELECTRONIC = 'Electronic & Dance (EDM)';
const HOUSE = new Set(['House', 'Deep House', 'Tech House', 'Afro House', 'Slap House', 'G-House']);
const side = subGenre => subGenre === 'Techno' ? 'techno' : HOUSE.has(subGenre) ? 'house' : null;
const styleOf = item => ({ style: item.style, genre: item.genre, subGenre: item.subGenre });

/** What tempo adds to how alike a clip is to a lane ({ id, subGenre }) or a song ({ subGenre }): 0 without tempo. */
export function tempoNudge(tempo, { id, subGenre }) {
  const bpm = tempo?.bpm ?? null;
  const energy = tempo?.energy ?? null;
  const { nudge } = GUARDRAILS;
  if (bpm !== null && id in HALF_TIME) return (bpm < GUARDRAILS.halfTimeBelow ? bpm * 2 : bpm) < HALF_TIME[id] ? -nudge : 0;
  if (bpm !== null && side(subGenre) === 'techno' && bpm < GUARDRAILS.technoFrom) return -nudge;
  if (bpm !== null && side(subGenre) === 'house' && bpm > GUARDRAILS.houseTo) return -nudge;
  if (QUIET.has(id) && bpm !== null && energy !== null && bpm < GUARDRAILS.slowBelow && energy < GUARDRAILS.quietBelow) return nudge;
  return 0;
}

/**
 * How likely each genre is for a clip (chances add up to 1 once a song is kept), how alike it is to each lane, and every other
 * song by its clip nearest this one, most alike first. `words` of the chance follows the zero-shot lanes (softmax at
 * `temperature`, nudged by `tempo` when given); the rest is the share of likeness the `nearest` songs of each genre carry.
 * The clip's own song is left out.
 */
export function genreChances(print, rows, ownSha256, { words, temperature, nearest } = BLEND, tempo = null) {
  const chances = {};
  const likeness = ANCHORS.lanes.map(lane => dot(print, lane.vector) + tempoNudge(tempo, lane));
  const top = Math.max(...likeness);
  const weights = likeness.map(alike => Math.exp((alike - top) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  ANCHORS.lanes.forEach((lane, i) => { chances[lane.genre] = (chances[lane.genre] ?? 0) + words * weights[i] / total; });
  const best = new Map();
  for (const row of rows) {
    if (row.source_sha256 === ownSha256) continue;
    const alike = dot(print, row.print);
    if (!(best.get(row.source_sha256)?.alike >= alike)) best.set(row.source_sha256, { style: row.style, genre: row.genre, subGenre: row.sub_genre, alike });
  }
  const songs = [...best.values()].sort((a, b) => b.alike - a.alike);
  const near = songs.slice(0, nearest);
  const likenessNear = near.reduce((sum, song) => sum + Math.max(0, song.alike), 0);
  if (likenessNear > 0) for (const song of near) chances[song.genre] = (chances[song.genre] ?? 0) + (1 - words) * Math.max(0, song.alike) / likenessNear;
  return { chances, songs, likeness };
}

/**
 * House or techno, for an electronic clip: the chance of each (adding up to 1) by the blend over the lanes and the `nearest`
 * kept songs of the two, both weighed at the blend's temperature so tempo nudges them alike, and the nearest song of each.
 * Null with no such song kept: the words alone never decide.
 */
export function houseOrTechno(songs, likeness, tempo = null, { words, temperature, nearest } = BLEND) {
  const lanes = ANCHORS.lanes.map((lane, i) => ({ side: lane.genre === ELECTRONIC ? side(lane.subGenre) : null, alike: likeness[i] })).filter(lane => lane.side);
  const near = songs.filter(song => song.genre === ELECTRONIC && side(song.subGenre)).slice(0, nearest)
    .map(song => ({ ...song, side: side(song.subGenre), alike: song.alike + tempoNudge(tempo, song) }));
  if (!near.length) return null;
  const share = items => {
    const top = Math.max(...items.map(item => item.alike));
    const weights = items.map(item => ({ side: item.side, weight: Math.exp((item.alike - top) / temperature) }));
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    return side => weights.filter(item => item.side === side).reduce((sum, item) => sum + item.weight, 0) / total;
  };
  const byWords = share(lanes);
  const bySongs = share(near);
  return {
    house: words * byWords('house') + (1 - words) * bySongs('house'),
    techno: words * byWords('techno') + (1 - words) * bySongs('techno'),
    songs: { house: near.find(song => song.side === 'house') ?? null, techno: near.find(song => song.side === 'techno') ?? null },
  };
}

/**
 * The style a clip most likely is ({ style, genre, subGenre }), or null when no genre has `at` of the chance. The genre is
 * the blend's (more than the words' quarter, so songs of it are kept); the style is that of its nearest kept song, except that
 * an ambient or lo-fi lane the clip matches best names its own style while no song of its sub-genre is kept. With
 * `guardrails`, `tempo` nudges the lanes and an electronic clip between house and techno takes the nearest song of the likelier.
 */
export function blendGuess(print, rows, ownSha256, { at = BLEND.guessAt, guardrails = false, tempo = null } = {}) {
  const nudged = guardrails ? tempo : null;
  const { chances, songs, likeness } = genreChances(print, rows, ownSha256, BLEND, nudged);
  const [genre, chance] = Object.entries(chances).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!genre || chance < at) return null;
  const lane = ANCHORS.lanes.map((item, i) => ({ item, alike: likeness[i] })).filter(({ item }) => item.genre === genre)
    .sort((a, b) => b.alike - a.alike)[0]?.item;
  if (lane && QUIET.has(lane.id) && !songs.some(song => song.genre === genre && song.subGenre === lane.subGenre)) return styleOf(lane);
  const song = songs.find(item => item.genre === genre);
  if (!song) return null;
  if (guardrails && genre === ELECTRONIC && side(song.subGenre)) {
    const split = houseOrTechno(songs, likeness, nudged);
    const likelier = split && (split.house >= split.techno ? split.songs.house : split.songs.techno);
    if (likelier) return styleOf(likelier);
  }
  return styleOf(song);
}

/**
 * The style to offer instead of the creator's pick ({ style, genre, subGenre }), or null unless the brain is `at` sure of
 * another genre. With `guardrails`, a pick of house or techno the brain hears as electronic is also questioned when it is
 * `at` sure of the other.
 */
export function checkPick(print, rows, ownSha256, picked, { at = BLEND.checkAt, guardrails = false, tempo = null } = {}) {
  const guess = blendGuess(print, rows, ownSha256, { at, guardrails, tempo });
  if (guess && guess.genre !== picked.genre) return guess;
  if (!guardrails || picked.genre !== ELECTRONIC || !side(picked.subGenre)) return null;
  const { chances, songs, likeness } = genreChances(print, rows, ownSha256, BLEND, tempo);
  if (!(chances[ELECTRONIC] >= BLEND.guessAt)) return null;
  const split = houseOrTechno(songs, likeness, tempo);
  const other = side(picked.subGenre) === 'house' ? 'techno' : 'house';
  return split?.[other] >= at && split.songs[other] ? styleOf(split.songs[other]) : null;
}

export async function countCheckAnswer(picked, guessed, answer) {
  await db()`
    insert into style_check_answers (day, picked, guessed, answer, count) values (current_date, ${picked}, ${guessed}, ${answer}, 1)
    on conflict (day, picked, guessed, answer) do update set count = style_check_answers.count + 1`;
}

/**
 * What creators who do not know would see today: for each kept clip, hidden with its whole song, whether the site would
 * ask and whether its guess is the right genre. A yes to a wrong guess is kept as true, so `right` matters most.
 */
export function readiness(rows) {
  let asked = 0;
  let right = 0;
  for (const row of rows) {
    const guess = blendGuess(row.print, rows, row.source_sha256);
    if (!guess) continue;
    asked += 1;
    if (guess.genre === row.genre) right += 1;
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
