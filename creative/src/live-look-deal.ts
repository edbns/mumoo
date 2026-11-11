/**
 * Live looks: effects drawn on a picture while the card plays (live-look.ts), so they work on any picture, ours or the person's own,
 * which the baked effects of Our photography cannot. This file is only the list of looks and how a row deals them (no drawing).
 * Every effect (a family) has a row of its own on the shelf, and each row deals the effect in its different colourings.
 * Each look is added here when its shader exists. Add the id to the worker's LIVE_LOOKS too (a test keeps them in step).
 */
import type { MoodLane } from './ad-fonts';

/** A family is one effect with many colourings; each family has its own row on the shelf. */
export const LOOK_FAMILIES = ['thermal', 'halftone', 'dither', 'glow'] as const;
export type LookFamily = (typeof LOOK_FAMILIES)[number];
export const isLookFamily = (value: unknown): value is LookFamily => LOOK_FAMILIES.includes(value as LookFamily);

export const LIVE_LOOKS = [
  /** The picture as a heat camera sees it: bodies hot, shade cold, soft and banded, in the iron palette. It flares on the beat. */
  { id: 'thermal', family: 'thermal', title: 'Thermal', lanes: ['quiet', 'dark', 'techno', 'party', 'general'] },
  /** The same heat reading in cold light: navy, blue, cyan, ice white. */
  { id: 'arctic', family: 'thermal', title: 'Arctic', lanes: ['quiet', 'dark', 'techno', 'general'] },
  /** A night-vision tube: phosphor green, heavy grain, dark edges. */
  { id: 'night', family: 'thermal', title: 'Night vision', lanes: ['dark', 'techno', 'party'] },
  /** The same heat reading in the grey modes of a heat camera. */
  { id: 'whitehot', family: 'thermal', title: 'White hot', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'blackhot', family: 'thermal', title: 'Black hot', lanes: ['quiet', 'techno', 'general'] },
  /** The rainbow mode of a heat camera. */
  { id: 'rainbow', family: 'thermal', title: 'Rainbow', lanes: ['techno', 'party', 'general'] },
  /** Hot colours: molten rock, a red wash, old amber, gold leaf. */
  { id: 'lava', family: 'thermal', title: 'Lava', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'crimson', family: 'thermal', title: 'Crimson', lanes: ['dark', 'techno'] },
  { id: 'amber', family: 'thermal', title: 'Amber', lanes: ['quiet', 'dark', 'general'] },
  { id: 'gold', family: 'thermal', title: 'Gold', lanes: ['quiet', 'party', 'general'] },
  /** Neon colours: blacklight, toxic green, vapor wave, sweets. */
  { id: 'ultraviolet', family: 'thermal', title: 'Ultraviolet', lanes: ['dark', 'techno', 'party'] },
  { id: 'acid', family: 'thermal', title: 'Acid', lanes: ['dark', 'techno', 'party'] },
  { id: 'vapor', family: 'thermal', title: 'Vapor wave', lanes: ['techno', 'party'] },
  { id: 'candy', family: 'thermal', title: 'Candy', lanes: ['party', 'general'] },
  /** Soft and cool colours: the sky after sunset, tropical water, northern lights, a blueprint. */
  { id: 'dusk', family: 'thermal', title: 'Dusk', lanes: ['quiet', 'party', 'general'] },
  { id: 'lagoon', family: 'thermal', title: 'Lagoon', lanes: ['quiet', 'party', 'general'] },
  { id: 'aurora', family: 'thermal', title: 'Aurora', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'cyanotype', family: 'thermal', title: 'Cyanotype', lanes: ['quiet', 'general'] },
  /** Halftone: the picture printed as a screen of round dots, the dots swelling on the beat. One effect, many inks and papers (the colours are in live-look-ramp.ts). */
  { id: 'halftone', family: 'halftone', title: 'Halftone', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'halftonebw', family: 'halftone', title: 'Black and white', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'halftonenews', family: 'halftone', title: 'Newsprint', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'halftoneblue', family: 'halftone', title: 'Blue ink', lanes: ['quiet', 'party', 'general', 'gospel'] },
  { id: 'halftonered', family: 'halftone', title: 'Red ink', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'halftonepink', family: 'halftone', title: 'Pink ink', lanes: ['quiet', 'party', 'general'] },
  { id: 'halftoneteal', family: 'halftone', title: 'Teal ink', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'halftonepop', family: 'halftone', title: 'Pop art', lanes: ['techno', 'party', 'general'] },
  { id: 'halftoneneon', family: 'halftone', title: 'Neon dots', lanes: ['dark', 'techno', 'party'] },
  { id: 'halftoneinvert', family: 'halftone', title: 'White on black', lanes: ['quiet', 'dark', 'techno', 'general', 'gospel'] },
  { id: 'halftonegold', family: 'halftone', title: 'Gold on black', lanes: ['quiet', 'dark', 'party', 'general', 'gospel'] },
  /** More prints: analog print, two inks, dark card and metal, and other marks than dots (lines, squares). */
  { id: 'halftonecmyk', family: 'halftone', title: 'CMYK comic', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'halftoneriso', family: 'halftone', title: 'Riso two-ink', lanes: ['quiet', 'techno', 'party', 'general', 'gospel'] },
  { id: 'halftoneblueprint', family: 'halftone', title: 'Blueprint', lanes: ['quiet', 'dark', 'techno', 'general', 'gospel'] },
  { id: 'halftonesepia', family: 'halftone', title: 'Sepia press', lanes: ['quiet', 'dark', 'general', 'gospel'] },
  { id: 'halftonemanga', family: 'halftone', title: 'Manga screentone', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'halftonesubway', family: 'halftone', title: 'Subway poster', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'halftonesunset', family: 'halftone', title: 'Sunset screenprint', lanes: ['quiet', 'party', 'general', 'gospel'] },
  { id: 'halftonematcha', family: 'halftone', title: 'Matcha and charcoal', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'halftonecandy', family: 'halftone', title: 'Cotton candy', lanes: ['quiet', 'party', 'general', 'gospel'] },
  { id: 'halftonetarot', family: 'halftone', title: 'Tarot midnight', lanes: ['quiet', 'dark', 'general', 'gospel'] },
  { id: 'halftoneacid', family: 'halftone', title: 'Acid zine', lanes: ['dark', 'techno', 'party'] },
  { id: 'halftonesilver', family: 'halftone', title: 'Silver foil', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'halftonephosphor', family: 'halftone', title: 'Phosphor terminal', lanes: ['dark', 'techno'] },
  { id: 'halftoneuv', family: 'halftone', title: 'UV blacklight', lanes: ['dark', 'techno', 'party'] },
  { id: 'halftonecopper', family: 'halftone', title: 'Copper etching', lanes: ['quiet', 'dark', 'general', 'gospel'] },
  { id: 'halftoneengrave', family: 'halftone', title: 'Engraving', lanes: ['quiet', 'dark', 'general', 'gospel'] },
  { id: 'halftonehatch', family: 'halftone', title: 'Crosshatch', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'halftoneled', family: 'halftone', title: 'LED matrix', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'halftonebenday', family: 'halftone', title: 'Ben-Day dots', lanes: ['techno', 'party', 'general'] },
  /** Dither: the picture reduced to chunky square pixels and a flat palette, as old computers and receipt printers did. One effect, many palettes. */
  { id: 'dithermac', family: 'dither', title: 'Mac classic', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'ditherinvert', family: 'dither', title: 'White on black', lanes: ['quiet', 'dark', 'techno', 'general', 'gospel'] },
  { id: 'dithergameboy', family: 'dither', title: 'Game Boy', lanes: ['quiet', 'dark', 'techno', 'party', 'general'] },
  { id: 'dithercga', family: 'dither', title: 'CGA', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'dithercgagreen', family: 'dither', title: 'CGA green', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'ditherega', family: 'dither', title: 'EGA', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'ditherc64', family: 'dither', title: 'Commodore 64', lanes: ['quiet', 'dark', 'techno', 'party', 'general'] },
  { id: 'ditherapple2', family: 'dither', title: 'Apple II', lanes: ['quiet', 'techno', 'party', 'general'] },
  { id: 'ditherpico8', family: 'dither', title: 'PICO-8', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'ditheramiga', family: 'dither', title: 'Amiga', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'ditherreceipt', family: 'dither', title: 'Receipt', lanes: ['quiet', 'dark', 'techno', 'party', 'general', 'gospel'] },
  { id: 'ditherblueprint', family: 'dither', title: 'Blueprint', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'ditheramber', family: 'dither', title: 'Amber CRT', lanes: ['quiet', 'dark', 'general'] },
  { id: 'dithersunset', family: 'dither', title: 'Sunset', lanes: ['quiet', 'party', 'general', 'gospel'] },
  { id: 'dithervapor', family: 'dither', title: 'Vapor', lanes: ['dark', 'techno', 'party'] },
  { id: 'ditherforest', family: 'dither', title: 'Forest', lanes: ['quiet', 'general'] },
  { id: 'dithernews', family: 'dither', title: 'Newsprint', lanes: ['quiet', 'dark', 'techno', 'party', 'general'] },
  { id: 'ditherneon', family: 'dither', title: 'Neon', lanes: ['dark', 'techno', 'party'] },
  { id: 'dithergold', family: 'dither', title: 'Gold on black', lanes: ['quiet', 'dark', 'party', 'general'] },
  { id: 'ditherown', family: 'dither', title: 'Own colours', lanes: ['quiet', 'dark', 'techno', 'party', 'general'] },
  /** Glow: light bleeding from the bright parts of the picture. Soft blooms for quiet songs; neon and club for the loud ones. */
  { id: 'glowbloom', family: 'glow', title: 'Soft bloom', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glowpink', family: 'glow', title: 'Hot pink neon', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowcyan', family: 'glow', title: 'Cyan neon', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowsplit', family: 'glow', title: 'Magenta cyan', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowamber', family: 'glow', title: 'Amber street', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowgold', family: 'glow', title: 'Gold', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glowuv', family: 'glow', title: 'Ultraviolet', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowtoxic', family: 'glow', title: 'Toxic green', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowred', family: 'glow', title: 'Red alert', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowpeach', family: 'glow', title: 'Sunset peach', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glowice', family: 'glow', title: 'Ice blue', lanes: ['quiet', 'dark', 'techno', 'general'] },
  { id: 'glowprism', family: 'glow', title: 'Rainbow prism', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowdream', family: 'glow', title: 'Dream', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glownoir', family: 'glow', title: 'Noir', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowclub', family: 'glow', title: 'Club', lanes: ['dark', 'techno', 'party', 'general'] },
  { id: 'glowmist', family: 'glow', title: 'Mist', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glowlilac', family: 'glow', title: 'Lilac', lanes: ['quiet', 'general', 'gospel'] },
  { id: 'glowrose', family: 'glow', title: 'Rose', lanes: ['quiet', 'party', 'general', 'gospel'] },
] as const satisfies readonly { id: string; family: LookFamily; title: string; lanes: readonly MoodLane[] }[];

export type LiveLookId = (typeof LIVE_LOOKS)[number]['id'];
/** The thermal family: the picture read as heat and coloured with a ramp. */
export type HeatLookId = Extract<(typeof LIVE_LOOKS)[number], { family: 'thermal' }>['id'];
/** The halftone family: the picture printed as dots of one ink on one paper. */
export type HalftoneLookId = Extract<(typeof LIVE_LOOKS)[number], { family: 'halftone' }>['id'];
/** The dither family: the picture reduced to square pixels and a flat palette. */
export type DitherLookId = Extract<(typeof LIVE_LOOKS)[number], { family: 'dither' }>['id'];
/** The glow family: light bleeding from the bright parts of the picture. */
export type GlowLookId = Extract<(typeof LIVE_LOOKS)[number], { family: 'glow' }>['id'];
export const LOOK_FAMILY_TITLES: Record<LookFamily, string> = { thermal: 'Thermal', halftone: 'Halftone', dither: 'Dither', glow: 'Glow' };
export const LIVE_LOOK_IDS: readonly LiveLookId[] = LIVE_LOOKS.map(look => look.id);

export const isLiveLook = (value: unknown): value is LiveLookId => LIVE_LOOK_IDS.includes(value as LiveLookId);
export const liveLookTitle = (id: LiveLookId) => LIVE_LOOKS.find(look => look.id === id)!.title;

function hash(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

/** The items in an order the seed decides. */
const shuffled = <T>(items: readonly T[], seed: string, salt: string, key: (item: T) => string) =>
  items.map(item => ({ item, order: hash(seed, `${salt}:${key(item)}`, 1_000_000) })).sort((a, b) => a.order - b.order).map(entry => entry.item);

/**
 * The look of each of `count` cards of a family's row: every card carries one a lane welcomes (a card that shows its picture as it is looks like a look that did not work),
 * and neighbouring cards never carry the same, so a row is never one look four times. With three looks and four cards one look comes twice, never side by side.
 * The seed (the song and the row's Refresh count) decides the order, so Refresh deals new ones. A lane no look of the family welcomes deals none (the row is then left out);
 * a lane that welcomes only one look gets it on one card and the others show the picture as it is, rather than that look four times.
 */
export function dealLooks(lane: MoodLane, seed: string, count: number, family: LookFamily): (LiveLookId | null)[] {
  const welcome = LIVE_LOOKS.filter(look => look.family === family && (look.lanes as readonly MoodLane[]).includes(lane));
  const order = shuffled(welcome.map(look => look.id), seed, 'look', id => id);
  if (!order.length) return Array.from({ length: count }, () => null);
  if (order.length === 1) {
    const place = hash(seed, 'place', count);
    return Array.from({ length: count }, (_, index) => (index === place ? order[0] : null));
  }
  const start = hash(seed, 'start', order.length);
  return Array.from({ length: count }, (_, index) => order[(start + index) % order.length]);
}
