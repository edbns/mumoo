import { useEffect, useState } from 'react';
import { SHELF_ROWS, type CreativesPackSlot, type ShelfRow } from './creatives-pack';

/**
 * The cart: creatives a person liked, kept while they refresh the shelf for more. An item is the card exactly as
 * it was seen (not a video), so nothing is rendered until checkout. One token buys one finished video.
 * It lives in this browser. Each song and clip has its own cart; the last few are kept, so moving the clip window
 * or opening another song never empties another cart.
 */
export const CART_LIMIT = 24;
/** Carts kept in the browser, one per song and clip; the one touched longest ago is dropped first. */
export const CART_SONGS = 8;
const KEY = 'mumoo-cart';
/** Bumped whenever a card gains or loses a field, so an old cart is dropped instead of drawn wrongly. */
const VERSION = 3;

/** A small picture of the card, so the cart can show it on any page without drawing anything. */
export const THUMB_WIDTH = 180;
export const THUMB_HEIGHT = 320;
const THUMB_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const THUMB_MAX_CHARS = 60_000;

export type CartItem = {
  id: string;
  row: ShelfRow;
  slot: CreativesPackSlot;
  lyrics: boolean;
  /** The person's own picture it was made from; null when it uses our approved photography. */
  uploadId: string | null;
  generation: number;
  /** JPEG data URL, `THUMB_WIDTH` x `THUMB_HEIGHT`, taken from the card when it was added. */
  thumb: string;
};

/** One song and clip (`${sourceSha256}:${clipStartMs}`) and what is in its cart. */
export type CartEntry = { songKey: string; items: CartItem[] };

type Stored = { version: number; carts: CartEntry[] };

const isItem = (value: unknown): value is CartItem => {
  const item = value as CartItem | null;
  return typeof item === 'object' && item !== null && typeof item.id === 'string'
    && SHELF_ROWS.some(row => row.id === item.row) && typeof item.slot === 'object' && item.slot !== null
    && item.slot.id === item.id && typeof item.lyrics === 'boolean'
    && (item.uploadId === null || typeof item.uploadId === 'string') && Number.isInteger(item.generation)
    && typeof item.thumb === 'string' && item.thumb.length <= THUMB_MAX_CHARS && THUMB_PATTERN.test(item.thumb);
};

const isEntry = (value: unknown): value is CartEntry => {
  const entry = value as CartEntry | null;
  return typeof entry === 'object' && entry !== null && typeof entry.songKey === 'string' && entry.songKey !== ''
    && Array.isArray(entry.items) && entry.items.length > 0 && entry.items.length <= CART_LIMIT && entry.items.every(isItem);
};

/** Every saved cart, oldest first. Anything damaged, from an old version, or empty is left out; a bad cart never costs another one. */
export function readCarts(raw: string | null): CartEntry[] {
  if (!raw) return [];
  let stored: Stored;
  try {
    stored = JSON.parse(raw) as Stored;
  } catch {
    return [];
  }
  if (stored?.version !== VERSION || !Array.isArray(stored.carts)) return [];
  const seen = new Set<string>();
  const carts = stored.carts.filter(entry => {
    if (!isEntry(entry) || seen.has(entry.songKey)) return false;
    seen.add(entry.songKey);
    return true;
  });
  return carts.slice(-CART_SONGS);
}

export function writeCarts(carts: readonly CartEntry[]): string {
  const stored: Stored = { version: VERSION, carts: [...carts] };
  return JSON.stringify(stored);
}

/** The id of one song's cart: the song and where the 15 seconds start. */
export const songKeyOf = (sourceSha256: string, clipStartMs: number) => `${sourceSha256}:${clipStartMs}`;

const NONE: CartItem[] = [];

/** What is in one song's cart. */
export function cartFor(carts: readonly CartEntry[], songKey: string): CartItem[] {
  return carts.find(entry => entry.songKey === songKey)?.items ?? NONE;
}

/** The carts with one song's items replaced. That cart becomes the newest; an empty one disappears; the oldest beyond the cap are dropped. */
function put(carts: readonly CartEntry[], songKey: string, items: CartItem[]): CartEntry[] {
  const others = carts.filter(entry => entry.songKey !== songKey);
  return (items.length ? [...others, { songKey, items }] : others).slice(-CART_SONGS);
}

/** Adds a creative to a song's cart unless it is already there, the cart is full, or there is no song. */
export function addItem(carts: CartEntry[], songKey: string, item: CartItem): CartEntry[] {
  const held = cartFor(carts, songKey);
  if (!songKey || held.length >= CART_LIMIT || held.some(other => other.id === item.id)) return carts;
  return put(carts, songKey, [...held, item]);
}

export function dropItems(carts: CartEntry[], songKey: string, ids: readonly string[]): CartEntry[] {
  const held = cartFor(carts, songKey);
  const kept = held.filter(item => !ids.includes(item.id));
  return kept.length === held.length ? carts : put(carts, songKey, kept);
}

/** A card, shrunk to a small JPEG. The card must already be drawn. */
export function cardThumbnail(card: HTMLCanvasElement): string {
  const small = document.createElement('canvas');
  small.width = THUMB_WIDTH;
  small.height = THUMB_HEIGHT;
  const context = small.getContext('2d');
  if (!context) throw new Error('A picture of this creative could not be made.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(card, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  return small.toDataURL('image/jpeg', 0.7);
}

/** The cart of the song and clip being worked on (empty when there is none), backed by every saved cart. */
export function useCart(songKey: string) {
  const [carts, setCarts] = useState(() => readCarts(localStorage.getItem(KEY)));
  useEffect(() => {
    try {
      localStorage.setItem(KEY, writeCarts(carts));
    } catch {
      // The browser is out of room: the cart used longest ago gives way (the newest is always last).
      setCarts(current => (current.length > 1 ? current.slice(1) : current));
    }
  }, [carts]);
  const items = cartFor(carts, songKey);
  return {
    items,
    full: items.length >= CART_LIMIT,
    has: (id: string) => items.some(item => item.id === id),
    add: (item: CartItem) => setCarts(current => addItem(current, songKey, item)),
    remove: (id: string) => setCarts(current => dropItems(current, songKey, [id])),
    /** Empties creatives from any song's cart, e.g. the ones a finished download was for. */
    removeFrom: (key: string, ids: readonly string[]) => setCarts(current => dropItems(current, key, ids)),
  };
}

export type Cart = ReturnType<typeof useCart>;
