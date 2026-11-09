import '@fontsource-variable/inter';
import type { IntentVibe } from './music-intent';
import { AD_FONTS, DISPLAY_FACES, FIXED_FACES, type AdFont, type DisplayFace, type FontMood } from './font-catalog';

export { AD_FONTS, type AdFont };

export type MoodLane = 'party' | 'quiet' | 'gospel' | 'techno' | 'dark' | 'general';

/** What a card's type needs from its face; a face that cannot do it is never dealt to that card. */
export type FontNeed = 'heavy' | 'letters' | 'caps';

const MEETS: Record<FontNeed, (face: DisplayFace) => boolean> = {
  /** Drawn hollow or as dust. */
  heavy: face => face.heavy,
  /** Moved letter by letter. */
  letters: face => !face.joined,
  /** Lyrics are set in capitals. */
  caps: face => face.letters === 'upper',
};

/**
 * Genre decides the family of moods; the song's vibe only decides which of them lead.
 * Club music never gets a serif, calm music never gets a spray-paint stencil.
 */
const LANE_MOODS: Record<MoodLane, readonly FontMood[]> = {
  party: ['brutal', 'retro', 'round', 'graffiti', 'techno'],
  techno: ['brutal', 'techno', 'pixel', 'graffiti'],
  dark: ['brutal', 'serif', 'gothic', 'graffiti', 'hand', 'techno'],
  quiet: ['clean', 'serif', 'script', 'round', 'hand'],
  gospel: ['clean', 'serif', 'script', 'round'],
  general: ['brutal', 'retro', 'round', 'graffiti', 'script', 'serif', 'techno', 'clean', 'hand'],
};

const VIBE_MOODS: Record<IntentVibe, readonly FontMood[]> = {
  'Aggressive/Industrial': ['brutal', 'techno', 'gothic', 'graffiti'],
  'Dark/Cinematic': ['serif', 'gothic', 'brutal'],
  'Uplifting/Energetic': ['retro', 'round', 'brutal', 'graffiti', 'techno'],
  'Ambient/Mellow': ['clean', 'serif', 'round', 'script'],
};

export function hashPick(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

const meets = (font: AdFont, needs: readonly FontNeed[]) => needs.every(need => MEETS[need](DISPLAY_FACES[font]));
const hasMood = (font: AdFont, moods: readonly FontMood[]) => DISPLAY_FACES[font].moods.some(mood => moods.includes(mood));

/** Every face the lane may use that can do what the card's type needs. */
export function fontsForLane(lane: MoodLane, needs: readonly FontNeed[] = []): readonly AdFont[] {
  return AD_FONTS.filter(font => hasMood(font, LANE_MOODS[lane]) && meets(font, needs));
}

export function fontMoods(font: AdFont): readonly FontMood[] {
  return DISPLAY_FACES[font].moods;
}

/**
 * One face per card of a row, `needs[i]` being what card i's type asks for. The row is dealt from a seeded order
 * (the vibe's moods first) and each card takes a face from a mood the row has not used yet, so the four cards do
 * not share a face, and share a mood only when the lane has fewer moods than cards.
 */
export function dealFonts(lane: MoodLane, vibe: IntentVibe | null, seed: string, salt: string, needs: readonly (readonly FontNeed[])[]): AdFont[] {
  const led = vibe ? VIBE_MOODS[vibe] : [];
  const order = [...fontsForLane(lane)].sort((a, b) => {
    const lead = Number(hasMood(b, led)) - Number(hasMood(a, led));
    return lead || hashPick(seed, `font:${salt}:${a}`, 99991) - hashPick(seed, `font:${salt}:${b}`, 99991);
  });
  const used = new Set<AdFont>();
  const moods = new Set<FontMood>();
  return needs.map(need => {
    const fits = order.filter(font => !used.has(font) && meets(font, need));
    // A mood the row has not shown yet if there is one; otherwise the lane is out of moods and a repeat of one is unavoidable.
    const font = fits.find(candidate => !moods.has(DISPLAY_FACES[candidate].moods[0])) ?? fits[0];
    if (!font) throw new Error(`No ${lane} font can do ${need.join(' + ') || 'display type'}.`);
    used.add(font);
    moods.add(DISPLAY_FACES[font].moods[0]);
    return font;
  });
}

/** The supporting face of a card: another face from the same pool. */
export function pickSecondaryFont(primary: AdFont, seed: string, salt: string, pool: readonly AdFont[]): AdFont {
  const others = pool.filter(font => font !== primary);
  if (!others.length) throw new Error('A card needs a second face to pair with the first.');
  return others[hashPick(seed, `font2:${salt}`, others.length)];
}

export function pickLayoutSeed(seed: string, salt: string) {
  return {
    rotate: (hashPick(seed, `rot:${salt}`, 1000) / 1000 - 0.5) * 0.08,
    scaleBias: 0.94 + hashPick(seed, `sc:${salt}`, 100) / 100 * 0.14,
    /** Which colour a Pulise card opens on (0–3), so its four cards do not all start the same. */
    cut: hashPick(seed, `cut:${salt}`, 4),
    /** Roll of the dice for the type's own variety (scatter angles, hand-drawn wobble); the same card always rolls the same. */
    seed: hashPick(seed, `type:${salt}`, 1_000_000),
  };
}

/** What a card's layout says: its own rolls of the dice. */
export type AdLayout = ReturnType<typeof pickLayoutSeed>;

/** How to write a face as a CSS font and as a Pixi text style. */
export type FaceStyle = { family: string; weight: number; italic?: boolean };

export function displayFace(font: AdFont): FaceStyle {
  return { family: font, weight: DISPLAY_FACES[font].weight };
}

/** Lyrics are set in capitals unless the face reads better in the singer's own case. */
export function setCase(font: AdFont, text: string): string {
  return DISPLAY_FACES[font].letters === 'upper' ? text.toLocaleUpperCase() : text;
}

export function cssFont(face: FaceStyle, size: number): string {
  return `${face.italic ? 'italic ' : ''}${face.weight} ${size}px "${face.family}"`;
}

const SAMPLE = 'ABC abc NOW PLAYING LYRICS 9:41';
const loading = new Map<string, Promise<void>>();

async function fetchFace(family: string, text: string) {
  const file: { weight: number; italic?: boolean; load: () => Promise<unknown> } | undefined =
    (DISPLAY_FACES as Record<string, DisplayFace>)[family] ?? (FIXED_FACES as Record<string, (typeof FIXED_FACES)[keyof typeof FIXED_FACES]>)[family];
  if (!file) throw new Error(`${family} is not a bundled font.`);
  await file.load();
  const fonts = await document.fonts.load(cssFont({ family, weight: file.weight, italic: file.italic }, 120), `${text} ${SAMPLE}`.trim());
  if (!fonts.length) throw new Error(`The ${family} font could not load.`);
}

/** Makes these bundled faces ready to draw (fetched from this site, once per page). A face that cannot load is an error. */
export async function ensureFonts(families: readonly string[], text = ''): Promise<void> {
  await Promise.all([...new Set(families)].map(family => {
    let ready = loading.get(family);
    if (!ready) {
      ready = fetchFace(family, text);
      loading.set(family, ready);
      ready.catch(() => loading.delete(family));
    }
    return ready;
  }));
}

/** The faces of the fixed type styles (typewriter, minimal, editorial). Display faces load when a card that uses one is drawn. */
export function loadDisplayFonts(text: string): Promise<void> {
  return ensureFonts(Object.keys(FIXED_FACES), text);
}
