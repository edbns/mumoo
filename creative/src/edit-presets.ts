/**
 * Edit presets: how a music video is cut and finished in the styles that are trending now (the owner's brief of 16 Nov 2026).
 * A preset is not a template. It is laid over the Directed reel and over every treatment made from it, and it decides:
 *   rhythm      how long a cut holds and what it lands on (beats, the snare, hi-hats, bars, the drop),
 *   transition  how one picture gives way to the next (a hard cut, a dissolve, a whip-pan, a zoom-out),
 *   motion      how the camera moves (handheld drift, a slow push, a punch-in on the kick, shake on the bass),
 *   look        the colour and texture (film, tape, club light, early digicam, glow, gritty black and white).
 * The song's genre picks the preset (`presetsFor`), never a fast one on a slow song; each card of a row plays one of the preset's takes (its named
 * options), on its own edit. How fast it really cuts follows the song's drive (pack-director.ts).
 * This file is only the list, the fit and the deal; pack-director.ts cuts to the rhythm and pack-preset.ts draws the rest.
 */
export const PRESET_IDS = ['kodak', 'vhs', 'strobe', 'y2k', 'dreamy', 'mono', 'golden', 'baile', 'afterhours', 'super8'] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export const isPresetId = (value: unknown): value is PresetId => PRESET_IDS.includes(value as PresetId);

/**
 * How a preset cuts. A cut holds `every` of `on` (a count, or a range: the low end where the music is hard, the high end where it is soft),
 * kept near `minMs`..`maxMs` after the last cut; with no count, or a count that lands far outside, it lands on one of `on` nearest what the
 * music asks for in that window, else on a beat. `fast` is the way of cutting the hard parts: after the drop (`fastAfterDrop`) or
 * wherever the music is loud. A drop always takes the cut nearest it.
 */
type Cutting = { on: 'beats' | 'snares' | 'hits' | 'bars'; every?: number | readonly [hard: number, soft: number]; minMs: number; maxMs: number };
export type PresetRhythm = Cutting & {
  fast?: Cutting;
  fastAfterDrop?: boolean;
  /** A velocity edit: each clip snaps in fast on the hit, then plays at speed (`clipMsAt`). */
  ramp?: boolean;
};

export type PresetTransition = 'cut' | 'dissolve' | 'whip' | 'zoom';

export type PresetDef = {
  id: PresetId;
  title: string;
  /** Matched against the song's genre, sub-genre and style (`presetFit`): a style says more than a sub-genre, a sub-genre more than a genre. */
  genres: readonly RegExp[];
  rhythm: PresetRhythm;
  /** Its named options, spread across the four cards of a row. */
  takes: readonly string[];
  /** Cut hard and fast: never dealt on a song whose drive (`MusicIntentV1.drive`) is below `SLOW_DRIVE`, however its genre reads. */
  fast?: true;
};

export const PRESETS: readonly PresetDef[] = [
  {
    id: 'kodak',
    title: 'Raw 16mm',
    genres: [
      /\bindie\b/, /hip[- ]?hop/, /\brap\b/, /r ?& ?b|\brnb\b|rhythm and blues/, /country/, /\bfolk\b|americana/, /\bsoul\b/, /neoclassical/,
      // Groovy house is warm and filmed, never strobed (deep and Afro house are Dreamy).
      /(?<!deep |afro )house/,
      /reggaeton|dembow|salsa|bachata|latin pop|traditional latin/,
    ],
    rhythm: { on: 'beats', every: [2, 4], minMs: 1000, maxMs: 2000 },
    // Warm daylight stock or tungsten cinema stock, with a handheld drift or a slow push in.
    takes: ['portra-drift', 'vision-push', 'portra-push', 'vision-drift'],
  },
  {
    id: 'vhs',
    title: '90s Camcorder',
    genres: [/phonk/, /lo-?fi/, /synthwave|vaporwave/, /boom ?bap/, /alt(ernative)?[- ]pop/, /pop[- ]?punk|skate punk|general punk|^punk$/],
    rhythm: { on: 'snares', every: 1, minMs: 800, maxMs: 1500 },
    takes: ['rec', 'clean'],
  },
  {
    id: 'strobe',
    title: 'Club Pulse',
    // Hard, fast electronic music only. Latin trap is Y2K Digicam.
    genres: [/techno/, /drum ?(and|&|n) ?bass|\bdnb\b/, /dubstep|riddim/, /(?<!latin )\btrap\b/, /\bedm\b/],
    rhythm: { on: 'beats', every: 2, minMs: 700, maxMs: 1400, fast: { on: 'beats', every: 1, minMs: 300, maxMs: 800 }, ramp: true },
    // Cool neon or crisp black and white; a white or a black flash on the drops.
    takes: ['neon-white', 'mono-black', 'neon-black', 'mono-white'],
    fast: true,
  },
  {
    id: 'y2k',
    title: 'Y2K Digicam',
    genres: [/\btrap\b/, /(?<!uk )drill/, /hyperpop/, /k-?pop|j-?pop/, /dancehall/, /brazilian funk|funk carioca|baile funk/,
      /reggaeton|dembow|salsa|bachata|latin pop|traditional latin/, /corridos/],
    rhythm: { on: 'hits', minMs: 500, maxMs: 1000, ramp: true },
    takes: ['whip', 'zoom'],
    fast: true,
  },
  {
    id: 'dreamy',
    title: 'Dreamy',
    genres: [/r ?& ?b|\brnb\b|rhythm and blues/, /afro ?house/, /deep house/, /ambient|downtempo/, /ballad/, /\bindie\b/, /\bfolk\b|americana/, /neoclassical/],
    rhythm: { on: 'bars', every: 1, minMs: 2000, maxMs: 3000 },
    takes: ['pastel', 'golden'],
  },
  {
    id: 'mono',
    title: 'Gritty Mono',
    genres: [/uk drill/, /metal/, /\brock\b/, /dark techno|industrial/, /conscious/, /hardcore/],
    rhythm: { on: 'bars', every: 1, minMs: 1600, maxMs: 2400, fast: { on: 'beats', every: 1, minMs: 300, maxMs: 650 }, fastAfterDrop: true },
    // The plain grit; punched in on the kicks with flashes on the drops; or ghosting under heavy grain.
    takes: ['grit', 'punch', 'ghost'],
  },
  {
    id: 'golden',
    title: 'Golden Hour',
    // A live session in warm light: gospel, worship, soul and jazz.
    genres: [/gospel|worship|christian|church/, /\bsoul\b/, /jazz/, /blues/],
    rhythm: { on: 'bars', every: 1, minMs: 1800, maxMs: 2800 },
    takes: ['amber', 'bloom', 'live'],
  },
  {
    id: 'baile',
    title: 'Baile Fisheye',
    genres: [/brazilian funk|funk carioca|baile funk|funk mtg|montagem|brega funk/, /amapiano/, /afrobeats?/, /dancehall/, /gqom/],
    rhythm: { on: 'hits', minMs: 450, maxMs: 900, ramp: true },
    // A wide fisheye bouncing on the kicks; saturated neon; whip-pans between the pictures.
    takes: ['fisheye', 'neon', 'whip'],
    fast: true,
  },
  {
    id: 'afterhours',
    title: 'Afterhours',
    genres: [/(?<!afro |slap )house/, /melodic (house|techno)/, /\bminimal\b/],
    rhythm: { on: 'beats', every: [2, 4], minMs: 900, maxMs: 1800 },
    // Club light, cyan or magenta, and light dragging behind the kicks.
    takes: ['cyan', 'magenta', 'drag'],
  },
  {
    id: 'super8',
    title: 'Super 8',
    genres: [/country/, /\bfolk\b|americana|bluegrass/, /acoustic|singer[- ]songwriter/],
    rhythm: { on: 'bars', every: 1, minMs: 1600, maxMs: 2600 },
    // Home movie in its rounded gate, dusty and warm, at a storyteller's pace.
    takes: ['porch', 'dust'],
  },
];

