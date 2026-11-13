import { findGenre, findSubGenre, styleKey } from './genres';

/**
 * What the genre guidance says a genre looks like, as far as the brain can use it. Written from the guidance the owner
 * gave on 10 Nov 2026 and checked against the web (BPM charts from Ableton, Sonic Secrets, MusicVivo, Detect BPM,
 * GenreMatch; synthwave and vaporwave from the Aesthetics Wiki, PremiumBeat, Producer Hive).
 *
 * USED: the themes. They are tags from one short shared vocabulary (`THEME_TAGS`), so an item the admin tagged with one
 * of a genre's themes is preferred for songs of that genre (see `libraryFit`). The admin page suggests them too.
 *
 * NOT USED, and why:
 *   Tempo   the music analysis already measures the song's tempo; the genre never needs to guess it. Two figures in the
 *           guidance were wrong anyway: reggaeton is 88–100 BPM, not 100–115, and dubstep keeps one steady tempo (about
 *           140, felt as 70) — its "violent speed changes" are drops in energy, not changes in tempo. Techno is 125–140,
 *           with harder styles at 140–150. Experimental has no tempo to speak of.
 *   Colors  need each photo's colours measured first; a library photo's palette is not read yet.
 *   Motion  describes what a video editor does (data-moshing, drone sweeps, 3D asset rotations). A library item is a
 *           picture or a short clip; the renderer's own motion belongs to the templates, not to the library.
 *
 * Rejected from the second round: "graphic design typography" (Hip-Hop) and "kinetic typography" (Pop). Words in the
 * picture would fight the lyrics the template draws over it. The tempo ranges there (General Rock 110–130, General Pop
 * 110–125) are narrower than the 100–140 and 100–130 the sources give; salsa is 90–110 in some and 150–250 in others
 * (counted in half or full time), and bachata 120–140. None is used, for the reason above. Every genre of the app now has themes.
 *
 * Synthwave and vaporwave are two genres (sincere neon, sports cars, sunsets
 * against slowed pastel, statues, glitch), but the app's sub-genre is one, so its themes are the first's, which also
 * suit the second.
 */
export const THEME_TAGS = [
  'club', 'nightlife', 'abstract', 'geometric', 'architecture', 'city', 'neon', 'retro', 'cars', 'beach', 'tropical',
  'sunset', 'space', 'underwater', 'rain', 'smoke', 'fire', 'nature', 'mountains', 'road', 'street', 'crowd', 'fashion',
  'luxury', 'robots', 'dark', 'glitch', 'surreal', 'futuristic', 'fantasy', 'cozy', 'collage', 'instruments',
  'studio', 'stage', 'industrial',
] as const;

const metal = ['architecture', 'fire', 'dark', 'smoke'];
const punk = ['collage', 'street', 'crowd'];

/**
 * By sub-genre (the names in `GENRES`). A look is a tag of `THEME_TAGS`, or a song theme (`SONG_THEMES`: seduction, dancing,
 * money...) when a style is known by what its videos show: slap house by night drives, luxury and the girls in them.
 */
