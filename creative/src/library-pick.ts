import { styleLooksFor, themesFor, type GenreColours } from './genre-guide';
import { familyOf } from './genres';
import { attitudeOf, type LyricAttitude } from './lyric-meaning';
import { tagShows, THEMES, type SongTheme } from './song-themes';

/**
 * Choosing from the approved library. The library is what the admin cleared (see the admin page); this is how the brain
 * picks from it for one song. Only approved, ready items ever get here (the server sends nothing else).
 *
 * A picture says what is in it (its tags: car, girls, club, champagne); the song says what it feels and is about. The brain
 * turns the song into the things it wants to see, and a picture fits by how many of them its tags show:
 *   themes     what the words are about (`song-themes.ts`): the strongest pull.
 *   mood       the song's feeling, as things to see (`MOOD_CONTENT`): a confident song wants money, cars, fame.
 *   genre      the genre's own looks, and what the style the creator picked is known for (`genre-guide.ts`). An item may also be kept for one genre (and sub-genre): then it
 *              is never used for another, and a little preferred for its own; unset, it is free for any song.
 * A thing counts in full when the admin's tags show it, and up to half when only our vision model sees it (`looks`, 0..1):
 * the tags are checked by a person, the model fills in what they missed.
 * A picture that shows something wanted is also a little preferred when it carries the colours the genre calls for (`colourFit`).
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
  /** The mood boards the admin filed it in (`boards.ts`). */
  boards?: string[];
  /** A photo, or the poster of a video or GIF. */
  url: string;
  /** A photo's subject cut out of it, once our worker has made it: Dust (and Riso photos) draw only photos that have one. */
  cutoutUrl?: string;
  /** A video or GIF's small prepared clip and its shots, as [start, end] in ms of the clip. Riso and Window can draw these. */
  motionUrl?: string;
  shots?: [number, number][];
  /** What people did with cards drawn from it lately (`learnedCounts` on the server). */
  learned?: Learned;
  /** How strongly our vision model sees each look in it (song themes and genre looks), 0..1; unseen looks are left out. */
  looks?: Readonly<Record<string, number>>;
  /** Its colours, measured on our server like a song's cover (a clip's are its poster's). Absent until measured. */
  colours?: PictureColours;
};

/** What the brain reads of a picture's colours (`colour-read.mjs`). */
export type PictureColours = { palette: readonly { hex: string; share: number }[]; lightness: number; saturation: number; contrast: number };

/**
 * What people did with something lately: how often it was played (`shown`), and how much of that was kept (`won`, 0…shown): a card
 * that was downloaded counts in full, one only put in the cart a third.
 */
export type Learned = { shown: number; won: number };

/** A picture with no history is taken as this many plays at the library's usual rate: a few plays never swing it far. */
const PRIOR_PLAYS = 20;
const LEARNED_WEIGHT = 1.5;
/** Below the least a tagged thing counts (0.5): what people kept only orders pictures that fit the song about equally well. */
const MOST_LEARNED = 0.3;

