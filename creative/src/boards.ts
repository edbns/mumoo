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
 * `hunt` is what to look for when filling the board.
 */
export type Board = {
  id: string;
  name: string;
  styles: readonly string[];
  subGenres: readonly string[];
  genres: readonly string[];
  themes: readonly SongTheme[];
  moods: readonly LyricAttitude[];
  hunt: string;
};

export const BOARDS: readonly Board[] = [
  {
    id: 'main-stage', name: 'Main Stage',
    styles: ['techno', 'tech house', 'slap house', 'dubstep', 'drum and bass', 'electronic dance music', 'house music', 'hard dance', 'bass music (EDM)'],
    subGenres: ['Techno', 'Tech House', 'Slap House', 'House', 'Dubstep / Riddim', 'G-House'], genres: ['Electronic & Dance (EDM)'],
    themes: ['party', 'dancing', 'nightlife'], moods: ['fun', 'confident', 'happy'],
    hunt: 'Festival crowd, DJ booth, laser lights, stage smoke, strobe lights, rave',
  },
  {
    id: 'dark-warehouse', name: 'Dark Warehouse',
    styles: ['techno', 'gqom', 'industrial techno', 'industrial dance', 'electronic body music', 'dark ambient'],
    subGenres: ['Techno', 'Industrial'], genres: ['Experimental & Avant-Garde'],
    themes: ['nightlife', 'city'], moods: ['angry', 'confident', 'thoughtful'],
    hunt: 'Concrete warehouse, silhouette dancing, red neon, dark club, shadows',
  },
  {
    id: 'sunset-coast', name: 'Sunset & Coast',
    styles: ['Afro house', 'deep house', 'Afrobeats', 'tropical house', 'chill-out music', 'Balearic beat', 'lo-fi house'],
    subGenres: ['Afro House', 'Deep House', 'Dancehall / Afrobeats'], genres: [],
    themes: ['summer', 'freedom', 'romance'], moods: ['love', 'happy', 'thoughtful'],
    hunt: 'Beach sunset, palm trees, ocean waves, rooftop party, golden hour, bonfire',
  },
  {
    id: 'street-concrete', name: 'Street & Concrete',
    styles: ['hip-hop', 'trap music', 'drill', 'UK drill', 'boom bap', 'grime', 'road rap'],
    subGenres: ['Trap', 'Boom Bap / Lo-Fi', 'General Hip-Hop'], genres: ['Hip-Hop & Rap'],
    themes: ['street', 'city'], moods: ['angry', 'confident'],
    hunt: 'City night street, hoodies, graffiti wall, subway station, basketball court, smoke',
  },
  {
    id: 'block-party', name: 'Block Party',
    styles: ['Afrobeats', 'Amapiano', 'dancehall', 'funk carioca', 'Brazilian funk', 'reggaeton', 'soca music', 'gqom'],
    subGenres: ['Dancehall / Afrobeats', 'Reggaeton'], genres: ['Reggae & Dancehall', 'Latin & Urbano'],
    themes: ['party', 'dancing', 'friends', 'summer'], moods: ['fun', 'happy', 'flirty'],
    hunt: 'Street dancing, colourful outfits, outdoor crowd, summer party, sunglasses',
  },
  {
    id: 'luxury-flex', name: 'Luxury & Flex',
    styles: ['trap music', 'Latin trap', 'hip-hop', 'contemporary R&B', 'slap house'],
    subGenres: ['Trap', 'Latin Trap'], genres: [],
    themes: ['money', 'cars', 'fame'], moods: ['confident'],
    hunt: 'Sports car, champagne, gold chains, mansion pool, private jet, cash',
  },
  {
    id: 'vhs-retro', name: 'VHS & Retro',
    styles: ['synthwave', 'phonk', 'lo-fi music', 'lofi hip-hop', 'vaporwave', 'chillwave', 'late night lo-fi', 'chillsynth'],
    subGenres: ['Synthwave / Vaporwave', 'Boom Bap / Lo-Fi', 'Indie Pop', 'Alternative / Indie Rock', 'General Electronic'], genres: [],
    themes: ['cars', 'city', 'nightlife'], moods: ['thoughtful', 'sad', 'fun'],
    hunt: 'Retro 80s car, neon grid, cassette tape, night driving, rainy window, arcade',
  },
  {
    id: 'night-drive', name: 'Night Drive',
    styles: ['phonk', 'drift phonk', 'drill', 'UK drill', 'synthwave', 'trap music'],
    subGenres: ['Trap', 'Synthwave / Vaporwave'], genres: [],
    themes: ['cars', 'nightlife', 'city'], moods: ['confident', 'angry', 'thoughtful'],
    hunt: 'Car interior at night, highway lights, tunnel, rain on windscreen, city from the road, headlights',
  },
  {
    id: 'intimate-velvet', name: 'Intimate & Velvet',
    styles: ['contemporary R&B', 'alternative R&B', 'bachata', 'salsa', 'soul', 'pop soul'],
    subGenres: ['Traditional Latin (Salsa, Bachata)', 'Smooth Jazz / Soul'], genres: [],
    themes: ['romance', 'seduction'], moods: ['love', 'flirty'],
    hunt: 'Candlelight, silk sheets, couple dancing, dim lounge, city skyline at night',
  },
  {
    id: 'rain-blue', name: 'Rain & Blue Hour',
    styles: ['contemporary R&B', 'alternative R&B', 'lo-fi music', 'late night lo-fi', 'emo rap'],
    subGenres: [], genres: [],
    themes: ['heartbreak'], moods: ['sad', 'thoughtful'],
    hunt: 'Rain on glass, empty street, someone alone, grey sky, blue hour, wet pavement',
  },
  {
    id: 'live-raw', name: 'Live & Raw',
    styles: [],
    subGenres: ['Alternative / Indie Rock', 'Psychedelic Rock', 'General Rock', 'Heavy Metal / Hard Rock', 'Extreme Metal (Thrasher, Death)', 'General Metal', 'Pop-Punk', 'Hardcore Punk', 'General Punk'],
    genres: ['Rock', 'Metal', 'Punk'],
    themes: ['freedom', 'friends'], moods: ['angry', 'confident'],
    hunt: 'Electric guitar, leather jacket, stage fire, skatepark, live band, mosh pit',
  },
  {
    id: 'heartland-dust', name: 'Heartland & Dust',
    styles: [],
    subGenres: ['Americana / Folk', 'Modern Country', 'General Country & Folk'], genres: ['Country & Folk'],
    themes: ['nature', 'freedom'], moods: ['thoughtful', 'happy', 'sad'],
    hunt: 'Pickup truck, dirt road, cowboy boots, open field, barn, campfire',
  },
  {
    id: 'pop-studio', name: 'Pop & Studio',
    styles: ['pop music', 'hyperpop', 'K-pop', 'dance-pop'],
    subGenres: ['Dance-Pop', 'K-Pop / J-Pop', 'General Pop', 'Indie Pop'], genres: ['Pop'],
    themes: ['fame', 'party', 'dancing'], moods: ['fun', 'happy', 'confident', 'flirty'],
    hunt: 'Confetti, colourful studio backdrop, synchronised dancers, fashion editorial, glitter',
  },
  {
    id: 'sanctuary-soul', name: 'Sanctuary & Soul',
    styles: ['soul', 'church music'],
    subGenres: ['Gospel', 'Worship / Contemporary Christian', 'Christian Hip-Hop', 'General Gospel & Christian', 'General Jazz & Blues', 'Smooth Jazz / Soul'],
    genres: ['Gospel & Christian', 'Jazz, Soul & Blues'],
    themes: ['faith'], moods: ['spiritual'],
    hunt: 'Choir singing, church stained glass, raised hands, saxophone, grand piano',
  },
  {
    id: 'still-open', name: 'Still & Open',
    styles: ['ambient music', 'chill-out music'],
    subGenres: ['Ambient / Downtempo', 'Neoclassical', 'Dark Academia / Gothic Classical', 'General Classical'], genres: ['Classical & Cinematic'],
    themes: ['nature'], moods: ['thoughtful', 'spiritual'],
    hunt: 'Fog, mountains, slow time-lapse, the sea from above, empty landscape, soft light',
  },
];