const BY_SUB_GENRE: Record<string, readonly string[]> = {
  'House': ['club', 'nightlife', 'abstract', 'geometric'],
  'Slap House': ['cars', 'luxury', 'nightlife', 'seduction', 'club'],
  'Afro House': ['sunset', 'tropical', 'dancing', 'crowd', 'nature'],
  'Tech House': ['club', 'crowd', 'dancing', 'dark', 'neon'],
  'Deep House': ['sunset', 'beach', 'city', 'nightlife', 'smoke'],
  'G-House': ['dark', 'luxury', 'street', 'cars', 'club'],
  'Techno': ['club', 'architecture', 'dark', 'futuristic'],
  'Synthwave / Vaporwave': ['retro', 'neon', 'cars', 'city', 'sunset'],
  'Dubstep / Riddim': ['robots', 'dark', 'glitch', 'abstract'],
  'Ambient / Downtempo': ['space', 'underwater', 'smoke', 'abstract'],
  'Trap': ['street', 'cars', 'luxury', 'city', 'dark'],
  'Boom Bap / Lo-Fi': ['rain', 'cozy', 'retro', 'city'],
  'Psychedelic Rap': ['surreal', 'space', 'abstract'],
  'Reggaeton': ['beach', 'tropical', 'crowd', 'club', 'neon'],
  'Latin Trap': ['city', 'nightlife', 'fashion', 'street', 'neon'],
  'Alternative / Indie Rock': ['road', 'crowd', 'collage', 'nature', 'retro'],
  // The "General" entries are the fallbacks for a song that fits no niche of its genre; three niches the first guidance left out.
  'General Electronic': ['abstract', 'geometric', 'neon', 'futuristic'],
  'General Hip-Hop': ['city', 'street', 'studio'],
  'General Latin': ['instruments', 'street', 'crowd'],
  'Traditional Latin (Salsa, Bachata)': ['instruments', 'club', 'nightlife', 'retro'],
  'General Rock': ['stage', 'instruments', 'crowd', 'smoke'],
  'Psychedelic Rock': ['space', 'surreal', 'abstract', 'nature'],
  'General Metal': ['industrial', 'dark', 'abstract'],
  'General Punk': punk,
  'General Pop': ['studio', 'geometric', 'abstract'],
  'Indie Pop': ['retro', 'collage', 'nature', 'cozy'],
  'Heavy Metal / Hard Rock': metal,
  'Extreme Metal (Thrasher, Death)': metal,
  'Pop-Punk': punk,
  'Hardcore Punk': punk,
  'Dance-Pop': ['fashion', 'geometric', 'abstract'],
  'K-Pop / J-Pop': ['futuristic', 'fantasy', 'city', 'luxury', 'surreal'],
  'Gospel': ['faith', 'stage', 'crowd', 'sunset'],
  'Worship / Contemporary Christian': ['faith', 'crowd', 'nature', 'sunset', 'mountains'],
  'Christian Hip-Hop': ['faith', 'street', 'city', 'studio'],
  'General Gospel & Christian': ['faith', 'nature', 'sunset', 'stage'],
};

/** By genre, for the groups the guidance describes as a whole. */
const BY_GENRE: Record<string, readonly string[]> = {
  'Jazz, Soul & Blues': ['rain', 'city', 'smoke', 'club', 'instruments'],
  'Classical & Cinematic': ['mountains', 'nature', 'architecture'],
  'Country & Folk': ['nature', 'sunset', 'cars', 'instruments', 'road'],
  'Reggae & Dancehall': ['tropical', 'nature', 'street', 'crowd'],
  'Experimental & Avant-Garde': ['glitch', 'abstract', 'architecture', 'surreal'],
};

const afrobeats = ['dancers', 'colorful outfits', 'street party', 'beach', 'palm trees'];
const rnb = ['candlelight', 'bedroom', 'couple', 'city night', 'silk'];

/**
 * By style, as the creator picked it in the song step (`style-search.ts`): what its videos are known for, preferred on top
 * of its sub-genre's themes. Free words, matched against the admin's tags; a style left out has only its sub-genre's.
 * Written for the tags the admin will add, not only those there now. A look that is a song theme ("romance", "money")
 * counts every tag that pictures it (couple, kiss, romantic...). Keyed by the style's own name in `styles.json`
 * ("trap music", not "Trap"), so every name it is found by gets them. Given by the owner on 13 Nov 2026.
 */
