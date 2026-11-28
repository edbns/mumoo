import { familyOf, styleKey } from './genres';
import { attitudeOf, type LyricAttitude } from './lyric-meaning';
import type { SongTheme } from './song-themes';

/**
 * Mood boards: the library sorted into scenes, each one look (light, colour, kind of shot), so a reel edited from one board
 * holds together. The admin files media into boards; the brain chooses the boards for a song and the creator never sees them.
 * A board says once what it fits, instead of every picture being tagged:
 *   styles      styles of the directory by their own name (`styles.json`): the surest fit ("Amapiano" and "house music"
 *               share a sub-genre but not a board).
 *   subGenres   and `genres`: where the song sits when its style says nothing of the board.
 *   themes      what the words are about (`song-themes.ts`), and `moods` their main feeling: they choose between the boards of one genre.
 *   primary     the admin's genre map, in their words (shown on the board in the admin): genres the board serves. A song whose style,
 *               sub-genre or genre names one of them fits it too.
 *   secondary   genres it serves only when the words fit (the board's themes or moods): "pop (summer/happy)" on Sunset & Coast.
 * `hunt` is what to look for when filling the board.
 * `owns`: styles the board takes alone, whatever else they fit (every phonk is Block Party: the board is the scene people mix today, cars,
 *   drifting and swag with the party; Afrobeats and Amapiano are Sunset & Coast).
 * `apart`: a board kept out of the creatives (Memes & Funny, to be used its own way): the admin files into it and our models learn
 *   it, but no song is ever dealt from it, and its pictures are never used on a song's creatives.
 */
export type Board = {
  id: string;
  name: string;
  styles: readonly string[];
  subGenres: readonly string[];
  genres: readonly string[];
  themes: readonly SongTheme[];
  moods: readonly LyricAttitude[];
  primary: readonly string[];
  secondary: readonly string[];
  hunt: string;
  /** Styles this board takes alone: a song whose style (else, with none picked, its sub-genre) it matches is dealt from no other board while this one is filled. */
  owns?: RegExp;
  apart?: true;
};

