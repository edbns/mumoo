import { findGenre } from './genres';
import { hashPick, type AdFont } from './ad-fonts';
import type { LyricAttitude } from './lyric-meaning';
import {
  ANIMALS, DOODLE_MOODS, HAIR, HAT_IDS, PROP_IDS, BEARDS,
  type BeardId, type BodyId, type DoodleMood, type HairId, type HatId, type HeadKind, type PropId,
} from './doodle-parts';

/**
 * Doodle: who sings. The genre decides what the singer wears and carries, the voice decides the build and the clothes,
 * the lyrics decide the face. Some singers are animals. A singer is named by an id, so a card is a few words that the
 * browser and the cloud render read the same way (nothing is drawn until then).
 *
 *   latin.f.long              a woman of the Latin kit, with long hair
 *   latin.m.short.stache      a man of the Latin kit, with short hair and a moustache ("none" for no beard)
 *   latin.a.llama.f           a llama, wearing the Latin animal's clothes on a woman's build (.m for a man's)
 *   latin.f.long+latin.m.short.stache   two of them, a duet
 */

export type DoodleVoice = 'female' | 'male' | 'both';
export const DOODLE_VOICES: readonly DoodleVoice[] = ['female', 'male', 'both'];

/** The paper a doodle is drawn on. */
export const DOODLE_PAPERS = ['white', 'ruled', 'graph', 'kraft'] as const;
export type DoodlePaper = typeof DOODLE_PAPERS[number];

/** The hand the words are written in: a marker, so it reads big and a little crooked. Both are in the worker's list (a test keeps them in step). */
export const DOODLE_FACES: readonly AdFont[] = ['Caveat Brush', 'Permanent Marker'];

type Kit = { hat: HatId[]; props: PropId[] };
type Genre = {
  slug: string;
  name: string;
  f: Kit & { hair: HairId };
  m: Kit & { hair: HairId; beard?: BeardId };
  a: Kit & { head: HeadKind };
};

/** One kit per genre family of `genres.ts`. */
const KITS: Record<string, Genre> = {
  'Electronic & Dance (EDM)': {
    slug: 'electronic', name: 'Electronic',
    f: { hair: 'bob', hat: ['headphones'], props: ['rays'] },
    m: { hair: 'bald', beard: 'goatee', hat: ['headphones'], props: ['rays'] },
    a: { head: 'frog', hat: ['headphones'], props: ['rays'] },
  },
  'Hip-Hop & Rap': {
    slug: 'hiphop', name: 'Hip-hop',
    f: { hair: 'long', hat: ['bandana', 'hoops'], props: ['chain'] },
    m: { hair: 'bald', beard: 'full', hat: ['bandana'], props: ['chain'] },
    a: { head: 'goat', hat: ['beanie'], props: ['chain'] },
  },
  'Latin & Urbano': {
    slug: 'latin', name: 'Latin',
    f: { hair: 'long', hat: ['hoops', 'shadesUp'], props: [] },
    m: { hair: 'short', beard: 'stache', hat: ['backcap'], props: ['chain'] },
    a: { head: 'rooster', hat: ['shadesUp'], props: ['chain'] },
  },
  Rock: {
    slug: 'rock', name: 'Rock',
    f: { hair: 'pomp', hat: ['hoops'], props: ['guitar'] },
    m: { hair: 'mohawk', hat: [], props: ['guitar'] },
    a: { head: 'donkey', hat: ['bandana'], props: ['guitar'] },
  },
  Metal: {
    slug: 'metal', name: 'Metal',
    f: { hair: 'long', hat: [], props: ['guitar', 'steam'] },
    m: { hair: 'long', beard: 'full', hat: [], props: ['guitar', 'steam'] },
    a: { head: 'goat', hat: [], props: ['guitar', 'steam'] },
  },
  Punk: {
    slug: 'punk', name: 'Punk',
    f: { hair: 'mohawk', hat: ['hoops'], props: ['steam'] },
    m: { hair: 'mohawk', hat: [], props: ['steam'] },
    a: { head: 'rooster', hat: ['bandana'], props: ['steam'] },
  },
  Pop: {
    slug: 'pop', name: 'Pop',
    f: { hair: 'buns', hat: ['bow'], props: ['star'] },
    m: { hair: 'pomp', hat: ['shadesUp'], props: ['star'] },
    a: { head: 'llama', hat: ['bow'], props: ['star'] },
  },
  'Jazz, Soul & Blues': {
    slug: 'jazz', name: 'Jazz',
    f: { hair: 'afro', hat: ['hoops'], props: ['note'] },
    m: { hair: 'short', beard: 'stache', hat: ['fedora'], props: ['bowtie', 'note'] },
    a: { head: 'cat', hat: ['beret'], props: ['note'] },
  },
  'Classical & Cinematic': {
    slug: 'classical', name: 'Classical',
    f: { hair: 'bun', hat: [], props: ['note'] },
    m: { hair: 'bald', beard: 'stache', hat: [], props: ['bowtie', 'note'] },
    a: { head: 'cat', hat: [], props: ['bowtie', 'note'] },
  },
  'Country & Folk': {
    slug: 'country', name: 'Country',
    f: { hair: 'long', hat: ['cowboy'], props: ['guitar'] },
    m: { hair: 'short', beard: 'stache', hat: ['cowboy'], props: ['guitar'] },
    a: { head: 'donkey', hat: ['cowboy'], props: ['guitar'] },
  },
  'Reggae & Dancehall': {
    slug: 'reggae', name: 'Reggae',
    f: { hair: 'long', hat: ['beanie'], props: ['note'] },
    m: { hair: 'bald', beard: 'full', hat: ['beanie'], props: ['note'] },
    a: { head: 'cow', hat: ['beanie'], props: ['note'] },
  },
  'Experimental & Avant-Garde': {
    slug: 'experimental', name: 'Experimental',
    f: { hair: 'pomp', hat: ['headphones'], props: ['rays', 'note'] },
    m: { hair: 'afro', hat: ['shadesUp'], props: ['rays'] },
    a: { head: 'frog', hat: ['beanie'], props: ['rays', 'note'] },
  },
  'Gospel & Christian': {
    slug: 'gospel', name: 'Gospel',
    f: { hair: 'bun', hat: ['hoops'], props: ['rays', 'hearts'] },
    m: { hair: 'short', hat: [], props: ['bowtie', 'rays'] },
    a: { head: 'llama', hat: [], props: ['rays', 'hearts'] },
  },
};
const DEFAULT_KIT = KITS.Pop;
const KIT_BY_SLUG = new Map(Object.values(KITS).map(kit => [kit.slug, kit]));

