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
  /** The mood boards it is filed in (`boards.ts`), and those the admin said it does not fit (never offered again). */
  boards: string[]; notBoards: string[];
  clearedBy: string; clearedAt: string; createdAt: string;
  /** The file as uploaded; for a prepared video or GIF also its still and its light muted copy, which the cards show instead. */
  url: string; poster: string | null; preview: string | null;
  /** Ready to be drawn by the templates. A video or GIF is first made a small clip by our worker; `problem` says why one cannot be used. */
  ready: boolean; problem: string | null;
  /** The picture's size and, when it is too small for sharp creatives, words saying so. */
  width: number | null; height: number | null; warning: string | null;
  /** Tags our vision model saw in it that it does not have yet: offered, never added by themselves. */
  seen: string[];
  /** Our models are still looking at it; its suggestion comes when they are done. */
  looking: boolean;
  /** The reader's sentence about it, and the board(s) suggested while it is on none: sure ones can be filed as a group. */
  seenAs: string | null;
  suggestion: { boards: string[]; sure: boolean } | null;
  /** Once it is on a board: the other boards our models say it would also fit, best first. */
  also: string[];
  /** Its main colours, largest first, once measured: matched to the colours of a song's genre. */
  colours: { hex: string; share: number }[] | null;
};
export type TagCount = { name: string; items: number };
export type Library = { items: LibraryItem[]; tags: TagCount[] };
export type Problem = { id: number; kind: 'render' | 'download' | 'sign_in'; userId: string | null; email: string | null; message: string; createdAt: string; seen: boolean };
export type Overview = {
  email: string;
  library: { approved: number; pending: number; hidden: number };
  problems: { unseen: number };
  people: number;
  /** Amounts in cents. `sales`: one line per currency and status (`paid` or `refunded`). Credits: videos sold, given (referrals), made. */
  money: {
    sales: { currency: string; status: 'paid' | 'refunded'; orders: number; amount: number; last30: number }[];
    credits: { sold: number; bonus: number; used: number; free: number; buyers: number };
    recent: { at: string; videos: number; amount: number; currency: string; status: 'paid' | 'refunded' }[];
  };
};

/** What people did with one kind of thing (a row, a look, a picture…) over the period. */
/** `shown`: cards that reached a person's screen (told since hands are reported); `delivered`: downloaded videos that reached them. */
export type Tally = { key: string; shown: number; plays: number; selects: number; downloads: number; delivered: number; refreshes: number; avgWatchMs: number };
export type LearningEvent = {
  at: string; event: string; row: string | null; look: string | null; vibe: string | null; lane: string | null;
  mood: string | null; genre: string | null; watchMs: number | null; nthDownload: number | null;
};
export type Learning = {
  days: number;
  totals: Tally & { songs: number };
  rows: Tally[];
  /** Each template in the period just before this one, for the trend. */
  earlier: { key: string; shown: number; plays: number; delivered: number }[];
  /** Each kind of card of each row (`row · kind`: a treatment variant, Window palette, Silhouette figure, Riso ink, live look), most downloaded first. */
  cards: Tally[];
  /** Each row in each lane the brain chose for the song (`row · lane`), most downloaded first: the shelf's order is learned per lane. */
  rowLanes: Tally[];
  /** By the template's place on the shelf when the card was played (`0` is the top). */
  places: Tally[];
  looks: Tally[]; vibes: Tally[]; moods: Tally[]; pictures: Tally[];
  /** Cards dealt from each mood board, and from each board for each genre (`board · genre`). */
  boards: Tally[]; boardGenres: Tally[];
  /** Cards on our pictures by how well the picture carried the genre's colours: `strong`, `some`, `weak`, or `none` (not measured, or a genre without colours). */
  colours: Tally[];
  /** Genre learning: the kept style prints (all time), "I don't know" presses, the answers to the brain's guesses per guessed style, and to its checks of picks. */
  genre: {
    prints: { songs: number; creator: number; confirmed: number; corrected: number; seeded: number };
    /** Public answers waiting for the daily check, held by it for a person, or rejected as never confirmed. */
    candidates: { waiting: number; held: number; rejected: number };
    unknowns: number;
    answers: { style: string; yes: number; no: number; unsure: number }[];
    checks: { picked: string; guessed: string; switched: number; kept: number; unsure: number }[];
  };
  recent: LearningEvent[];
};

