import { themesFor } from './genre-guide';
import { attitudeOf, type LyricAttitude } from './lyric-meaning';
import { tagShows, type SongTheme } from './song-themes';

/**
 * Choosing from the approved library. The library is what the admin cleared (see the admin page); this is how the brain
 * picks from it for one song. Only approved, ready items ever get here (the server sends nothing else).
 *
 * A picture says what is in it (its tags: car, girls, club, champagne); the song says what it feels and is about. The brain
 * turns the song into the things it wants to see, and a picture fits by how many of them its tags show:
 *   themes     what the words are about (`song-themes.ts`): the strongest pull.
 *   mood       the song's feeling, as things to see (`MOOD_CONTENT`): a confident song wants money, cars, fame.
 *   genre      the genre's own looks (`genre-guide.ts`). An item may also be kept for one genre (and sub-genre): then it
 *              is preferred for it and never used for another; unset, it is free for any song.
 * A picture that shows none of them still fills a hand that the fitting ones cannot. A picture has no mood of its own:
 * the mood belongs to the song (the `attitudes` of older items are not read).
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
/** Below the least a shown thing counts (0.5): what people kept only orders pictures that fit the song equally well. */
const MOST_LEARNED = 0.3;

/** What the brain knows of the song that the library cares about. */
export type LibraryWanted = {
  attitude: string | null;
  genre: string;
  subGenre: string;
  /** The other moods the words carry: what they want to see counts too, a little less. */
  moods?: readonly string[];
  /** What the words are about (`song-themes.ts`), shown by the item's tags. */
  themes?: readonly SongTheme[];
};

/** A song's feeling, as the things a picture for it can show. Neutral asks for nothing; the themes and the genre then lead. */
export const MOOD_CONTENT: Readonly<Record<LyricAttitude, readonly SongTheme[]>> = {
  happy: ['summer', 'friends', 'party', 'freedom'],
  fun: ['party', 'dancing', 'friends', 'summer'],
  flirty: ['seduction', 'dancing', 'nightlife'],
  love: ['romance', 'seduction', 'summer'],
  confident: ['money', 'cars', 'fame', 'nightlife', 'street'],
  angry: ['street', 'city', 'cars'],
  sad: ['heartbreak', 'nature', 'city'],
  thoughtful: ['nature', 'city', 'freedom'],
  spiritual: ['faith', 'nature', 'freedom'],
  neutral: [],
};

/** How much one thing the song wants counts when a picture shows it: what the words are about most, then its feeling and its genre. */
const THEME_WEIGHT = 2;
const MOOD_WEIGHT = 1;
const OTHER_MOOD_WEIGHT = 0.5;
const GENRE_WEIGHT = 1;

type Want = { show: (tag: string) => boolean; weight: number };

/** A genre look (`THEME_TAGS`): the tag is it, or has it as a word of its own (also in the plural). */
const showsWord = (word: string) => (tag: string) => {
  const words = tag.trim().toLowerCase().split(/[\s-]+/);
  return words.includes(word) || words.includes(`${word}s`) || (word.endsWith('s') && words.includes(word.slice(0, -1)));
};

/** Everything the song wants to see, each once, at the weight of its strongest reason. */
export function wantsOf(wanted: LibraryWanted): Want[] {
  const weights = new Map<string, Want>();
  const want = (key: string, show: Want['show'], weight: number) => {
    const have = weights.get(key);
    if (!have || have.weight < weight) weights.set(key, { show, weight });
  };
  for (const theme of wanted.themes ?? []) want(theme, tag => tagShows(tag, theme), THEME_WEIGHT);
  const main = attitudeOf(wanted.attitude);
  if (main) for (const theme of MOOD_CONTENT[main]) want(theme, tag => tagShows(tag, theme), MOOD_WEIGHT);
  for (const other of wanted.moods ?? []) {
    const mood = attitudeOf(other);
    if (mood && mood !== main) for (const theme of MOOD_CONTENT[mood]) want(theme, tag => tagShows(tag, theme), OTHER_MOOD_WEIGHT);
  }
  for (const look of themesFor(wanted.genre, wanted.subGenre)) want(`genre:${look}`, showsWord(look), GENRE_WEIGHT);
  return [...weights.values()];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * How well an item fits the song: the weight of every thing the song wants that its tags show (0 when it shows none).
 * Null only when the item is kept for another genre or sub-genre. `wants` is `wantsOf(wanted)`, worked out once per hand.
 */
export function libraryFit(item: LibraryPicture, wanted: LibraryWanted, wants: readonly Want[] = wantsOf(wanted)): number | null {
  let fit = 0;
  if (item.genre) {
    if (!same(item.genre, wanted.genre)) return null;
    fit += 4;
    if (item.subGenre) {
      if (!same(item.subGenre, wanted.subGenre)) return null;
      fit += 2;
    }
  }
  for (const want of wants) if (item.tags.some(want.show)) fit += want.weight;
  return fit;
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
 * (the row's Refresh count) moves on to the next hand, and after the last the deal starts again. Refresh walks only the
 * pictures that show something the song wants, while there is a hand of them; with fewer, the others (never one kept for
 * another genre) fill it, so a small library still fills the row.
 */
export function pickLibrary(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, count: number): LibraryPicture[] {
  const usual = usualRate(items);
  const learning = items.some(item => item.learned);
  const wants = wantsOf(wanted);
  const scored = items
    .map(item => ({ item, fit: libraryFit(item, wanted, wants) }))
    .filter((entry): entry is { item: LibraryPicture; fit: number } => entry.fit !== null)
    .map(entry => ({ ...entry, rank: learning ? entry.fit + learnedNudge(entry.item.learned, usual, `${song}:${entry.item.id}`) : entry.fit }))
    .sort((a, b) => b.rank - a.rank || hash(`${song}:${a.item.id}`) - hash(`${song}:${b.item.id}`) || (a.item.id < b.item.id ? -1 : 1));
  const fitting = scored.filter(entry => entry.fit > 0);
  const ranked = (fitting.length >= count ? fitting : scored).map(entry => entry.item);
  if (ranked.length <= count) return ranked;
  const start = (generation * count) % ranked.length;
  return Array.from({ length: count }, (_, index) => ranked[(start + index) % ranked.length]);
}