export const BOARDS: readonly Board[] = [
  {
    id: 'rave-warehouse', name: 'Rave, Strobes & Warehouse',
    styles: ['techno', 'hard techno', 'industrial techno', 'tech house', 'slap house', 'house music', 'hard dance', 'drum and bass', 'dubstep',
      'bass music (EDM)', 'electronic dance music', 'gqom', 'industrial dance', 'electronic body music', 'dark ambient'],
    subGenres: ['Techno', 'Tech House', 'Slap House', 'House', 'Dubstep / Riddim', 'G-House', 'Industrial'], genres: ['Electronic & Dance (EDM)', 'Experimental & Avant-Garde'],
    themes: ['party', 'dancing', 'nightlife', 'city'], moods: ['fun', 'confident', 'happy', 'angry'],
    primary: ['Tech house', 'techno', 'hard techno', 'slap house', 'drum and bass', 'dubstep', 'gqom', 'dark drill', 'EDM', 'big room', 'minimal', 'industrial', 'dark electronic'],
    secondary: ['Pop (upbeat/dance)', 'hip-hop (festival anthems)', 'drill', 'UK drill'],
    hunt: 'Festival crowd, DJ booth, laser lights, strobes, stage smoke, concrete warehouse, silhouettes dancing, red neon, dark club',
  },
  {
    id: 'sunset-coast', name: 'Sunset & Coast',
    styles: ['Afro house', 'deep house', 'Afrobeats', 'Afrobeat', 'Amapiano', 'tropical house', 'chill-out music', 'Balearic beat', 'lo-fi house'],
    subGenres: ['Afro House', 'Deep House', 'Dancehall / Afrobeats'], genres: [],
    themes: ['summer', 'freedom', 'romance'], moods: ['love', 'happy', 'thoughtful'],
    primary: ['Afro house', 'deep house', 'afrobeats', 'amapiano', 'tropical house', 'reggae'],
    secondary: ['Pop (summer/happy)', 'R&B (chill)', 'reggaeton (beach vibe)'],
    hunt: 'Beach sunset, palm trees, ocean waves, rooftop party, golden hour, bonfire',
    owns: /^(?!dancehall).*(afrobeat|amapiano)/i,
  },
  {
    id: 'street-concrete', name: 'Street & Concrete',
    styles: ['hip-hop', 'trap music', 'drill', 'UK drill', 'boom bap', 'grime', 'road rap'],
    subGenres: ['Trap', 'Boom Bap / Lo-Fi', 'General Hip-Hop'], genres: ['Hip-Hop & Rap'],
    themes: ['street', 'city'], moods: ['angry', 'confident'],
    primary: ['Hip-hop', 'trap', 'drill', 'UK drill', 'boom bap', 'grime'],
    secondary: ['punk (urban/gritty tracks)'],
    hunt: 'City night street, hoodies, graffiti wall, subway station, basketball court, smoke',
  },
  {
    id: 'block-party', name: 'Block Party',
    styles: ['dancehall', 'funk carioca', 'Brazilian funk', 'reggaeton', 'soca music', 'gqom',
      'phonk', 'Brazilian phonk', 'drift phonk', 'phonk house', 'rare phonk', 'doomshop phonk'],
    subGenres: ['Dancehall / Afrobeats', 'Reggaeton'], genres: ['Reggae & Dancehall', 'Latin & Urbano'],
    themes: ['party', 'dancing', 'friends', 'summer'], moods: ['fun', 'happy', 'flirty'],
    primary: ['dancehall', 'baile funk', 'reggaeton', 'phonk'],
    secondary: ['Hip-hop (party/fun)', 'pop (summer/upbeat)'],
    hunt: 'Street dancing, colourful outfits, outdoor crowd, summer party, sunglasses, cars, drifting, swag, flexing',
    owns: /phonk/i,
  },
  {
    id: 'luxury-flex', name: 'Luxury & Flex',
    styles: ['trap music', 'Latin trap', 'hip-hop', 'contemporary R&B', 'slap house'],
    subGenres: ['Trap', 'Latin Trap'], genres: [],
    themes: ['money', 'cars', 'fame'], moods: ['confident'],
    primary: ['Trap', 'Latin trap', 'hip-hop', 'slap house'],
    secondary: ['R&B (confident/flirty)', 'reggaeton', 'pop'],
    hunt: 'Sports car, champagne, gold chains, mansion pool, private jet, cash',
  },
  {
    id: 'night-neon', name: 'Night Drive, Neon & Lo-Fi',
    styles: ['synthwave', 'lo-fi music', 'lofi hip-hop', 'vaporwave', 'chillwave', 'late night lo-fi', 'chillsynth', 'drill', 'UK drill', 'trap music',
      'contemporary R&B', 'alternative R&B', 'emo rap'],
    subGenres: ['Synthwave / Vaporwave', 'Boom Bap / Lo-Fi', 'Indie Pop', 'Alternative / Indie Rock', 'General Electronic', 'Trap'], genres: [],
    themes: ['cars', 'city', 'nightlife', 'heartbreak'], moods: ['thoughtful', 'sad', 'fun', 'confident', 'angry'],
    primary: ['Synthwave', 'lo-fi', 'vaporwave', 'indie', 'R&B', 'deep house', 'trap (melodic)', 'sad trap'],
    secondary: ['Boom bap (90s nostalgia)', 'pop (retro)', 'Hip-hop', 'pop (late-night/thoughtful moods)', 'Pop (ballads)', 'UK drill (moody/introspective)'],
    hunt: 'Retro 80s car, neon grid, cassette tape, arcade, car interior at night, highway lights, tunnel, headlights, rain on glass, empty street, blue hour',
  },
  {
    id: 'intimate-velvet', name: 'Intimate & Velvet',
    styles: ['contemporary R&B', 'alternative R&B', 'bachata', 'salsa', 'soul', 'pop soul'],
    subGenres: ['Traditional Latin (Salsa, Bachata)', 'Smooth Jazz / Soul'], genres: [],
    themes: ['romance', 'seduction'], moods: ['love', 'flirty'],
    primary: ['R&B', 'bachata', 'salsa', 'soul'],
    secondary: ['Pop (romance/seduction)'],
    hunt: 'Candlelight, silk sheets, couple dancing, dim lounge, city skyline at night',
  },
  {
    id: 'live-raw', name: 'Live & Raw',
    styles: [],
    subGenres: ['Alternative / Indie Rock', 'Psychedelic Rock', 'General Rock', 'Heavy Metal / Hard Rock', 'Extreme Metal (Thrasher, Death)', 'General Metal', 'Pop-Punk', 'Hardcore Punk', 'General Punk'],
    genres: ['Rock', 'Metal', 'Punk'],
    themes: ['freedom', 'friends'], moods: ['angry', 'confident'],
    primary: ['Rock', 'metal', 'punk', 'alternative'],
    secondary: ['Trap-metal', 'hip-hop (high-energy/angry)'],
    hunt: 'Electric guitar, leather jacket, stage fire, skatepark, live band, mosh pit',
  },
  {
    id: 'pop-studio', name: 'Pop & Studio',
    styles: ['pop music', 'hyperpop', 'K-pop', 'dance-pop'],
    subGenres: ['Dance-Pop', 'K-Pop / J-Pop', 'General Pop', 'Indie Pop'], genres: ['Pop'],
    themes: ['fame', 'party', 'dancing'], moods: ['fun', 'happy', 'confident', 'flirty'],
    primary: ['Pop', 'K-pop', 'dance-pop', 'hyperpop'],
    secondary: ['R&B (upbeat)', 'hip-hop (mainstream/colorful)'],
    hunt: 'Confetti, colourful studio backdrop, synchronised dancers, fashion editorial, glitter',
  },
  {
    id: 'horizon-soul', name: 'Horizon, Still & Soul',
    styles: ['ambient music', 'chill-out music', 'downtempo', 'melodic house', 'melodic techno', 'progressive house', 'organic house', 'melodic dubstep',
      'soul', 'church music', 'gospel music', 'Christian music', 'jazz', 'country music', 'folk music'],
    subGenres: ['Ambient / Downtempo', 'Neoclassical', 'Dark Academia / Gothic Classical', 'General Classical', 'Gospel', 'Worship / Contemporary Christian',
      'Christian Hip-Hop', 'General Gospel & Christian', 'General Jazz & Blues', 'Smooth Jazz / Soul', 'Americana / Folk', 'Modern Country', 'General Country & Folk'],
    genres: ['Classical & Cinematic', 'Gospel & Christian', 'Jazz, Soul & Blues', 'Country & Folk'],
    themes: ['nature', 'faith', 'freedom'], moods: ['thoughtful', 'spiritual', 'happy', 'sad'],
    primary: ['Ambient', 'chill', 'acoustic', 'worship', 'gospel', 'jazz', 'soul', 'country', 'folk', 'Americana', 'instrumental', 'melodic house', 'melodic techno', 'emotional electronic'],
    secondary: ['Deep house', 'indie', 'Acoustic pop', 'rock (southern/classic)', 'Hip-hop (spiritual/thoughtful)', 'R&B'],
    hunt: 'Fog, mountains, the sea from above, empty landscape, soft light, open field, dirt road, campfire, choir, stained glass, piano, saxophone',
  },
  {
    id: 'funny-memes', name: 'Memes & Funny',
    styles: [], subGenres: [], genres: [], themes: [], moods: [], primary: [], secondary: [],
    hunt: 'Meme clips, funny reactions, pranks, fails, animals doing something silly, people laughing, comedy moments',
    apart: true,
  },
];

