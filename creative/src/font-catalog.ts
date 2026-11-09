/**
 * The bold display faces of the lyric type system.
 *
 * Licences: every face ships from an @fontsource package, so the font files are served by this site itself
 * (no Google Fonts or any other runtime request: lyrics never leave the browser or the render worker).
 * All are SIL Open Font License 1.1 unless `licence` says otherwise; OFL and Apache-2.0 both allow commercial use
 * and embedding in rendered video. Each face is a dynamic import: its CSS and font file are fetched only when a card
 * that uses it is drawn. A test keeps this list in step with the cloud worker's allow-list.
 */

/** What a face feels like. Lanes (genres) and vibes ask for moods, not for names. */
export type FontMood = 'brutal' | 'clean' | 'retro' | 'graffiti' | 'hand' | 'script' | 'round' | 'serif' | 'gothic' | 'techno' | 'pixel';

export type DisplayFace = {
  weight: number;
  moods: readonly FontMood[];
  /** Strokes are thick enough to be drawn hollow (outline) or as dust. */
  heavy: boolean;
  /** Letters join up (scripts, brush): one letter alone looks broken, so letter-by-letter motion is not used. */
  joined: boolean;
  /** `upper`: set in capitals. `natural`: keep the singer's own case (scripts, blackletter and serifs read worse in capitals). */
  letters: 'upper' | 'natural';
  licence: 'OFL-1.1' | 'Apache-2.0';
  load: () => Promise<unknown>;
};

const OFL = 'OFL-1.1';

function face(weight: number, moods: readonly FontMood[], traits: { heavy?: true; joined?: true; natural?: true }, load: () => Promise<unknown>, licence: DisplayFace['licence'] = OFL): DisplayFace {
  return { weight, moods, heavy: traits.heavy ?? false, joined: traits.joined ?? false, letters: traits.natural ? 'natural' : 'upper', licence, load };
}

