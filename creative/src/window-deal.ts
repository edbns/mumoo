/**
 * Window — which four cards a row of the shelf deals. Pure: the same seed always deals the same cards.
 *
 * A card is a picture seen through a giant lyric word, on a flat screen colour. The picture is one of four kinds
 * (the card's `mode`), and every refresh mixes them by its seed:
 *   person  our woman (or the person's own photo) standing in front of the word, cut out of her picture
 *   plain   a photo as it is: ours, or the person's own (a photo, or a video or GIF)
 *   effect  one of our baked Shaders effect stills of her
 *   bank    one of our baked Shaders backgrounds
 * Only a photo that has a cut-out can stand in front of the word. A still of her with an effect on it is never
 * dealt in `person` mode: most of them move her body, and a cut-out taken from the plain photo would no longer fit.
 * Every card is black or white, whichever reads against its picture (the readings in window-readings.json), and holds it: the screen never flips colour.
 */
import { hashPick, type AdFont } from './ad-fonts';
import effectsData from '../punch-plates/effects/effects.json';
import bankData from './look-lab/bank.json';
import readings from './window-readings.json';
import type { WindowReading } from './pack-window';
import { WINDOW_FACES } from './window-look';

export type WindowMode = 'person' | 'plain' | 'effect' | 'bank';

/** What the deal knows of the person's own picture: how its screens read, and whether it is a video or GIF (which can only be seen plain). */
export type WindowOwn = { reading: WindowReading; clip: boolean };

/** A library picture that Window can draw, with how its screens read: a photo has its cut-out (so a person may stand in front), a video or GIF is judged by its poster and only seen plain. */
export type WindowLibraryItem = { id: string; reading: WindowReading; clip: boolean };

/** One card: its picture (`libraryId` for a library picture, else `plateId`, `effectId` or `bankId`; none for the person's own), its screen (black or white, the only one it is allowed, so it never flips), and its face. */
export type WindowCard = { mode: WindowMode; libraryId?: string; clip?: boolean; plateId?: string; effectId?: string; bankId?: string; palette: string; allowed: string[]; font: AdFont };

const CARDS = 4;
const READINGS = readings as Record<string, WindowReading>;

/** Baked effects whose collection moves the picture about: a card with one in the letters is not what the person asked of Window. */
const DISPLACING = ['Glass Facets', 'Shuffle Sort', 'Quantized', 'Pixel Reveal'];
/** Pale or washed out, so the letters show a flat colour. */
const WASHED_OUT = ['impression-trail-2', 'impression-trail-9'];
/** Mostly bright green: no screen colour reads well against it, and the card is a flat green. */
const BRIGHT_GREEN = ['impression-trail-3', 'impression-trail-7', 'tinted-lenses-2'];

type Effect = { id: string; collection: string };
export const WINDOW_EFFECT_IDS: readonly string[] = (effectsData as Effect[])
  .filter(effect => !DISPLACING.includes(effect.collection) && !WASHED_OUT.includes(effect.id) && !BRIGHT_GREEN.includes(effect.id))
  .map(effect => effect.id);
export const WINDOW_BANK_IDS: readonly string[] = (bankData as { slug: string }[]).map(look => look.slug);

/** Our pictures that cards are dealt from, with their readings. A picture nobody has read is an error: run `npm run bake:window-readings`. */
function readingOf(key: string): WindowReading {
  const reading = READINGS[key];
  if (!reading) throw new Error(`Window has not read ${key} yet. Run: npm run bake:window-readings`);
  return reading;
}

const order = <T>(items: readonly T[], seed: string, key: (item: T) => string) => [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));

/** The only screens Window is dealt in. */
export const WINDOW_SCREENS = ['black', 'off-white'] as const;

/**
 * The screen of one card: black or white, whichever reads against its picture (the seed's pick when both do, a different one from the card
 * before where it can be), else black. The card is allowed that screen alone, so it holds it the whole video.
 */
function screenOf(reading: readonly string[], seed: string, index: number, opened: Set<string>) {
  const reads = order(WINDOW_SCREENS.filter(id => reading.includes(id)), `${seed}:screen:${index}`, id => id);
  const palette = reads.find(id => !opened.has(id)) ?? reads[0] ?? 'black';
  opened.add(palette);
  if (opened.size === WINDOW_SCREENS.length) opened.clear();
  return { palette, allowed: [palette] };
}

/**
 * The modes of the four cards. A deck holds one person and one plain card, and two each of effect and bank, in the
 * seed's order; the first four that our pictures can fill (one person card for each approved photo that has a
 * cut-out, one plain card for each approved photo, so no card repeats another) are dealt.
 */