/** What the brain knows of the song that the library cares about. */
export type LibraryWanted = {
  attitude: string | null;
  genre: string;
  subGenre: string;
  /** The style the creator picked ("Afro house"): what it is known for counts as the genre's looks do. */
  style?: string;
  /** The other moods the words carry: what they want to see counts too, a little less. */
  moods?: readonly string[];
  /** What the words are about (`song-themes.ts`), shown by the item's tags. */
  themes?: readonly SongTheme[];
  /** The words said nothing (no lyrics, or too few): the attitude was heard in the music, and the genre's looks count double. */
  fromSound?: true;
  /** The colours the song's genre calls for (`coloursFor`); absent for a genre with none. */
  colours?: GenreColours;
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
/** An item kept for the song's genre, and for its sub-genre too: a small plus, below one thing it shows. */
const GENRE_KEPT = 0.75;
const SUB_GENRE_KEPT = 0.25;
/** The most a thing seen only by the vision model counts, against one the admin tagged. */
const SEEN_SHARE = 0.5;
/** A picture in the genre's colours, against one in none of them: below one thing it shows (a mood's 1), above the genre it is kept for. */
const COLOUR_WEIGHT = 0.8;

/** `look` names the same thing in the vision model's `looks`. */
type Want = { show: (tag: string) => boolean; look: string; weight: number };

/** A word without its ending, so its forms meet: dance, dancer, dancers, dancing; party, parties. What is left keeps 3 letters (ring, rings). */
function root(word: string) {
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  const ending = ['ers', 'ing', 'er', 'es', 's', 'e'].find(end => word.endsWith(end) && word.length - end.length >= 3);
  return ending ? word.slice(0, -ending.length) : word;
}
const wordsOf = (text: string) => text.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
/** Two ways to write words as one: each word's root run together, and the root of them written as one ("night life" and "nightlife"). */
const forms = (words: readonly string[]) => [words.map(root).join(''), root(words.join(''))];

/** A genre or style look ("club", "african dance"): the tag is it, or has its words in a row, in any of their forms. */
const showsWords = (look: string) => {
  const wanted = forms(wordsOf(look));
  return (tag: string) => {
    const words = wordsOf(tag);
    return words.some((_, at) => words.slice(at).some((__, end) =>
      forms(words.slice(at, at + end + 1)).some(form => wanted.includes(form))));
  };
};
const isTheme = (look: string): look is SongTheme => (THEMES as readonly string[]).includes(look);

/** Everything the song wants to see, each once, at the weight of its strongest reason. */
export function wantsOf(wanted: LibraryWanted): Want[] {
  const weights = new Map<string, Want>();
  const want = (key: string, show: Want['show'], look: string, weight: number) => {
    const have = weights.get(key);
    if (!have || have.weight < weight) weights.set(key, { show, look, weight });
  };
  const theme = (code: SongTheme, weight: number) => want(code, tag => tagShows(tag, code), code, weight);
  for (const code of wanted.themes ?? []) theme(code, THEME_WEIGHT);
  const main = attitudeOf(wanted.attitude);
  if (main) for (const code of MOOD_CONTENT[main]) theme(code, MOOD_WEIGHT);
  for (const other of wanted.moods ?? []) {
    const mood = attitudeOf(other);
    if (mood && mood !== main) for (const code of MOOD_CONTENT[mood]) theme(code, OTHER_MOOD_WEIGHT);
  }
  const genreWeight = wanted.fromSound ? GENRE_WEIGHT * 2 : GENRE_WEIGHT;
  for (const look of [...themesFor(wanted.genre, wanted.subGenre), ...styleLooksFor(wanted.style)]) {
    if (isTheme(look)) theme(look, genreWeight);
    else want(`genre:${look}`, showsWords(look), look, genreWeight);
  }
  return [...weights.values()];
}

/** How much of one wanted thing an item shows: all of it when tagged, up to half when only seen. */
const shownBy = (item: LibraryPicture, want: Want) => (item.tags.some(want.show) ? 1 : SEEN_SHARE * (item.looks?.[want.look] ?? 0));

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * How well an item fits the song: the weight of every thing the song wants, times how much of it the item shows (0 when it shows none).
 * Null only when the item is kept for another genre or sub-genre (one kept for House fits every house style). `wants` is
 * `wantsOf(wanted)`, worked out once per hand.
 */
export function libraryFit(item: LibraryPicture, wanted: LibraryWanted, wants: readonly Want[] = wantsOf(wanted)): number | null {
  let fit = 0;
  if (item.genre) {
    if (!same(item.genre, wanted.genre)) return null;
    fit += GENRE_KEPT;
    if (item.subGenre) {
      if (!same(item.subGenre, wanted.subGenre) && !same(item.subGenre, familyOf(wanted.subGenre))) return null;
      fit += SUB_GENRE_KEPT;
    }
  }
  let shows = 0;
  for (const want of wants) shows += want.weight * shownBy(item, want);
  // Colours only lift a picture that shows something the song wants: a picture of the wrong thing in the right colours stays behind.
  const colour = shows > 0 && wanted.colours && item.colours ? COLOUR_WEIGHT * colourFit(item.colours, wanted.colours) : 0;
  return fit + shows + colour;
}

const rgb = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
/** How far apart two colours look, 0…~765: RGB weighted the way the eye weighs it ("redmean"). */
function colourDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const red = (r1 + r2) / 2;
  return Math.sqrt((2 + red / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - red) / 256) * (b1 - b2) ** 2);
}
/** A colour of the picture counts in full once it covers this much of it: a speck of the right colour is not the picture's colour. */
const FULL_SHARE = 0.12;
const near = (target: number, value: number) => Math.max(0, 1 - 2 * Math.abs(target - value));

/**
 * How well a picture carries a genre's colours, 0…1. Mostly whether its main colours are among the genre's (the best two of them count:
 * "deep blues, warm ambers, neon purples" asks for some of those, not all), then how light, how vivid and how contrasty it is.
 */
export function colourFit(picture: PictureColours, genre: GenreColours): number {
  const matches = genre.swatches
    .map(swatch => Math.max(0, ...picture.palette.map(colour => Math.exp(-((colourDistance(swatch, colour.hex) / 150) ** 2)) * Math.min(1, colour.share / FULL_SHARE))))
    .sort((a, b) => b - a);
  const swatches = (matches[0] + (matches[1] ?? matches[0])) / 2;
  const light = near(genre.light, picture.lightness);
  const vivid = near(genre.vivid, picture.saturation);
  if (genre.contrast === undefined) return 0.55 * swatches + 0.2 * light + 0.25 * vivid;
  return 0.5 * swatches + 0.15 * light + 0.2 * vivid + 0.15 * near(genre.contrast, picture.contrast);
}

const CLEARLY_SEEN = 0.6;

/** The things an item shows, as far as a reel's mix is concerned: its tags, and the looks the vision model sees clearly. */
export function showing(item: LibraryPicture): string[] {
  const clear = Object.entries(item.looks ?? {}).flatMap(([look, strength]) => (strength >= CLEARLY_SEEN ? [`look:${look}`] : []));
  return [...item.tags.map(tag => tag.trim().toLowerCase()), ...clear];
}

/** The library's usual rate of keeping a card it was played on; a library nobody has used yet keeps one in ten. */
export function usualRate(items: readonly Pick<LibraryPicture, 'learned'>[]): number {
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