const FEMALE_HAIR: readonly HairId[] = ['long', 'bob', 'afro', 'bun', 'buns', 'pomp', 'mohawk'];
const MALE_HAIR: readonly HairId[] = ['short', 'pomp', 'bald', 'afro', 'mohawk', 'long'];
const BEARD_CHOICES: readonly (BeardId | 'none')[] = ['full', 'goatee', 'stache', 'none'];
/** A hat that sits over the hair: the hair under it must not stick out of it in spikes or buns. */
const COVERING: readonly HatId[] = ['bandana', 'beret', 'fedora', 'cap', 'backcap', 'beanie', 'cowboy', 'headphones'];

export type Singer = {
  head: HeadKind;
  body: BodyId;
  hair: HairId;
  beard?: BeardId;
  hat: HatId[];
  props: PropId[];
};

const isBeard = (value: string): value is BeardId => value in BEARDS;
const isHair = (value: string): value is HairId => value in HAIR;

function oneSinger(id: string): { singer: Singer; kit: Genre; kind: 'f' | 'm' | 'a' } {
  const [slug, kind, third, fourth] = id.split('.');
  const kit = KIT_BY_SLUG.get(slug);
  if (!kit) throw new Error(`Doodle has no singer '${id}'.`);
  if (kind === 'f' && third && isHair(third)) return { kind, kit, singer: { head: 'woman', body: 'woman', hair: third, hat: kit.f.hat, props: kit.f.props } };
  if (kind === 'm' && third && isHair(third) && fourth && (fourth === 'none' || isBeard(fourth))) {
    return { kind, kit, singer: { head: 'man', body: 'man', hair: third, ...(fourth !== 'none' ? { beard: fourth } : {}), hat: kit.m.hat, props: kit.m.props } };
  }
  if (kind === 'a' && third && ANIMALS.includes(third as HeadKind) && (fourth === 'f' || fourth === 'm')) {
    return { kind, kit, singer: { head: third as HeadKind, body: fourth === 'f' ? 'woman' : 'man', hair: 'bald', hat: kit.a.hat, props: kit.a.props } };
  }
  throw new Error(`Doodle has no singer '${id}'.`);
}

/** The singers a card draws: one, or two for a duet. */
export function singersOf(id: string): Singer[] {
  const parts = id.split('+');
  if (parts.length > 2) throw new Error(`Doodle draws one singer or two, not '${id}'.`);
  return parts.map(part => oneSinger(part).singer);
}

const HEAD_WORD: Record<HeadKind, string> = { man: 'singer', woman: 'singer', donkey: 'donkey', cow: 'cow', rooster: 'rooster', cat: 'cat', llama: 'llama', goat: 'goat', frog: 'frog' };