export const BY_STYLE: Readonly<Record<string, readonly string[]>> = {
  'Afrobeats': afrobeats,
  'Afrobeat': afrobeats,
  'Amapiano': ['township streets', 'dancers', 'sunglasses', 'bucket hats', 'cars'],
  'Afro house': ['twerking', 'african dance', 'africa', 'sunset', 'bonfire'],
  'gqom': ['dark club', 'strobe lights', 'street dance', 'hoodies', 'crowd'],
  'dancehall': ['street party', 'dancing crowd', 'palm trees', 'gold chains', 'nightlife'],
  'reggae': ['beach', 'palm trees', 'dreadlocks', 'sunset', 'bonfire'],
  'reggaeton': ['sports cars', 'neon lights', 'club', 'dancers', 'beach'],
  'Brazilian funk': ['favela', 'street party', 'dancers', 'motorcycles', 'sunglasses'],
  'Latin trap': ['luxury cars', 'gold chains', 'neon lights', 'mansion', 'money'],
  'salsa': ['couple dancing', 'nightclub', 'dresses', 'suits', 'city night'],
  'bachata': ['couple dancing', 'beach', 'sunset', 'romance', 'evening wear'],
  'trap music': ['luxury cars', 'gold chains', 'money', 'smoke', 'hoodies'],
  'drill': ['hoodies', 'ski masks', 'city street', 'night', 'sports cars'],
  'UK drill': ['London street', 'hoodies', 'puffer jackets', 'night', 'subway'],
  'phonk': ['drifting cars', 'night street', 'neon lights', 'smoke', 'retro car'],
  'hip-hop': ['luxury cars', 'gold chains', 'street', 'sneakers', 'crowd'],
  'boom bap': ['brick wall', 'graffiti', 'hoodies', 'headphones', 'city street'],
  'lo-fi music': ['bedroom', 'desk', 'rain', 'window', 'headphones'],
  'rhythm and blues': rnb,
  'contemporary R&B': rnb,
  'British rhythm and blues': rnb,
  'pop music': ['bright colors', 'dancers', 'stage lights', 'confetti', 'fashion'],
  'K-pop': ['synchronized dance', 'neon lights', 'colorful outfits', 'stage', 'futuristic'],
  'slap house': ['sports cars', 'nightlife', 'pool party', 'sunglasses', 'neon lights'],
  'tech house': ['DJ booth', 'club crowd', 'laser lights', 'sunglasses', 'dancing'],
  'deep house': ['sunset', 'beach club', 'ocean', 'rooftop', 'silhouettes'],
  'techno': ['dark warehouse', 'strobe lights', 'black clothes', 'laser lights', 'crowd'],
  'drum and bass': ['rave crowd', 'laser lights', 'smoke', 'street', 'night'],
  'dubstep': ['festival stage', 'laser lights', 'smoke', 'crowd', 'neon'],
  'synthwave': ['neon grid', 'retro car', 'sunset', 'palm trees', 'city night'],
  'rock music': ['electric guitar', 'stage', 'leather jacket', 'crowd', 'smoke'],
  'metal music': ['electric guitar', 'black clothes', 'stage fire', 'long hair', 'crowd'],
  'punk music': ['leather jacket', 'skatepark', 'graffiti', 'crowd', 'boots'],
  'country music': ['pickup truck', 'dirt road', 'cowboy hat', 'boots', 'barn'],
  'jazz': ['saxophone', 'suit', 'dim lights', 'piano', 'lounge'],
  'gospel music': ['choir', 'church', 'clapping hands', 'suits', 'dresses'],
  'contemporary worship music': ['stage lights', 'raised hands', 'crowd', 'church', 'acoustic guitar'],
};
const BY_STYLE_KEY = new Map(Object.entries(BY_STYLE).map(([style, looks]) => [styleKey(style), looks]));

/** The looks a style (its own name in `styles.json`) is known for (`BY_STYLE`), none for a style without its own. */
export function styleLooksFor(style: string | undefined): readonly string[] {
  return (style && BY_STYLE_KEY.get(styleKey(style))) || [];
}

/** The themes of a song's genre and sub-genre (as typed or kept, in any case): the sub-genre's own, else its genre's, else none. */
export function themesFor(genre: string, subGenre: string): readonly string[] {
  const group = findGenre(genre);
  const sub = findSubGenre(group, subGenre);
  return (sub && BY_SUB_GENRE[sub]) || (group && BY_GENRE[group.name]) || [];
}
