export type GenreGroup = { name: string; subGenres: readonly string[] };

/** What the creator says the song is: a genre, then the sub-genre inside it. Both go to the brain, so each group ends with a "General" entry for a song that sits across it. */
export const GENRES: readonly GenreGroup[] = [
  { name: 'Electronic & Dance (EDM)', subGenres: ['House', 'Slap House', 'Afro House', 'Tech House', 'Deep House', 'G-House', 'Techno', 'Synthwave / Vaporwave', 'Dubstep / Riddim', 'Ambient / Downtempo', 'General Electronic'] },
  { name: 'Hip-Hop & Rap', subGenres: ['Trap', 'Boom Bap / Lo-Fi', 'Psychedelic Rap', 'General Hip-Hop'] },
  { name: 'Latin & Urbano', subGenres: ['Reggaeton', 'Latin Trap', 'Traditional Latin (Salsa, Bachata)', 'General Latin'] },
  { name: 'Rock', subGenres: ['Alternative / Indie Rock', 'Psychedelic Rock', 'General Rock'] },
  { name: 'Metal', subGenres: ['Heavy Metal / Hard Rock', 'Extreme Metal (Thrasher, Death)', 'General Metal'] },
  { name: 'Punk', subGenres: ['Pop-Punk', 'Hardcore Punk', 'General Punk'] },
  { name: 'Pop', subGenres: ['Dance-Pop', 'Indie Pop', 'K-Pop / J-Pop', 'General Pop'] },
  { name: 'Jazz, Soul & Blues', subGenres: ['Smooth Jazz / Soul', 'Electro-Swing', 'General Jazz & Blues'] },
  { name: 'Classical & Cinematic', subGenres: ['Neoclassical', 'Dark Academia / Gothic Classical', 'General Classical'] },
  { name: 'Country & Folk', subGenres: ['Americana / Folk', 'Modern Country', 'General Country & Folk'] },
  { name: 'Reggae & Dancehall', subGenres: ['Roots Reggae', 'Dancehall / Afrobeats', 'General Reggae'] },
  { name: 'Experimental & Avant-Garde', subGenres: ['Glitch Hop / IDM', 'Industrial', 'General Experimental'] },
  { name: 'Gospel & Christian', subGenres: ['Gospel', 'Worship / Contemporary Christian', 'Christian Hip-Hop', 'General Gospel & Christian'] },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The group a typed or kept genre names, or undefined. */
export const findGenre = (value: string) => GENRES.find(group => same(group.name, value));

/** The sub-genre inside `group` that a typed or kept value names, or undefined. */
export const findSubGenre = (group: GenreGroup | undefined, value: string) => group?.subGenres.find(item => same(item, value));

/** House styles belong to House: a library item kept for House fits every one of them. */
const FAMILY: Readonly<Record<string, string>> = {
  'slap house': 'House', 'afro house': 'House', 'tech house': 'House', 'deep house': 'House', 'g-house': 'House',
};

/** The sub-genre a style belongs to ("Slap House" is House), or the sub-genre itself. */
export const familyOf = (subGenre: string) => FAMILY[subGenre.trim().toLowerCase()] ?? subGenre;

/** How a typed style is compared: case, accents, spaces, hyphens and "&"/"and"/"'n'" do not matter ("Afro beat", "afrobeat", "AFRO-BEAT"). */
export const styleKey = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&|\band\b|'n'/g, 'n').replace(/[^a-z0-9]+/g, '');

export const toOptions = (items: readonly string[]) => items.map(item => ({ value: item, label: item }));