/** How each preset gives way from one picture to the next (pack-reel.ts dissolves; pack-preset.ts whips and zooms). */
export const TRANSITION: Record<PresetId, (take: string) => PresetTransition> = {
  kodak: () => 'cut',
  vhs: () => 'cut',
  strobe: () => 'cut',
  y2k: take => (take === 'zoom' ? 'zoom' : 'whip'),
  dreamy: () => 'dissolve',
  mono: () => 'cut',
  golden: () => 'dissolve',
  baile: take => (take === 'whip' ? 'whip' : 'cut'),
  afterhours: () => 'cut',
  super8: () => 'cut',
};
export const DISSOLVE_MS = 300;

const BY_ID = new Map(PRESETS.map(preset => [preset.id, preset]));
export const presetDef = (id: PresetId) => BY_ID.get(id)!;
export const presetTitle = (id: PresetId) => BY_ID.get(id)!.title;
export const isPresetTake = (id: PresetId, take: string) => BY_ID.get(id)?.takes.includes(take) ?? false;

/** What a song is called, as far as the presets read it. */
export type SongGenre = { genre: string; subGenre?: string; style?: string };

/** How well a preset fits the song: 3 for its style, 2 for its sub-genre, 1 for its genre, 0 for none. */
export function presetFit(preset: PresetDef, song: SongGenre): number {
  const named = (text: string | undefined) => Boolean(text) && preset.genres.some(pattern => pattern.test(text!.toLowerCase()));
  return named(song.style) ? 3 : named(song.subGenre) ? 2 : named(song.genre) ? 1 : 0;
}

/**
 * The presets that fit the song best, in the brief's order: only those named by its most specific word (an ambient song filed under
 * Electronic is Dreamy, not also Club Pulse because of its genre). A song none fits is cut as Raw 16mm, the most popular.
 */
export function presetsFor(song: SongGenre, drive?: number | null): PresetId[] {
  // A slow song (slowed and reverbed phonk, a funk ballad) is never cut like the club, whatever its genre says.
  const slow = typeof drive === 'number' && drive < SLOW_DRIVE;
  const fits = PRESETS.filter(preset => !(slow && preset.fast)).map(preset => ({ id: preset.id, fit: presetFit(preset, song) }));
  const best = Math.max(...fits.map(entry => entry.fit));
  return best > 0 ? fits.filter(entry => entry.fit === best).map(entry => entry.id) : ['kodak'];
}

/** Below this drive (tempo and how busy the drums are, 0..1) a song is slow: see `presetsFor` and the Director's cutting. */
export const SLOW_DRIVE = 0.4;

/** The preset of a row at its `generation`: the first that fits best, and each Refresh the next of them. */
export const presetAt = (song: SongGenre, generation: number, drive?: number | null): PresetId => {
  const fitting = presetsFor(song, drive);
  return fitting[Math.abs(generation) % fitting.length];
};

/** The take of card `index` of a row: the preset's options in turn, starting further along at each Refresh. */
export const takeAt = (preset: PresetId, generation: number, index: number): string => {
  const { takes } = presetDef(preset);
  return takes[(Math.abs(generation) + index) % takes.length];
};
