/**
 * What a song is about, as something a picture can show. Our lyric reader picks up to three of these codes
 * (`modal_lyric_meaning_staging.py`), and the brain prefers library pictures whose tags show them (`libraryFit`).
 * Tags are typed freely in the admin, as what is seen in the picture; each theme lists the words such a tag contains
 * ("beautiful woman" holds "woman", "breakdancing" holds "danc"), so nobody has to learn this list to tag well.
 */
export const SONG_THEMES = {
  party: ['party', 'club', 'crowd', 'celebrat', 'festival', 'high energy', 'drinks'],
  dancing: ['danc', 'twerk', 'moves', 'choreo'],
  nightlife: ['night', 'neon', 'club', 'bar', 'lights'],
  seduction: ['sexy', 'seduct', 'sensual', 'close up', 'lips', 'body', 'silhouette', 'beautiful', 'pole', 'poll', 'girl', 'female', 'woman', 'women', 'model', 'heels', 'legs'],
  romance: ['couple', 'love', 'romanc', 'romant', 'kiss', 'hug', 'wedding', 'holding hands'],
  heartbreak: ['alone', 'rain', 'tears', 'cry', 'crying', 'empty', 'lonely', 'black and white'],
  money: ['money', 'luxury', 'gold', 'jewel', 'cash', 'rich', 'champagne', 'designer'],
  cars: ['car', 'drive', 'driving', 'motorbike', 'motorcycle'],
  street: ['street', 'hood', 'graffiti', 'urban', 'skat', 'basketball'],
  city: ['city', 'skyline', 'building', 'architecture', 'rooftop', 'neon'],
  summer: ['beach', 'summer', 'sun', 'sunset', 'surf', 'pool', 'tropical', 'sea', 'ocean'],
  nature: ['nature', 'forest', 'mountain', 'field', 'flower', 'landscape', 'sky'],
  freedom: ['road', 'travel', 'flying', 'wind', 'horizon', 'open'],
  faith: ['church', 'pray', 'spiritual', 'cross', 'choir', 'worship', 'light rays'],
  friends: ['friends', 'group', 'crew', 'squad', 'laugh', 'together', 'guys', 'girls', 'man', 'men', 'people'],
  fame: ['stage', 'concert', 'spotlight', 'camera', 'studio', 'red carpet', 'fans', 'singer', 'rapper', 'performer', 'dj', 'festival'],
} as const satisfies Record<string, readonly string[]>;

export type SongTheme = keyof typeof SONG_THEMES;
export const THEMES = Object.keys(SONG_THEMES) as SongTheme[];
export const MAX_SONG_THEMES = 3;

const isTheme = (code: unknown): code is SongTheme => typeof code === 'string' && Object.hasOwn(SONG_THEMES, code);

/** The themes in a reader's answer that are on our list, at most three, each once. */
export function themesOf(raw: unknown): SongTheme[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isTheme))].slice(0, MAX_SONG_THEMES) : [];
}

/** Whether a tag typed in the admin pictures a theme: it is the theme's name, holds one of its longer words anywhere, or one of its short words (car, sun) as a word of its own. */
export function tagShows(tag: string, theme: SongTheme): boolean {
  const text = tag.trim().toLowerCase();
  if (text === theme) return true;
  const words = text.split(/[\s-]+/);
  return SONG_THEMES[theme].some(word => (word.length >= 4 ? text.includes(word) : words.includes(word) || words.includes(`${word}s`)));
}

/** How many of the song's themes an item's tags show. */
export function themesShown(tags: readonly string[], themes: readonly SongTheme[]): number {
  return themes.filter(theme => tags.some(tag => tagShows(tag, theme))).length;
}
