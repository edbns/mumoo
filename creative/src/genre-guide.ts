import { familyOf, findGenre, findSubGenre, styleKey } from './genres';

/**
 * What the genre guidance says a genre looks like, as far as the brain can use it. Written from the guidance the owner
 * gave on 10 Nov 2026 and checked against the web (BPM charts from Ableton, Sonic Secrets, MusicVivo, Detect BPM,
 * GenreMatch; synthwave and vaporwave from the Aesthetics Wiki, PremiumBeat, Producer Hive).
 *
 * USED: the themes. They are tags from one short shared vocabulary (`THEME_TAGS`), so an item the admin tagged with one
 * of a genre's themes is preferred for songs of that genre (see `libraryFit`). The admin page suggests them too.
 * USED: the colours (`coloursFor`). Each library picture's colours are measured (`netlify/lib/colours.mjs`), and a picture that shows
 * what the song wants is a little preferred when it also carries the genre's colours (`colourFit` in `library-pick.ts`).
 *
 * NOT USED, and why:
 *   Tempo   the music analysis already measures the song's tempo; the genre never needs to guess it. Two figures in the
 *           guidance were wrong anyway: reggaeton is 88–100 BPM, not 100–115, and dubstep keeps one steady tempo (about
 *           140, felt as 70) — its "violent speed changes" are drops in energy, not changes in tempo. Techno is 125–140,
 *           with harder styles at 140–150. Experimental has no tempo to speak of.
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

/**
 * The colours a genre calls for, from the owner's guidance (10 Nov 2026), as swatches a picture's palette is matched against, and how
 * light, how vivid and how contrasty its pictures are. Effects in the guidance that are not colours (thermal vision, inverted colours,
 * vintage Polaroid filters) are left to the templates; what they look like is kept as colours where it has one.
 */
export type GenreColours = {
  swatches: readonly string[];
  /** 0 black … 1 white. */
  light: number;
  /** 0 grey … 1 fully saturated. */
  vivid: number;
  /** 0 flat … 1 stark light/dark split; left out when the guidance does not say. */
  contrast?: number;
};

const colours = (swatches: readonly string[], light: number, vivid: number, contrast?: number): GenreColours =>
  ({ swatches, light, vivid, ...(contrast !== undefined ? { contrast } : {}) });

/** Deep blues, warm ambers, neon purples, club lighting gradients. House styles share it (`familyOf`). */
const house = colours(['#1a237e', '#ffb300', '#9c27ff', '#3949ab'], 0.3, 0.7);
/** Pitch black, crimson blood red, charcoal gray, high-contrast monochrome. */
const metalColours = colours(['#050505', '#9b0000', '#36454f', '#e8e8e8'], 0.15, 0.35, 0.85);
/** High-contrast neon green/yellow overlaid on black, photocopy gray, primary color block accents. */
const punkColours = colours(['#39ff14', '#f5ff00', '#0a0a0a', '#9e9e9e', '#e53935'], 0.4, 0.6, 0.85);