export const DISPLAY_FACES = {
  // Brutal and condensed
  'Anton': face(400, ['brutal'], { heavy: true }, () => import('@fontsource/anton/latin-400.css')),
  'Bebas Neue': face(400, ['brutal', 'clean'], { heavy: true }, () => import('@fontsource/bebas-neue/latin-400.css')),
  'Archivo Black': face(400, ['brutal'], { heavy: true }, () => import('@fontsource/archivo-black/latin-400.css')),
  'Dela Gothic One': face(400, ['brutal', 'retro'], { heavy: true }, () => import('@fontsource/dela-gothic-one/latin-400.css')),
  'Big Shoulders Display': face(900, ['brutal'], { heavy: true }, () => import('@fontsource/big-shoulders-display/latin-900')),
  'League Gothic': face(400, ['brutal', 'clean'], {}, () => import('@fontsource/league-gothic/latin-400.css')),
  'Staatliches': face(400, ['brutal', 'retro'], { heavy: true }, () => import('@fontsource/staatliches/latin-400.css')),
  'Bowlby One': face(400, ['brutal', 'retro'], { heavy: true }, () => import('@fontsource/bowlby-one/latin-400.css')),
  'Alfa Slab One': face(400, ['brutal', 'retro'], { heavy: true }, () => import('@fontsource/alfa-slab-one/latin-400.css')),
  'Black Ops One': face(400, ['brutal'], { heavy: true }, () => import('@fontsource/black-ops-one/latin-400.css')),
  'Barlow Condensed': face(800, ['brutal', 'clean'], { heavy: true }, () => import('@fontsource/barlow-condensed/latin-800.css')),
  'Oswald': face(400, ['clean'], {}, () => import('@fontsource/oswald/latin-400.css')),
  'Teko': face(700, ['clean', 'techno'], {}, () => import('@fontsource/teko/latin-700.css')),
  // Retro and playful
  'Shrikhand': face(400, ['retro'], { heavy: true }, () => import('@fontsource/shrikhand/latin-400.css')),
  'Chango': face(400, ['retro', 'round'], { heavy: true }, () => import('@fontsource/chango/latin-400.css')),
  'Bangers': face(400, ['retro', 'graffiti'], { heavy: true }, () => import('@fontsource/bangers/latin-400.css')),
  'Righteous': face(400, ['retro', 'clean'], { heavy: true }, () => import('@fontsource/righteous/latin-400.css')),
  'Bungee': face(400, ['retro', 'techno'], { heavy: true }, () => import('@fontsource/bungee/latin-400.css')),
  // Graffiti and handwriting
  'Rubik Spray Paint': face(400, ['graffiti'], { heavy: true }, () => import('@fontsource/rubik-spray-paint/latin-400.css')),
  'Sedgwick Ave Display': face(400, ['graffiti'], {}, () => import('@fontsource/sedgwick-ave-display/latin-400.css')),
  'Permanent Marker': face(400, ['graffiti'], { heavy: true }, () => import('@fontsource/permanent-marker/latin-400.css'), 'Apache-2.0'),
  'Caveat Brush': face(400, ['hand'], { joined: true, natural: true }, () => import('@fontsource/caveat-brush/latin-400.css')),
  // Scripts
  'Pacifico': face(400, ['script'], { joined: true, natural: true }, () => import('@fontsource/pacifico/latin-400.css')),
  'Lobster': face(400, ['script'], { joined: true, natural: true }, () => import('@fontsource/lobster/latin-400.css')),
  'Kaushan Script': face(400, ['script', 'hand'], { joined: true, natural: true }, () => import('@fontsource/kaushan-script/latin-400.css')),
  // Rounded
  'Fredoka': face(700, ['round'], { heavy: true }, () => import('@fontsource/fredoka/latin-700.css')),
  'Baloo 2': face(800, ['round'], { heavy: true }, () => import('@fontsource/baloo-2/latin-800.css')),
  'Nunito': face(900, ['round', 'clean'], { heavy: true }, () => import('@fontsource/nunito/latin-900.css')),
  // Serif display
  'Abril Fatface': face(400, ['serif'], { natural: true }, () => import('@fontsource/abril-fatface/latin-400.css')),
  'DM Serif Display': face(400, ['serif'], { natural: true }, () => import('@fontsource/dm-serif-display/latin-400.css')),
  'Bodoni Moda': face(900, ['serif'], { natural: true }, () => import('@fontsource/bodoni-moda/latin-900.css')),
  'Gloock': face(400, ['serif'], { natural: true }, () => import('@fontsource/gloock/latin-400.css')),
  'Rozha One': face(400, ['serif'], { natural: true }, () => import('@fontsource/rozha-one/latin-400.css')),
  'Fraunces': face(900, ['serif'], { heavy: true, natural: true }, () => import('@fontsource/fraunces/latin-900.css')),
  // Blackletter
  'UnifrakturCook': face(700, ['gothic'], { natural: true }, () => import('@fontsource/unifrakturcook/latin-700.css')),
  'Pirata One': face(400, ['gothic'], { natural: true }, () => import('@fontsource/pirata-one/latin-400.css')),
  'Metal Mania': face(400, ['gothic'], { natural: true }, () => import('@fontsource/metal-mania/latin-400.css')),
  // Mono, techno and pixel
  'Audiowide': face(400, ['techno'], { heavy: true }, () => import('@fontsource/audiowide/latin-400.css')),
  'Rubik Mono One': face(400, ['techno', 'retro'], { heavy: true }, () => import('@fontsource/rubik-mono-one/latin-400.css')),
  'Orbitron': face(900, ['techno'], { heavy: true }, () => import('@fontsource/orbitron/latin-900.css')),
  'Oxanium': face(800, ['techno'], { heavy: true }, () => import('@fontsource/oxanium/latin-800.css')),
  'Chakra Petch': face(700, ['techno'], { heavy: true }, () => import('@fontsource/chakra-petch/latin-700.css')),
  'Zen Dots': face(400, ['techno', 'retro'], { heavy: true }, () => import('@fontsource/zen-dots/latin-400.css')),
  'Wallpoet': face(400, ['techno', 'retro'], { heavy: true }, () => import('@fontsource/wallpoet/latin-400.css')),
  'Rubik Glitch': face(400, ['techno', 'graffiti'], { heavy: true }, () => import('@fontsource/rubik-glitch/latin-400.css')),
  'Press Start 2P': face(400, ['pixel', 'techno'], { heavy: true }, () => import('@fontsource/press-start-2p/latin-400.css')),
  'Silkscreen': face(700, ['pixel'], { heavy: true }, () => import('@fontsource/silkscreen/latin-700.css')),
} as const satisfies Record<string, DisplayFace>;

export type AdFont = keyof typeof DISPLAY_FACES;
export const AD_FONTS = Object.keys(DISPLAY_FACES) as AdFont[];

/** Faces the fixed type styles use (typewriter, minimal, editorial): not part of the brain's choice. */
export const FIXED_FACES = {
  'Space Mono': { weight: 700, italic: false, load: () => import('@fontsource/space-mono/latin-700.css') },
  'Outfit': { weight: 400, italic: false, load: () => import('@fontsource/outfit/latin-400.css') },
  'Playfair Display': { weight: 700, italic: true, load: () => import('@fontsource/playfair-display/latin-700-italic.css') },
} as const;
export type FixedFace = keyof typeof FIXED_FACES;