export const BOARD_IDS = BOARDS.map(board => board.id);
/** A board is used once it has this many ready pictures: enough for one reel. Until then the library is chosen from as before. */
export const BOARD_MIN = 8;
/** A song's shelf is dealt from its best boards, so a wrong first choice never fills it. */
const SPREAD = 3;
/** Every this many Refreshes of a row, its boards move one along: refreshing again and again says "not this vibe". */
const REFRESHES_PER_STEP = 3;

/** What the brain knows of a song that the boards care about. */
export type BoardWanted = { genre: string; subGenre: string; style?: string; attitude: string | null; moods?: readonly string[]; themes?: readonly SongTheme[] };

/** More than a sub-genre and genre together: a style named on a board beats another board that only shares its sub-genre. */
const STYLE = 4;
const SUB_GENRE = 2;
const GENRE = 1;
const THEME = 1;
const MOOD = 1;
const OTHER_MOOD = 0.5;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const KEYED = new Map(BOARDS.map(board => [board.id, new Set(board.styles.map(styleKey))]));

/** How well a board fits the song: its style counts most, then where the song sits, then what the words are about and feel. */
export function boardFit(board: Board, wanted: BoardWanted): number {
  let fit = 0;
  if (wanted.style && KEYED.get(board.id)?.has(styleKey(wanted.style))) fit += STYLE;
  if (wanted.subGenre && board.subGenres.some(sub => same(sub, wanted.subGenre) || same(sub, familyOf(wanted.subGenre)))) fit += SUB_GENRE;
  if (wanted.genre && board.genres.some(genre => same(genre, wanted.genre))) fit += GENRE;
  for (const theme of wanted.themes ?? []) if (board.themes.includes(theme)) fit += THEME;
  const main = attitudeOf(wanted.attitude);
  if (main && board.moods.includes(main)) fit += MOOD;
  for (const other of wanted.moods ?? []) {
    const mood = attitudeOf(other);
    if (mood && mood !== main && board.moods.includes(mood)) fit += OTHER_MOOD;
  }
  return fit;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The boards that have enough ready pictures to be used, by id: how many each has. */
export function filledBoards(items: readonly { boards?: readonly string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) for (const id of item.boards ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Map([...counts].filter(([, count]) => count >= BOARD_MIN));
}

/** The filled boards, best fit for the song first (a song the boards know nothing of still gets them, in its own order). */
export function rankBoards(wanted: BoardWanted, filled: ReadonlyMap<string, number>, song: string): Board[] {
  return BOARDS.filter(board => filled.has(board.id))
    .map(board => ({ board, fit: boardFit(board, wanted) }))
    .sort((a, b) => b.fit - a.fit || hash(`${song}:${a.board.id}`) - hash(`${song}:${b.board.id}`))
    .map(entry => entry.board);
}

/**
 * The board one row of the shelf is dealt from, or null while no board is filled. Each row takes one board, so its reels hold
 * together; the rows share the song's best boards, the best getting about half of them. A row's Refreshes walk its own deals
 * first, and every `REFRESHES_PER_STEP` its boards move one along the ranking.
 */
export function boardForRow(row: string, wanted: BoardWanted, items: readonly { boards?: readonly string[] }[], song: string, generation: number): Board | null {
  const ranked = rankBoards(wanted, filledBoards(items), song);
  if (!ranked.length) return null;
  const step = Math.floor(generation / REFRESHES_PER_STEP);
  const spread = Math.min(SPREAD, ranked.length);
  const share = hash(`${song}:${row}`) % 10;
  const place = spread === 1 ? 0 : share < 5 ? 0 : spread === 2 || share < 8 ? 1 : 2;
  return ranked[(step + place) % ranked.length];
}
