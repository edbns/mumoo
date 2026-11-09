import { useEffect, useState } from 'react';
import { SHELF_ROWS, type CreativesPackSlot, type ShelfRow } from './creatives-pack';

/**
 * The cart: creatives a person liked, kept while they refresh the shelf for more. An item is the card exactly as
 * it was seen (not a video), so nothing is rendered until checkout. One token buys one finished video.
 * It lives in this browser, for this song and clip, until the person checks out.
 */
export const CART_LIMIT = 24;
const KEY = 'mumoo-cart';
/** Bumped whenever a card gains or loses a field, so an old cart is dropped instead of drawn wrongly. */
const VERSION = 1;

export type CartItem = {
  id: string;
  row: ShelfRow;
  slot: CreativesPackSlot;
  lyrics: boolean;
  /** The person's own picture it was made from; null when it uses our approved photography. */
  uploadId: string | null;
  generation: number;
};

type Stored = { version: number; songKey: string; items: CartItem[] };

const isItem = (value: unknown): value is CartItem => {
  const item = value as CartItem | null;
  return typeof item === 'object' && item !== null && typeof item.id === 'string'
    && SHELF_ROWS.some(row => row.id === item.row) && typeof item.slot === 'object' && item.slot !== null
    && item.slot.id === item.id && typeof item.lyrics === 'boolean'
    && (item.uploadId === null || typeof item.uploadId === 'string') && Number.isInteger(item.generation);
};

/** The saved cart if it is this song's; anything else (another song, an old version, damage) is an empty cart. */
export function readCart(raw: string | null, songKey: string): CartItem[] {
  if (!raw) return [];
  let stored: Stored;
  try {
    stored = JSON.parse(raw) as Stored;
  } catch {
    return [];
  }
  if (stored?.version !== VERSION || stored.songKey !== songKey || !Array.isArray(stored.items)) return [];
  return stored.items.length <= CART_LIMIT && stored.items.every(isItem) ? stored.items : [];
}

export function writeCart(songKey: string, items: readonly CartItem[]): string {
  const stored: Stored = { version: VERSION, songKey, items: [...items] };
  return JSON.stringify(stored);
}

export function useCart(songKey: string) {
  const [items, setItems] = useState(() => readCart(localStorage.getItem(KEY), songKey));
  useEffect(() => { localStorage.setItem(KEY, writeCart(songKey, items)); }, [songKey, items]);
  return {
    items,
    full: items.length >= CART_LIMIT,
    has: (id: string) => items.some(item => item.id === id),
    add: (item: CartItem) => setItems(current => (current.length >= CART_LIMIT || current.some(held => held.id === item.id) ? current : [...current, item])),
    remove: (id: string) => setItems(current => current.filter(item => item.id !== id)),
  };
}
