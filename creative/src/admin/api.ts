import { sessionToken } from '../account';
import { shrinkPhoto } from '../photo-shrink';

/** A refusal from the server, with its own words and its status (401 signed out, 403 not an admin). */
export class AdminError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type LibraryKind = 'photo' | 'video' | 'gif';
export type LibraryStatus = 'pending' | 'approved' | 'hidden';
export type LibraryItem = {
  id: string; kind: LibraryKind; contentType: string; bytes: number; status: LibraryStatus;
  attitudes: string[]; tags: string[]; genre: string | null; subGenre: string | null; note: string;
  clearedBy: string; clearedAt: string; createdAt: string; url: string;
  /** Ready to be drawn by the templates. A video or GIF is first made a small clip by our worker; `problem` says why one cannot be used. */
  ready: boolean; problem: string | null;
  /** The picture's size and, when it is too small for sharp creatives, words saying so. */
  width: number | null; height: number | null; warning: string | null;
  /** Tags our vision model saw in it that it does not have yet: offered, never added by themselves. */
  seen: string[];
};
export type TagCount = { name: string; items: number };
export type Library = { items: LibraryItem[]; tags: TagCount[] };
export type Problem = { id: number; kind: 'render' | 'download' | 'sign_in'; userId: string | null; email: string | null; message: string; createdAt: string; seen: boolean };
export type Overview = {
  email: string;
  library: { approved: number; pending: number; hidden: number };
  problems: { unseen: number };
  people: number;
};

/** What people did with one kind of thing (a row, a look, a picture…) over the period. */
export type Tally = { key: string; plays: number; selects: number; downloads: number; delivered: number; refreshes: number; avgWatchMs: number };
export type LearningEvent = {
  at: string; event: string; row: string | null; look: string | null; vibe: string | null; lane: string | null;
  mood: string | null; genre: string | null; watchMs: number | null; nthDownload: number | null;
};
export type Learning = {
  days: number;
  totals: Tally & { songs: number };
  rows: Tally[]; looks: Tally[]; vibes: Tally[]; moods: Tally[]; pictures: Tally[];
  /** Genre learning: the kept style prints (all time), "I don't know" presses, and the answers to the brain's guesses, per guessed style. */
  genre: {
    prints: { songs: number; creator: number; confirmed: number; seeded: number };
    unknowns: number;
    answers: { style: string; yes: number; no: number; unsure: number }[];
  };
  recent: LearningEvent[];
};

/** One request to the admin API as the signed-in person. */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await sessionToken();
  if (!token) throw new AdminError('Sign in to continue.', 401);
  const response = await fetch(`/api/admin/${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new AdminError(body?.error || 'That did not work. Try again in a moment.', response.status);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const id = (value: string) => `id=${encodeURIComponent(value)}`;

export const loadOverview = () => adminFetch<Overview>('overview');
export const loadLibrary = () => adminFetch<Library>('library');
export const loadLearning = (days: number) => adminFetch<Learning>(`learning?days=${days}`);
export const loadProblems = () => adminFetch<{ problems: Problem[]; unseen: number }>('problems');
export const markProblemSeen = (problem: number) => adminFetch<{ problems: Problem[]; unseen: number }>(`problems?id=${problem}`, { method: 'PATCH' });
export const markAllSeen = () => adminFetch<{ problems: Problem[]; unseen: number }>('problems?all=1', { method: 'PATCH' });

export type Change = Partial<{ status: 'approved' | 'hidden'; attitudes: string[]; tags: string[]; genre: string; subGenre: string; note: string }>;
export const changeItem = (item: string, change: Change) => adminFetch<{ item: LibraryItem; tags: TagCount[] }>(`library?${id(item)}`, json('PATCH', change));
export const deleteItem = (item: string) => adminFetch<Library>(`library?${id(item)}`, { method: 'DELETE' });
export const addTag = (name: string) => adminFetch<Library>(`library?tag=${encodeURIComponent(name)}`, { method: 'POST' });
export const deleteTag = (name: string) => adminFetch<Library>(`library?tag=${encodeURIComponent(name)}`, { method: 'DELETE' });

/** Sends one file: room is reserved, the file goes straight to storage, then it is confirmed. */
export async function uploadFile(original: File, note: string): Promise<LibraryItem> {
  // A photo is sent as a small JPEG (what the templates draw); a GIF or video goes as it is and our worker prepares it.
  const photo = original.type.startsWith('image/') && original.type !== 'image/gif';
  const file = photo ? new File([await shrinkPhoto(original)], original.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' }) : original;
  const reserved = await adminFetch<{ id: string; putUrl: string }>('library', json('POST', { type: file.type, bytes: file.size, rights: true, note }));
  const sent = await fetch(reserved.putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!sent.ok) throw new Error('The file could not be sent. Try again.');
  return (await adminFetch<{ item: LibraryItem }>(`library?${id(reserved.id)}`, { method: 'PUT' })).item;
}
