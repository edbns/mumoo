/**
 * Edit presets: how a music video is cut and finished in the styles that are trending now (the owner's brief of 16 Nov 2026).
 * A preset is not a template. It is laid over the Directed reel and over every treatment made from it, and it decides:
 *   rhythm      how long a cut holds and what it lands on (beats, the snare, hi-hats, bars, the drop),
 *   transition  how one picture gives way to the next (a hard cut, a dissolve, a whip-pan, a zoom-out),
 *   motion      how the camera moves (handheld drift, a slow push, a punch-in on the kick, shake on the bass),
 *   look        the colour and texture (film, tape, club light, early digicam, glow, gritty black and white).
 * The song's genre and its measured drive pick the preset (`presetsFor`), never a fast one on a slow song; each card of a row plays one of the preset's takes (its named
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
  /** A take that cuts its own way (a long-held acoustic take, a fast drop take); the others cut in `rhythm`. */
  takeRhythm?: Readonly<Record<string, PresetRhythm>>;
  /**
   * The drives (`MusicIntentV1.drive`, 0..1: tempo and how busy the drums are) it suits: the measured music picks among the presets a
   * genre names (`presetsFor`), so a slow funk is never cut like the club and a pounding gospel song is never held like a hymn.
   */
  drive: readonly [low: number, high: number];
  /** Cut hard and fast: never dealt on a song whose drive is below `SLOW_DRIVE`, however its genre reads. */
  fast?: true;
};