export const BOARD_IDS = BOARDS.map(board => board.id);
/** The boards kept out of the creatives (`apart`). */
export const APART_BOARD_IDS = BOARDS.filter(board => board.apart).map(board => board.id);
/** A board is used once it has this many ready pictures: enough for one reel. Until then the library is chosen from as before. */
export const BOARD_MIN = 8;
/** What the brain knows of a song that the boards care about. */
export type BoardWanted = { genre: string; subGenre: string; style?: string; attitude: string | null; moods?: readonly string[]; themes?: readonly SongTheme[] };

/** More than a sub-genre and genre together: a style named on a board beats another board that only shares its sub-genre. */
const STYLE = 4;
const SUB_GENRE = 2;
const GENRE = 1;
const PRIMARY = 2;
const SECONDARY = 1;
const THEME = 1;
const MOOD = 1;
const OTHER_MOOD = 0.5;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const KEYED = new Map(BOARDS.map(board => [board.id, new Set(board.styles.map(styleKey))]));

/** Genre names as plain words: accents, case and hyphens ("lo-fi", "hip-hop") do not matter; R&B is one word. */
const words = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/r\s*&\s*b/g, 'rnb').replace(/-/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** A genre of the admin's map without its note ("pop (summer/happy)" is "pop"). */
const named = (genre: string) => words(genre.replace(/\(.*?\)/g, ' '));
/** Whether `genre` (from the admin's map) is named in what the brain knows of the song, as whole words: "trap" in "Latin trap", not "pop" in "K-pop". */
// The song's names keep their brackets: "Electronic & Dance (EDM)" names EDM.
const names = (song: string, genre: string) => ` ${song} `.includes(` ${genre} `);
const MAPPED = new Map(BOARDS.map(board => [board.id, { primary: board.primary.map(named), secondary: board.secondary.map(named) }]));

/** How well a board fits the song: its style counts most, then where the song sits, then what the words are about and feel. */
export function boardFit(board: Board, wanted: BoardWanted): number {
  let fit = 0;
  if (wanted.style && KEYED.get(board.id)?.has(styleKey(wanted.style))) fit += STYLE;
  if (wanted.subGenre && board.subGenres.some(sub => same(sub, wanted.subGenre) || same(sub, familyOf(wanted.subGenre)))) fit += SUB_GENRE;
  if (wanted.genre && board.genres.some(genre => same(genre, wanted.genre))) fit += GENRE;
  const song = [wanted.style ?? '', wanted.subGenre, wanted.genre].map(words).join(' | ');
  const mapped = MAPPED.get(board.id);
  if (mapped?.primary.some(genre => names(song, genre))) fit += PRIMARY;
  let wordsFit = false;
  for (const theme of wanted.themes ?? []) if (board.themes.includes(theme)) { fit += THEME; wordsFit = true; }
  const main = attitudeOf(wanted.attitude);
  if (main && board.moods.includes(main)) { fit += MOOD; wordsFit = true; }
  for (const other of wanted.moods ?? []) {
    const mood = attitudeOf(other);
    if (mood && mood !== main && board.moods.includes(mood)) fit += OTHER_MOOD;
  }
  if (wordsFit && mapped?.secondary.some(genre => names(song, genre))) fit += SECONDARY;
  return fit;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The boards that have enough ready pictures to be used, by id: how many each has. A board kept apart is never used. */
export function filledBoards(items: readonly { boards?: readonly string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) for (const id of item.boards ?? []) if (!APART_BOARD_IDS.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Map([...counts].filter(([, count]) => count >= BOARD_MIN));
}

/** The filled boards, best fit for the song first (a song the boards know nothing of still gets them, in its own order). */
export function rankBoards(wanted: BoardWanted, filled: ReadonlyMap<string, number>, song: string): Board[] {
  return BOARDS.filter(board => filled.has(board.id))
    .map(board => ({ board, fit: boardFit(board, wanted) }))
    .sort((a, b) => b.fit - a.fit || hash(`${song}:${a.board.id}`) - hash(`${song}:${b.board.id}`))
    .map(entry => entry.board);
}

/** The filled boards that fit the song, best first; a song no board fits gets them all, in its own order. */
export function songBoards(wanted: BoardWanted, items: readonly { boards?: readonly string[] }[], song: string): Board[] {
  const all = rankBoards(wanted, filledBoards(items), song);
  const named = wanted.style || wanted.subGenre;
  const owner = named ? all.find(board => board.owns?.test(named)) : undefined;
  if (owner) return [owner];
  const fitting = all.filter(board => boardFit(board, wanted) > 0);
  return fitting.length ? fitting : all;
}

/**
 * The board one row of the shelf is dealt from, or null while no board is filled. Every row of a song takes its best board, and
 * keeps it through every Refresh: Refresh deals new pictures from it, never another scene. Only boards that fit exactly as well
 * as the best share the rows.
 */
export function boardForRow(row: string, wanted: BoardWanted, items: readonly { boards?: readonly string[] }[], song: string): Board | null {
  const ranked = songBoards(wanted, items, song);
  if (!ranked.length) return null;
  const top = boardFit(ranked[0], wanted);
  const best = ranked.filter(board => boardFit(board, wanted) === top);
  return best[hash(`${song}:${row}`) % best.length];
}