/** One request to the admin API as the signed-in person. */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await sessionToken();
  if (!token) throw new AdminError('Sign in to continue.', 401);
  const response = await fetch(`/api/admin/${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  // A reply that is not ours (Netlify's own login page while the site is private) never reached the admin API.
  if (!response.ok && !body && response.status === 401) throw new AdminError('This page lost its access to the site. Reload the page and try again.', 401);
  if (!response.ok) throw new AdminError(body?.error || 'That did not work. Try again in a moment.', response.status);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const id = (value: string) => `id=${encodeURIComponent(value)}`;

/** One UTC day of the overview's charts. `revenue` is in cents (USD sales only). */
export type Day = {
  day: string; signups: number; orders: number; revenue: number; refunds: number; creditsSold: number; videos: number; failed: number;
  freeVideos: number; uploads: number; links: number; linkViews: number; linkClicks: number; lastSeen: number;
};
export type Stats = {
  days: number;
  /** The period, oldest day first, and the same number of days just before it. */
  series: Day[]; before: Day[];
  renders: { status: string; count: number; makeSeconds: number | null; waitSeconds: number | null }[];
  services: { service: string; calls: number; ok: number; avgMs: number; p95Ms: number }[];
  clicksByService: { service: string; clicks: number }[];
  viewsByCountry: { country: string; views: number }[];
  viewsBySource: { source: string; views: number }[];
  people: { total: number; active1: number; active7: number; active30: number; buyers: number; makers: number; rendering: number; links: number; referred: number; referredPaid: number; storedBytes: number };
};
export const loadStats = (days: number) => adminFetch<Stats>(`stats?days=${days}`);

export type PersonRow = {
  member_no: number; email: string; created_at: string; last_seen_at: string; orders: number; spent_cents: number; credits_bought: number;
  credits_given: number; credits_used: number; free_used: boolean; videos: number; failed: number; uploads: number; stored_bytes: number; links: number; referred_by: string | null;
};
export type OrderRow = { invoice_number: string | null; id: string; email: string; videos: number; amount: number; currency: string; status: 'paid' | 'refunded'; paid_at: string; refunded_at: string | null };
export type VideoRow = {
  id: string; email: string; status: 'queued' | 'starting' | 'running' | 'done' | 'failed' | 'cancelled'; attempts: number; error: string | null;
  created_at: string; started_at: string | null; finished_at: string | null; wait_s: number | null; make_s: number | null; free: boolean;
};
export type LinkRow = { slug: string; email: string; title: string; artist: string; created_at: string; updated_at: string; views: number; clicks: number; top_service: string | null; ad_tracking: boolean };
export type UploadRow = { id: string; email: string; kind: 'photo' | 'motion'; status: 'preparing' | 'ready' | 'failed'; bytes: number; error: string | null; created_at: string };
export type ReferralRow = { friend: string; referrer: string; created_at: string; rewarded_at: string | null; order_id: string | null };
export type Records = { people: PersonRow; orders: OrderRow; videos: VideoRow; links: LinkRow; uploads: UploadRow; referrals: ReferralRow };
export const loadRecords = <K extends keyof Records>(list: K) => adminFetch<{ list: K; rows: Records[K][]; limit: number }>(`records?list=${list}`);

export const loadOverview = () => adminFetch<Overview>('overview');
export const loadLibrary = () => adminFetch<Library>('library');
export const loadLearning = (days: number) => adminFetch<Learning>(`learning?days=${days}`);
export const loadProblems = () => adminFetch<{ problems: Problem[]; unseen: number }>('problems');
export const markProblemSeen = (problem: number) => adminFetch<{ problems: Problem[]; unseen: number }>(`problems?id=${problem}`, { method: 'PATCH' });
export const markAllSeen = () => adminFetch<{ problems: Problem[]; unseen: number }>('problems?all=1', { method: 'PATCH' });

export type Change = Partial<{ status: 'approved' | 'hidden'; attitudes: string[]; tags: string[]; genre: string; subGenre: string; boards: string[]; notBoards: string[]; note: string }>;
export const changeItem = (item: string, change: Change) => adminFetch<{ item: LibraryItem; tags: TagCount[] }>(`library?${id(item)}`, json('PATCH', change));
export const deleteItem = (item: string) => adminFetch<Library>(`library?${id(item)}`, { method: 'DELETE' });
export const deleteTag = (name: string) => adminFetch<Library>(`library?tag=${encodeURIComponent(name)}`, { method: 'DELETE' });

/** Genre training: the songs the brain learns genres from, and how ready its guess is (see admin-genre). */
export type GenreSong = { song: string; style: string; genre: string; subGenre: string; source: string; clips: number; at: string };
export type GenreTraining = {
  ready: { clips: number; asked: number; right: number };
  groups: { genre: string; subGenre: string; songs: number }[];
  songs: GenreSong[];
};
export type SeedLabel = { sourceSha256: string; offsetMs: number; style: string; genre: string; subGenre: string; source: 'seeded' };
export const loadGenre = () => adminFetch<GenreTraining>('genre');
export const forgetSong = (song: string) => adminFetch<GenreTraining>(`genre?song=${song}`, { method: 'DELETE' });
export const startClipPrint = (wav: Blob) => adminFetch<{ id: string }>('genre', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
export const keepClipPrint = (job: string, label: SeedLabel) => adminFetch<{ status: 'running' | 'stored' | 'skipped' }>('genre', json('PUT', { id: job, label }));

/** The library already has this file (sent before, in a batch that was cut off): it is not sent again. */
export class AlreadyInLibrary extends Error {
  constructor(readonly id: string) { super('Already in the library.'); }
}

/** Sends one file: room is reserved, the file goes straight to storage, then it is confirmed. */
export async function uploadFile(original: File, note: string): Promise<LibraryItem> {
  // A photo is sent as a small JPEG (what the templates draw); a GIF or video goes as it is and our worker prepares it.
  const photo = original.type.startsWith('image/') && original.type !== 'image/gif';
  const file = photo ? new File([await shrinkPhoto(original)], original.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' }) : original;
  const reserved = await adminFetch<{ id: string; putUrl: string } | { duplicate: string }>('library', json('POST', { type: file.type, bytes: file.size, rights: true, note }));
  if ('duplicate' in reserved) throw new AlreadyInLibrary(reserved.duplicate);
  const sent = await fetch(reserved.putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!sent.ok) throw new Error('The file could not be sent. Try again.');
  return (await adminFetch<{ item: LibraryItem }>(`library?${id(reserved.id)}`, { method: 'PUT' })).item;
}