export const PRESETS: readonly PresetDef[] = [
  {
    id: 'kodak',
    title: 'Raw 16mm',
    genres: [
      /\bindie\b/, /hip[- ]?hop/, /\brap\b/, /r ?& ?b|\brnb\b|rhythm and blues/, /country/, /\bfolk\b|americana/, /\bsoul\b/, /neoclassical/, /gospel|worship|christian|church/, /jazz|blues/, /\brock\b/, /corridos/,
      // Groovy house is warm and filmed, never strobed (deep and Afro house are Dreamy, Velvet Halation or Boiler Room).
      /(?<!deep |afro )house/,
      /reggaeton|dembow|salsa|bachata|latin pop|traditional latin/,
    ],
    rhythm: { on: 'beats', every: [2, 4], minMs: 1000, maxMs: 2000 },
    // Warm daylight stock or tungsten cinema stock, with a handheld drift or a slow push in.
    takes: ['portra-drift', 'vision-push', 'portra-push', 'vision-drift'],
    drive: [0, 0.85],
  },
  {
    id: 'vhs',
    title: '90s Camcorder',
    genres: [/phonk/, /lo-?fi/, /synthwave|vaporwave/, /boom ?bap/, /alt(ernative)?[- ]pop/, /pop[- ]?punk|skate punk|general punk|^punk$/, /hip[- ]?hop/, /\brap\b/, /grunge|garage/, /metal|\brock\b|hardcore/, /uk drill/, /latin trap/, /jazz|blues/, /corridos/],
    rhythm: { on: 'snares', every: 1, minMs: 800, maxMs: 1500 },
    takes: ['rec', 'clean'],
    drive: [0.15, 0.9],
  },
  {
    id: 'strobe',
    title: 'Club Pulse',
    // Hard, fast music: electronic, trap and drill, baile funk, phonk, metal. Latin trap is Y2K Digicam.
    genres: [/techno/, /drum ?(and|&|n) ?bass|\bdnb\b/, /dubstep|riddim/, /(?<!latin )\btrap\b/, /\bedm\b/, /brazilian funk|funk carioca|baile funk|funk mtg|montagem/, /hardstyle|big room|electro/, /metal/, /drill/, /phonk/],
    rhythm: { on: 'beats', every: 2, minMs: 700, maxMs: 1400, fast: { on: 'beats', every: 1, minMs: 300, maxMs: 800 }, ramp: true },
    // Cool neon or crisp black and white; a white or a black flash on the drops.
    takes: ['neon-white', 'mono-black', 'neon-black', 'mono-white'],
    drive: [0.5, 1],
    fast: true,
  },
  {
    id: 'y2k',
    title: 'Y2K Digicam',
    genres: [/\btrap\b/, /(?<!uk )drill/, /hyperpop/, /k-?pop|j-?pop/, /dancehall/, /brazilian funk|funk carioca|baile funk/,
      /reggaeton|dembow|salsa|bachata|latin pop|traditional latin/, /corridos/, /hip[- ]?hop/, /\brap\b/, /^pop$|general pop|dance[- ]pop/, /\bedm\b/, /slap house/,
      /drum ?(and|&|n) ?bass|\bdnb\b/, /dubstep|riddim/, /pop[- ]?punk|skate punk|general punk|^punk$/],
    rhythm: { on: 'hits', minMs: 500, maxMs: 1000, ramp: true },
    takes: ['whip', 'zoom'],
    drive: [0.45, 1],
    fast: true,
  },
  {
    id: 'dreamy',
    title: 'Dreamy',
    genres: [/r ?& ?b|\brnb\b|rhythm and blues/, /afro ?house/, /deep house/, /ambient|downtempo/, /ballad/, /\bindie\b/, /\bfolk\b|americana/, /neoclassical/, /gospel|worship/, /k-?pop|j-?pop/],
    rhythm: { on: 'bars', every: 1, minMs: 2000, maxMs: 3000 },
    takes: ['pastel', 'golden'],
    drive: [0, 0.6],
  },
  {
    id: 'mono',
    title: 'Gritty Mono',
    // Rock, metal, UK drill and dark techno only: its slow build and long holds never suit funk or a four-to-the-floor club.
    genres: [/uk drill/, /metal/, /\brock\b/, /dark techno|industrial|warehouse/, /hardcore/, /grunge/],
    rhythm: { on: 'bars', every: 1, minMs: 1600, maxMs: 2400, fast: { on: 'beats', every: 1, minMs: 300, maxMs: 650 }, fastAfterDrop: true },
    // Baseline noir; the drill and metal drop (strobe flashes on the snare, micro punches, fast cuts); the dark warehouse (shutter
    // trails, charcoal grain, hypnotic slow zooms); and CCTV (a wide lens, scanlines, a camera's timestamp, a choppy frame rate).
    takes: ['grit', 'punch', 'ghost', 'cctv'],
    takeRhythm: {
      punch: { on: 'snares', every: 1, minMs: 500, maxMs: 1000, fast: { on: 'hits', minMs: 350, maxMs: 650 }, fastAfterDrop: true },
      ghost: { on: 'bars', every: 1, minMs: 2000, maxMs: 3000 },
      cctv: { on: 'bars', every: 1, minMs: 1600, maxMs: 2600 },
    },
    drive: [0.3, 0.95],
  },
  {
    id: 'golden',
    title: 'Velvet Halation',
    // A live studio session in warm 35mm light: gospel, worship, soul, jazz, R&B and the warm, slow side of dance.
    genres: [/gospel|worship|christian|church/, /\bsoul\b/, /jazz/, /blues/, /r ?& ?b|\brnb\b|rhythm and blues/, /ballad/, /afrobeats?/, /amapiano/, /ambient|downtempo/, /afro ?house/, /salsa|bachata|bolero/],
    rhythm: { on: 'bars', every: 1, minMs: 1800, maxMs: 2800 },
    // The intimate verse (amber, a slow push, dissolves); the live session (handheld breathing, cuts on the phrase); the chorus lift
    // (brighter gold, a flare, a speed ramp in on the downbeat); the bridge and outro (soft edges, lingering holds).
    takes: ['amber', 'live', 'bloom', 'haze'],
    takeRhythm: {
      live: { on: 'beats', every: [2, 4], minMs: 1200, maxMs: 2200 },
      bloom: { on: 'bars', every: 1, minMs: 1600, maxMs: 2600, ramp: true },
      haze: { on: 'bars', every: 1, minMs: 2400, maxMs: 3400 },
    },
    drive: [0, 0.7],
  },
  {
    id: 'baile',
    title: 'Baile Kinetic',
    genres: [/brazilian funk|funk carioca|baile funk|funk mtg|montagem|brega funk/, /amapiano/, /afrobeats?/, /dancehall/, /gqom/, /reggaeton|dembow|latin trap/, /\bk-?pop\b/],
    rhythm: { on: 'hits', minMs: 450, maxMs: 900, ramp: true },
    // Groove lock (saturated, bass micro-zooms, a whip-pan on the bar); fisheye hype (a heavy wide lens from low down, fast rhythmic
    // cuts); the drop (speed ramps, white and RGB flash frames on the snare); and the street cam (sharp phone video, shaking, jump-cuts).
    takes: ['whip', 'fisheye', 'neon', 'street'],
    takeRhythm: {
      fisheye: { on: 'beats', every: 2, minMs: 800, maxMs: 1200, ramp: true },
      street: { on: 'hits', minMs: 400, maxMs: 750 },
    },
    drive: [0.5, 1],
    fast: true,
  },
  {
    id: 'afterhours',
    title: 'Boiler Room',
    genres: [/(?<!afro |slap )house/, /techno/, /\bminimal\b/, /\bedm\b|general electronic/, /trance|progressive/, /synthwave/, /ambient|downtempo/, /afro ?house/],
    rhythm: { on: 'beats', every: [2, 4], minMs: 900, maxMs: 1800 },
    // The hypnotic groove (a 12 fps step-printed shutter drag, cyan and emerald, crossfades on the beat); the peak drop (amber and red
    // flash bursts, zoom pulses on the kick); and the afterhours POV (a wide lens at the crowd, dark shadows, colour fringes on the lights).
    takes: ['cyan', 'magenta', 'drag'],
    takeRhythm: {
      magenta: { on: 'beats', every: [1, 2], minMs: 500, maxMs: 1000 },
    },
    drive: [0.35, 0.95],
  },
  {
    id: 'super8',
    title: 'Super 8 Americana',
    genres: [/country/, /\bfolk\b|americana|bluegrass/, /acoustic|singer[- ]songwriter/, /\bindie\b/, /lo-?fi/, /\bsoul\b/, /ballad/, /boom ?bap/, /neoclassical/, /gospel|worship|christian|church/, /jazz|blues/],
    rhythm: { on: 'bars', every: 1, minMs: 1600, maxMs: 2600 },
    // The porchlight story (the sprocket gate, dusty sepia-green, an 18 fps jitter); the golden road (no gate, sunset light, a warm leak
    // on each cut); and the acoustic raw (faded film, a gentle sway, long holds so the lyrics breathe).
    takes: ['porch', 'road', 'dust'],
    takeRhythm: {
      dust: { on: 'bars', every: 2, minMs: 3200, maxMs: 4800 },
    },
    drive: [0, 0.65],
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
  golden: take => (take === 'bloom' ? 'cut' : 'dissolve'),
  baile: take => (take === 'whip' ? 'whip' : 'cut'),
  afterhours: take => (take === 'cyan' ? 'dissolve' : 'cut'),
  super8: () => 'cut',
};
export const DISSOLVE_MS = 300;

const BY_ID = new Map(PRESETS.map(preset => [preset.id, preset]));
export const presetDef = (id: PresetId) => BY_ID.get(id)!;
export const presetTitle = (id: PresetId) => BY_ID.get(id)!.title;
export const isPresetTake = (id: PresetId, take: string) => BY_ID.get(id)?.takes.includes(take) ?? false;
/** How a take cuts: its own rhythm, or its preset's. */
export const presetRhythm = (id: PresetId, take: string): PresetRhythm => BY_ID.get(id)!.takeRhythm?.[take] ?? BY_ID.get(id)!.rhythm;

/** What a song is called, as far as the presets read it. */
export type SongGenre = { genre: string; subGenre?: string; style?: string };

/** How well a preset fits the song: 3 for its style, 2 for its sub-genre, 1 for its genre, 0 for none. */
export function presetFit(preset: PresetDef, song: SongGenre): number {
  const named = (text: string | undefined) => Boolean(text) && preset.genres.some(pattern => pattern.test(text!.toLowerCase()));
  return named(song.style) ? 3 : named(song.subGenre) ? 2 : named(song.genre) ? 1 : 0;
}

/**
 * The presets for the song, in the brief's order: those its most specific word names (an ambient song filed under Electronic is Dreamy,
 * not also Club Pulse because of its genre) that suit its measured drive. When none of them suits it, the drive wins: the presets of a
 * broader word that do, else the nearest in pace (never a fast one on a slow song). A song none fits is cut as Raw 16mm, the most popular.
 */
export function presetsFor(song: SongGenre, drive?: number | null): PresetId[] {
  const fits = PRESETS.map(preset => ({ preset, fit: presetFit(preset, song) })).filter(entry => entry.fit > 0);
  const best = (entries: typeof fits) => {
    const top = Math.max(...entries.map(entry => entry.fit));
    return entries.filter(entry => entry.fit === top).map(entry => entry.preset.id);
  };
  if (!fits.length) return ['kodak'];
  if (typeof drive !== 'number' || !Number.isFinite(drive)) return best(fits);
  const slow = drive < SLOW_DRIVE;
  const allowed = fits.filter(entry => !(slow && entry.preset.fast));
  const suited = allowed.filter(entry => drive >= entry.preset.drive[0] && drive <= entry.preset.drive[1]);
  if (suited.length) return best(suited);
  if (!allowed.length) return ['kodak'];
  const gap = (entry: (typeof fits)[number]) => Math.max(entry.preset.drive[0] - drive, drive - entry.preset.drive[1]);
  const nearest = Math.min(...allowed.map(gap));
  return best(allowed.filter(entry => gap(entry) - nearest < 0.05));
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
