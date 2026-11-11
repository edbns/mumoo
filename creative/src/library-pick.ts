import { themesFor } from './genre-guide';
import { attitudeOf } from './lyric-meaning';

/**
 * Choosing from the approved library. The library is what the admin cleared (see the admin page); this is how the brain
 * picks from it for one song. Only approved, ready items ever get here (the server sends nothing else).
 *
 *   attitude   the song's attitude is the main match: an item that lists it fits; an item that lists "neutral" fits any
 *              song (a little less); a song with no feeling (neutral, or lyrics not read) takes anything.
 *   genre      optional on an item. Set, it is preferred for that genre (and sub-genre) and kept away from every other;
 *              unset, it is free for any song.
 *   tags       a tag that is one of the song's genre themes (`genre-guide.ts`) is a small plus (less than a step of attitude or genre), never a reason to refuse.
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
};

/** What the brain knows of the song that the library cares about. */
export type LibraryWanted = { attitude: string | null; genre: string; subGenre: string };

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
    if (moods.includes(feeling)) fit += 2;
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
  return fit + Math.min(2, item.tags.filter(tag => themes.includes(tag)).length) * 0.25;
}

/**
 * Up to `count` items for this song, best fit first. `song` keeps the order the same for the same song; `generation`
 * (the row's Refresh count) moves on to the next hand, and after the last the deal starts again. While fewer than `count`
 * items fit, the nearest others (a different feeling, never another genre) fill the hand, so a small library still fills the row.
 */
export function pickLibrary(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, count: number): LibraryPicture[] {
  const order = (loose: boolean) => items
    .map(item => ({ item, fit: libraryFit(item, wanted, loose) }))
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
