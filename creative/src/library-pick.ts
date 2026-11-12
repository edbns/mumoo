import { themesFor } from './genre-guide';
import { attitudeOf } from './lyric-meaning';
import { themesShown, type SongTheme } from './song-themes';

/**
 * Choosing from the approved library. The library is what the admin cleared (see the admin page); this is how the brain
 * picks from it for one song. Only approved, ready items ever get here (the server sends nothing else).
 *
 *   attitude   the song's attitude is the main match: an item that lists it fits; an item that lists "neutral" fits any
 *              song (a little less); a song with no feeling (neutral, or lyrics not read) takes anything.
 *   genre      optional on an item. Set, it is preferred for that genre (and sub-genre) and kept away from every other;
 *              unset, it is free for any song.
 *              An item that lists one of the song's other moods fits just below the main one.
 *   tags       a tag that is one of the song's genre themes (`genre-guide.ts`) is a small plus (less than a step of attitude or genre), never a reason to refuse.
 *              A tag that shows what the words are about (`song-themes.ts`) is a bigger plus, still less than a step of attitude.
 */
export type LibraryPicture = {
  id: string;
  kind: 'photo' | 'video' | 'gif';
  attitudes: string[];
  tags: string[];
  genre: string | null;
  subGenre: string | null;
  /** A photo, or the poster of a video or GIF. */
  url: string;
  /** A photo's subject cut out of it, once our worker has made it: Dust (and Riso photos) draw only photos that have one. */
  cutoutUrl?: string;
  /** A video or GIF's small prepared clip and its shots, as [start, end] in ms of the clip. Riso and Window can draw these. */
  motionUrl?: string;
  shots?: [number, number][];
  /** What people did with cards drawn from it lately (`learnedCounts` on the server): played, and kept (cart or delivered). */
  learned?: { shown: number; won: number };
};

/** A picture with no history is taken as this many plays at the library's usual rate: a few plays never swing it far. */
const PRIOR_PLAYS = 20;
const LEARNED_WEIGHT = 1.5;
/** Below a theme (0.4): what people kept only orders pictures that fit the song equally well. */
const MOST_LEARNED = 0.3;

/** What the brain knows of the song that the library cares about. */
export type LibraryWanted = {
  attitude: string | null;
  genre: string;
  subGenre: string;
  /** The other moods the words carry: an item that lists one fits, a little below the main mood. */
  moods?: readonly string[];
  /** What the words are about (`song-themes.ts`), shown by the item's tags. */
  themes?: readonly SongTheme[];
};

/** Two shown themes (0.8) never lift a neutral item (1) over the main mood (2); they can lift one of the other moods (1.5) over it. */
const THEME_STEP = 0.4;
const MOST_THEMES = 2;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * How well an item fits the song, or null when it must not be used for it. With `loose`, an item that lists a different feeling is not refused
 * but ranks below every fit (a negative number): it only fills a hand that the fitting items cannot. A genre is never loosened.
 */
export function libraryFit(item: LibraryPicture, wanted: LibraryWanted, loose = false): number | null {
  let fit = 0;
  const wantedMood = attitudeOf(wanted.attitude);
  const feeling = wantedMood && wantedMood !== 'neutral' ? wantedMood : null;
  if (feeling) {
    const moods = item.attitudes.map(attitudeOf);
    const more = (wanted.moods ?? []).map(attitudeOf);
    if (moods.includes(feeling)) fit += 2;
    else if (moods.some(mood => mood && mood !== 'neutral' && more.includes(mood))) fit += 1.5;
    else if (moods.includes('neutral')) fit += 1;
    else if (loose) fit -= 100;
    else return null;
  }
  if (item.genre) {
    if (!same(item.genre, wanted.genre)) return null;
    fit += 4;
    if (item.subGenre) {
      if (!same(item.subGenre, wanted.subGenre)) return null;
      fit += 2;
    }
  }
  const themes = themesFor(wanted.genre, wanted.subGenre);
  const shown = wanted.themes?.length ? Math.min(MOST_THEMES, themesShown(item.tags, wanted.themes)) : 0;
  return fit + Math.min(2, item.tags.filter(tag => themes.includes(tag)).length) * 0.25 + shown * THEME_STEP;
}

/** The library's usual rate of keeping a card it was played on; a library nobody has used yet keeps one in ten. */
export function usualRate(items: readonly LibraryPicture[]): number {
  let shown = 0;
  let won = 0;
  for (const item of items) { shown += item.learned?.shown ?? 0; won += item.learned?.won ?? 0; }
  return (won + 1) / (shown + 10);
}

/**
 * A small, seeded nudge from what people kept: a draw from how often this picture's cards are kept, against the library's usual rate.
 * Each song draws again, so a picture with little history still gets its turns (exploration) and one that is kept often leads more
 * (exploitation). The same `draw` always gives the same nudge, so Refresh walks one order and a hand never reshuffles under the person.
 */
export function learnedNudge(learned: LibraryPicture['learned'], usual: number, draw: string): number {
  const shown = Math.max(0, learned?.shown ?? 0);
  const won = Math.min(shown, Math.max(0, learned?.won ?? 0));
  const rate = (won + usual * PRIOR_PLAYS) / (shown + PRIOR_PLAYS);
  const spread = Math.sqrt((rate * (1 - rate)) / (shown + PRIOR_PLAYS + 1));
  // Two seeded uniforms, one normal draw (Box-Muller).
  const u = (hash(`${draw}:u`) + 1) / 4294967297;
  const v = hash(`${draw}:v`) / 4294967296;
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-MOST_LEARNED, Math.min(MOST_LEARNED, (rate + spread * z - usual) * LEARNED_WEIGHT));
}

/**
 * Up to `count` items for this song, best fit first. `song` keeps the order the same for the same song; `generation`
 * (the row's Refresh count) moves on to the next hand, and after the last the deal starts again. While fewer than `count`
 * items fit, the nearest others (a different feeling, never another genre) fill the hand, so a small library still fills the row.
 */
export function pickLibrary(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, count: number): LibraryPicture[] {
  const usual = usualRate(items);
  const learning = items.some(item => item.learned);
  const order = (loose: boolean) => items
    .map(item => {
      const fit = libraryFit(item, wanted, loose);
      return { item, fit: fit === null || !learning ? fit : fit + learnedNudge(item.learned, usual, `${song}:${item.id}`) };
    })
    .filter((entry): entry is { item: LibraryPicture; fit: number } => entry.fit !== null)
    .sort((a, b) => b.fit - a.fit || hash(`${song}:${a.item.id}`) - hash(`${song}:${b.item.id}`) || (a.item.id < b.item.id ? -1 : 1))
    .map(entry => entry.item);
  // The items that fit come first. While they are fewer than a hand, the nearest others (a different feeling, never another genre) fill it, so a small library still fills the row.
  const fitting = order(false);
  const ranked = fitting.length >= count ? fitting : order(true);
  if (ranked.length <= count) return ranked;
  const start = (generation * count) % ranked.length;
  return Array.from({ length: count }, (_, index) => ranked[(start + index) % ranked.length]);
}