const COLOURS_BY_SUB_GENRE: Readonly<Record<string, GenreColours>> = {
  'House': house,
  // Monochromatic (black & white), harsh red accents, strobe white, industrial steel gray.
  'Techno': colours(['#0a0a0a', '#f2f2f2', '#d50000', '#6e7681'], 0.25, 0.2, 0.8),
  // Hot pink, neon cyan, deep violet, sunset orange.
  'Synthwave / Vaporwave': colours(['#ff2d95', '#00f0ff', '#4a0e8f', '#ff7b29'], 0.4, 0.85),
  // Acid green, toxic purple, harsh high-contrast metallics.
  'Dubstep / Riddim': colours(['#9dff00', '#8a00d4', '#a8b0b8', '#0b0b0b'], 0.3, 0.7, 0.8),
  // Soft pastel gradients, muted earthy tones, cosmic deep-space nebula colors.
  'Ambient / Downtempo': colours(['#c9b8e8', '#b8d8e8', '#a69580', '#2b1d52'], 0.55, 0.35),
  // Vibrant digital spectrums, neon purples, and electronic cyans.
  'General Electronic': colours(['#a020f0', '#00e5ff', '#2962ff', '#ff00c8'], 0.35, 0.85),
  // High-contrast dark tones, dollar green, gold accents, deep violet.
  'Trap': colours(['#121212', '#3c8d40', '#d4af37', '#3d1466'], 0.2, 0.45, 0.7),
  // Warm sepia, vintage film tones, muted nostalgic secondary colors.
  'Boom Bap / Lo-Fi': colours(['#a67b5b', '#c8a27a', '#5f8a8b', '#b59a48'], 0.45, 0.3),
  // Acid-trip rainbows (inverted colours and thermal looks are the templates' to give).
  'Psychedelic Rap': colours(['#ff0080', '#ffea00', '#00e5ff', '#7cff00', '#b000ff'], 0.5, 0.95),
  // Moody urban tones, dark grays, brick reds, and gold accents.
  'General Hip-Hop': colours(['#2b2b2b', '#8e3b2f', '#c9a227', '#4a5560'], 0.3, 0.35),
  // Sun-drenched gold, tropical orange, vibrant turquoise, hot magenta.
  'Reggaeton': colours(['#ffc107', '#ff7a00', '#00c9b7', '#ff1f8e'], 0.55, 0.85),
  // Dark moody blues mixed with aggressive neon pinks and greens.
  'Latin Trap': colours(['#0d2b52', '#ff2d95', '#39ff14'], 0.25, 0.7),
  // Vibrant tropical tones, warm amber, bright orange, and deep brass gold.
  'Traditional Latin (Salsa, Bachata)': colours(['#00a86b', '#ffb000', '#ff7f11', '#b5893b'], 0.5, 0.75),
  // Warm, sun-drenched palettes, terracotta, bright yellows, and deep festive reds.
  'General Latin': colours(['#c8553d', '#ffd23f', '#c1121f', '#f28c28'], 0.55, 0.75),
  // Earthy tones, desaturated forest greens, washed-out denim blues, vintage Polaroid filters (as their creamy whites).
  'Alternative / Indie Rock': colours(['#8b6f4e', '#4f6b4a', '#6f8fae', '#e8dcc0'], 0.5, 0.3),
  // 60s/70s liquid light show spectrums, melting tie-dye, highly saturated kaleidoscopic colors.
  'Psychedelic Rock': colours(['#ff3d7f', '#ffb400', '#3dff8b', '#3d7bff', '#b13dff'], 0.5, 0.95),
  // Classic high-contrast concert lighting (deep blues, stage reds, and stage smoke grays).
  'General Rock': colours(['#0d2a6b', '#c62828', '#8a8a8a', '#0b0b0b'], 0.3, 0.5, 0.75),
  'Heavy Metal / Hard Rock': metalColours,
  'Extreme Metal (Thrasher, Death)': metalColours,
  // Dark monochromatic charcoal, industrial grays, and harsh white spotlights.
  'General Metal': colours(['#2f2f2f', '#6b6b6b', '#f5f5f5'], 0.3, 0.08, 0.8),
  'Pop-Punk': punkColours,
  'Hardcore Punk': punkColours,
  // Raw black and white, photocopy grays, and single-color neon accents (like hot pink or toxic yellow).
  'General Punk': colours(['#0a0a0a', '#f0f0f0', '#9a9a9a', '#ff2d95', '#e8ff00'], 0.45, 0.35, 0.85),
  // Ultra-saturated colors, clean studio lighting, pastel pinks/blues.
  'Dance-Pop': colours(['#ff4fa3', '#ffc1e3', '#a7d8ff', '#2979ff'], 0.65, 0.75),
  // Soft pastel palettes, muted cream, sage green, and soft lavender.
  'Indie Pop': colours(['#f3ead3', '#a3b18a', '#c8b6e2', '#f4c2c2'], 0.72, 0.25),
  // Hyper-bright neons, magical girl pastels, iridescent chrome.
  'K-Pop / J-Pop': colours(['#ff00e6', '#00ffd5', '#ffd1f7', '#c4b5ff', '#d9e4ec'], 0.65, 0.75),
  // Bright, clean primary colors, highly polished studio lighting, and glossy finishes.
  'General Pop': colours(['#e53935', '#1e88e5', '#fdd835', '#fafafa'], 0.65, 0.7),
};

/** The groups the guidance describes as a whole: every sub-genre of them takes these. */
const COLOURS_BY_GENRE: Readonly<Record<string, GenreColours>> = {
  // Smoke-machine gray, deep velvet blue, dim amber, brass gold.
  'Jazz, Soul & Blues': colours(['#7a7a80', '#1b2a59', '#b9771e', '#b5893b'], 0.3, 0.4),
  // Deep burgundy, royal navy, gold leaf, marble white.
  'Classical & Cinematic': colours(['#6d0f1f', '#102a5c', '#c9a227', '#eeeae2'], 0.4, 0.45),
  // Golden hour orange, wood grains, wheat yellow, forest greens.
  'Country & Folk': colours(['#f39c33', '#8b5a2b', '#f5deb3', '#2e5e3a'], 0.5, 0.5),
  // Green, gold, red (Roots); ultra-bright Caribbean neons (Dancehall).
  'Reggae & Dancehall': colours(['#009b3a', '#fed100', '#e4002b', '#00e5ff', '#ff3fa4'], 0.5, 0.85),
  // Distorted color spaces, chaotic spectrum cycles (thermal vision is the templates' to give).
  'Experimental & Avant-Garde': colours(['#ff0000', '#00ff66', '#0066ff', '#ffcc00', '#ff00ff'], 0.45, 0.85),
};

/**
 * The colours a song's genre calls for: its sub-genre's own (a house style takes House's), else its group's, else its group's "General"
 * entry. Null for a genre the guidance gives no colours (Gospel & Christian) or one the app does not know.
 */
export function coloursFor(genre: string, subGenre: string): GenreColours | null {
  const group = findGenre(genre);
  if (!group) return null;
  const sub = findSubGenre(group, subGenre);
  return (sub && (COLOURS_BY_SUB_GENRE[sub] ?? COLOURS_BY_SUB_GENRE[familyOf(sub)]))
    || COLOURS_BY_GENRE[group.name]
    || COLOURS_BY_SUB_GENRE[group.subGenres.find(name => name.startsWith('General')) ?? '']
    || null;
}
