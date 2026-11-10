import { DURATION_MS, validate } from './composition';
import type { LyricWord } from './lyrics-cloud';

/**
 * The person's work, kept in this browser only so a refresh puts them back where they were: the song's file in
 * IndexedDB (one song at a time) and the small rest (genre, step, clip, lyrics) as JSON in localStorage.
 * Nothing here is sent anywhere.
 */
export const SESSION_KEY = 'mumoo-session';
const VERSION = 2;
const DB_NAME = 'mumoo';
const STORE = 'song';
const SONG = 'current';

export type Session = {
  sourceSha256: string;
  genre: string;
  subGenre: string;
  step: 1 | 2;
  clipStartMs: number;
  /** The timed lyrics of the clip, with their line breaks, exactly as the lyrics editor shows them. */
  words: LyricWord[];
  lyricsOrigin: 'transcribed' | 'typed';
  lyricsLanguage?: string;
  inCreatives: boolean;
};

type Stored = { version: number } & Session;

const isWord = (value: unknown): value is LyricWord => {
  const word = value as LyricWord | null;
  return typeof word === 'object' && word !== null && Number.isSafeInteger(word.line) && word.line >= 0 && typeof word.estimated === 'boolean';
};

export function writeSession(session: Session): string {
  const stored: Stored = { version: VERSION, ...session };
  return JSON.stringify(stored);
}

/** The saved session, or null when there is none, it is from an older version or it does not hold together. */
export function readSession(raw: string | null): Session | null {
  if (!raw) return null;
  let stored: Stored;
  try {
    stored = JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
  if (stored?.version !== VERSION || typeof stored.genre !== 'string' || typeof stored.subGenre !== 'string' || stored.subGenre.length > 100
      || (stored.step !== 1 && stored.step !== 2) || typeof stored.inCreatives !== 'boolean'
      || (stored.lyricsOrigin !== 'transcribed' && stored.lyricsOrigin !== 'typed')
      || (stored.lyricsLanguage !== undefined && typeof stored.lyricsLanguage !== 'string')
      || !Array.isArray(stored.words) || !stored.words.every(isWord)) return null;
  try {
    // The same checks the page makes on a song it has just opened: a valid clip start and ordered cues inside the 15 seconds.
    validate({ sourceSha256: stored.sourceSha256, clipStartMs: stored.clipStartMs, cues: stored.words }, stored.clipStartMs + DURATION_MS);
  } catch {
    return null;
  }
  if (stored.inCreatives && stored.words.length === 0) return null;
  const { version: _version, ...session } = stored;
  void _version;
  return session;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('This browser cannot keep your song.'));
  });
}

async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('This browser cannot keep your song.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('This browser cannot keep your song.'));
    });
  } finally {
    db.close();
  }
}

/** Keeps the song file, replacing any earlier one. */
export async function saveSong(file: File): Promise<void> {
  await inStore('readwrite', store => store.put(file, SONG));
}

/** The kept song file, or null when the browser no longer has it. */
export async function loadSong(): Promise<File | null> {
  const found = await inStore<unknown>('readonly', store => store.get(SONG));
  return found instanceof File ? found : null;
}

export async function clearSong(): Promise<void> {
  await inStore('readwrite', store => store.delete(SONG));
}