function ourModes(seed: string, plates: readonly { id: string; cutout: boolean }[]): WindowMode[] {
  const room: Record<WindowMode, number> = { person: plates.filter(plate => plate.cutout).length, plain: plates.length, effect: CARDS, bank: CARDS };
  const deck = order((['person', 'plain', 'effect', 'effect', 'bank', 'bank'] as WindowMode[]).map((mode, index) => ({ mode, index })), `${seed}:modes`, card => `${card.index}`);
  const dealt: WindowMode[] = [];
  for (const { mode } of deck) {
    if (dealt.length < CARDS && dealt.filter(held => held === mode).length < room[mode]) dealt.push(mode);
  }
  if (dealt.length < CARDS) throw new Error('Window cannot deal four cards from our pictures.');
  return dealt;
}

/** The person's own picture is seen plain, or alternately plain and with her in front when a person stands in it (the seed says which comes first). */
function ownModes(seed: string, own: WindowOwn): WindowMode[] {
  if (own.clip || !own.reading.person) return Array.from({ length: CARDS }, () => 'plain');
  const first: WindowMode = hashPick(seed, 'first', 2) ? 'person' : 'plain';
  const other: WindowMode = first === 'person' ? 'plain' : 'person';
  return Array.from({ length: CARDS }, (_, index) => (index % 2 ? other : first));
}

/** The picture of each card of our own: the seed's n-th choice of the kind for the n-th card of that kind. */
function ourPicture(mode: WindowMode, nth: number, seed: string, plates: readonly { id: string; cutout: boolean }[]) {
  if (mode === 'effect') {
    const id = order(WINDOW_EFFECT_IDS, `${seed}:effect`, effect => effect)[nth];
    return { effectId: id, reading: readingOf(`effect:${id}`).plain };
  }
  if (mode === 'bank') {
    const id = order(WINDOW_BANK_IDS, `${seed}:bank`, bank => bank)[nth];
    return { bankId: id, reading: readingOf(`bank:${id}`).plain };
  }
  const id = order(mode === 'person' ? plates.filter(plate => plate.cutout) : plates, `${seed}:plate`, plate => plate.id)[nth].id;
  const reading = readingOf(`plate:${id}`);
  const seen = mode === 'person' ? reading.person : reading.plain;
  if (!seen) throw new Error(`Window finds nobody standing in ${id}, so it cannot be dealt with her in front.`);
  return { plateId: id, reading: seen };
}

export function dealWindow(seed: string, allPlates: readonly { id: string; cutout: boolean }[], own: WindowOwn | null): WindowCard[] {
  // A photo Window has not read yet (a placeholder, or one added before the readings were baked) is left out, never a crash.
  const plates = allPlates.filter(plate => READINGS[`plate:${plate.id}`]);
  const modes = own ? ownModes(seed, own) : ourModes(seed, plates);
  const faces = order(WINDOW_FACES, `${seed}:faces`, face => face);
  const opened = new Set<string>();
  return modes.map((mode, index) => {
    const nth = modes.slice(0, index).filter(held => held === mode).length;
    const { reading, ...picture } = own
      ? { reading: mode === 'person' ? own.reading.person : own.reading.plain }
      : ourPicture(mode, nth, seed, plates);
    if (!reading?.length) throw new Error('Window has no screens that read against this picture.');
    return { mode, ...picture, ...screenOf(reading, seed, index, opened), font: faces[index] };
  });
}

/**
 * Four cards from library pictures: the seed's order of them, one picture for each card (the same one again when the library has fewer than four, never
 * on neighbouring cards when it has two). A photo where a person stands alternates her in front of the word and plain; a photo with nobody in it and a clip
 * are seen plain. Each card is black or white (`screenOf`).
 */
export function dealWindowLibrary(seed: string, items: readonly WindowLibraryItem[]): WindowCard[] {
  if (!items.length) throw new Error('Window has no library pictures to deal.');
  const picked = order(items, `${seed}:library`, item => item.id);
  const faces = order(WINDOW_FACES, `${seed}:faces`, face => face);
  const first = hashPick(seed, 'person-first', 2);
  const opened = new Set<string>();
  return Array.from({ length: CARDS }, (_, index) => {
    const item = picked[index % picked.length];
    const person = !item.clip && Boolean(item.reading.person?.length) && (index + first) % 2 === 0;
    const reading = person ? item.reading.person : item.reading.plain;
    if (!reading?.length) throw new Error('Window has no screens that read against this picture.');
    return { mode: person ? 'person' : 'plain', libraryId: item.id, clip: item.clip, ...screenOf(reading, seed, index, opened), font: faces[index] };
  });
}