/** What a card is called: "Latin singer", "Rock donkey", "Pop duet". */
export function doodleLabel(id: string): string {
  const parts = id.split('+').map(oneSinger);
  const name = parts[0].kit.name;
  if (parts.length === 2) return `${name} duet`;
  return `${name} ${HEAD_WORD[parts[0].singer.head]}`;
}

/** What the words feel like, as the face of a singer. Anything unread (or neutral) is a happy face: a doodle that does not feel anything is dull. */
export function doodleMood(attitude: LyricAttitude | null | undefined): DoodleMood {
  switch (attitude) {
    case 'flirty': case 'love': return 'flirty';
    case 'confident': return 'boastful';
    case 'angry': return 'angry';
    case 'sad': case 'thoughtful': return 'sad';
    default: return 'joyful';
  }
}

/** The four faces of a row, all feeling what the song feels: a sad song has no cheerful card in it. */
const CARD_MOODS: Record<DoodleMood, readonly DoodleMood[]> = {
  joyful: ['joyful', 'flirty', 'boastful', 'joyful'],
  flirty: ['flirty', 'joyful', 'flirty', 'boastful'],
  boastful: ['boastful', 'joyful', 'boastful', 'flirty'],
  angry: ['angry', 'boastful', 'angry', 'boastful'],
  sad: ['sad', 'sad', 'sad', 'sad'],
};

const pick = <T,>(items: readonly T[], seed: string, salt: string): T => items[hashPick(seed, salt, items.length)];
const without = <T,>(items: readonly T[], ...gone: (T | undefined)[]) => items.filter(item => !gone.includes(item));

export type DoodleCard = { id: string; paper: DoodlePaper; mood: DoodleMood; label: string; font: AdFont };

/**
 * Four doodles for a song. The first is the singer the genre and the voice ask for; the rest are the same kit on an
 * animal, and on a second person (a different head of hair), so a row is not one drawing four times. With no voice
 * given, the row has a woman and a man in it. A new `seed` deals a different hand.
 */
export function dealDoodle(genre: string, voice: DoodleVoice | null, mood: DoodleMood, seed: string): DoodleCard[] {
  const kit = KITS[findGenre(genre)?.name ?? ''] ?? DEFAULT_KIT;
  const covered = (hat: HatId[]) => hat.some(item => COVERING.includes(item));

  const woman = (variant: boolean) => {
    const hairs = variant ? without(FEMALE_HAIR.filter(hair => !(covered(kit.f.hat) && (hair === 'mohawk' || hair === 'bun'))), kit.f.hair) : [kit.f.hair];
    return `${kit.slug}.f.${pick(hairs, seed, 'f')}`;
  };
  const man = (variant: boolean) => {
    const hairs = variant ? without(MALE_HAIR.filter(hair => !(covered(kit.m.hat) && (hair === 'mohawk' || hair === 'afro' || hair === 'long'))), kit.m.hair) : [kit.m.hair];
    const beards = variant ? without(BEARD_CHOICES, kit.m.beard ?? 'none') : [kit.m.beard ?? 'none'];
    return `${kit.slug}.m.${pick(hairs, seed, 'm')}.${pick(beards, seed, 'beard')}`;
  };
  const animal = (variant: boolean, body: 'f' | 'm') => {
    const head = variant ? pick(without(ANIMALS, kit.a.head), seed, `animal:${body}`) : kit.a.head;
    return `${kit.slug}.a.${head}.${body}`;
  };

  const ids = voice === 'female' ? [woman(false), animal(false, 'f'), woman(true), animal(true, 'f')]
    : voice === 'male' ? [man(false), animal(false, 'm'), man(true), animal(true, 'm')]
    : voice === 'both' ? [`${woman(false)}+${man(false)}`, animal(false, 'f'), `${woman(true)}+${animal(true, 'm')}`, `${man(true)}+${animal(false, 'f')}`]
    : [woman(false), animal(false, 'f'), man(false), animal(true, 'm')];

  const papers = [...DOODLE_PAPERS].sort((a, b) => hashPick(seed, a, 9973) - hashPick(seed, b, 9973));
  const moods = CARD_MOODS[mood];
  return ids.map((id, index) => ({
    id,
    paper: papers[index % papers.length],
    mood: moods[index % moods.length],
    label: doodleLabel(id),
    font: pick(DOODLE_FACES, seed, `font:${index}`),
  }));
}

/** Every id a kit can ever name is checked the same way the page checks it: this is what the worker's rule is written from. */
export const DOODLE_ID_RULE = /^[a-z0-9]+(\.[a-z0-9]+){2,3}(\+[a-z0-9]+(\.[a-z0-9]+){2,3})?$/;

export { DOODLE_MOODS, HAT_IDS, PROP_IDS };
