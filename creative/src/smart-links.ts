import { accountFetch } from './account';
import type { Source } from '../netlify/lib/traffic-source.mjs';

/**
 * Smart links in the browser: the song found from a pasted link (`/api/links/lookup`), the draft the artist edits (kept in this
 * browser until it is published, so it can be made before signing in), and the person's published links (`/api/links`).
 */

export const SERVICES = ['spotify', 'apple', 'youtube', 'youtubeMusic', 'deezer', 'tidal', 'soundcloud', 'amazon'] as const;
export type Service = typeof SERVICES[number];
export const LABELS: Record<Service, string> = {
  spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube', youtubeMusic: 'YouTube Music',
  deezer: 'Deezer', tidal: 'TIDAL', soundcloud: 'SoundCloud', amazon: 'Amazon Music',
};

/** A song the lookup was not sure of; `pick` is what to look the link up again with when the artist chooses it. */
export type Candidate = { title: string; artist: string | null; cover: string | null; url: string; pick: string };
export type FoundSong = {
  source: string; title: string; artist: string | null; isrc: string | null; cover: string | null; preview: string | null;
  links: Record<Service, { url: string; exact: boolean }>; confident: boolean; candidates?: Candidate[];
};

/** One button of the fan page. `exact` is the song's own page; otherwise the link is a search on that service. */
export type ServiceRow = { service: Service; url: string; hidden: boolean; exact: boolean };
export type LinkFields = {
  source: string; title: string; artist: string; cover: string | null; preview: string | null; isrc: string | null; services: ServiceRow[];
};
/**
 * A published link. Listed, it has its button presses per service ever (`clicks`) and of the last seven days (`week`), its page
 * opens ever and of the last seven days, and both per traffic source.
 */
export type Published = {
  slug: string; link: Omit<LinkFields, 'services'> & { services: Omit<ServiceRow, 'exact'>[] }; created_at: string; updated_at: string;
  clicks?: Partial<Record<Service, number>>; week?: number; views?: number; views_week?: number;
  sources?: Partial<Record<Source, { views: number; clicks: number }>>;
};

/** What the editor holds. `editing` is the address of the published link being changed, or null for a new one. */
export type Draft = { url: string; link: LinkFields | null; candidates: Candidate[] | null; slug: string; editing: string | null };
export const EMPTY_DRAFT: Draft = { url: '', link: null, candidates: null, slug: '', editing: null };

const DRAFT_KEY = 'mumoo-link-draft';

/** The new link being made, kept in this browser. A published link being edited is never kept, so Create always opens on a new one. */
function loadDraft(): Draft {
  try {
    const kept = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    return kept && typeof kept.url === 'string' && !kept.editing ? { ...EMPTY_DRAFT, ...kept } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: Draft) {
  if (draft.editing) return;
  try {
    if (draft.url || draft.link) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable: the draft lasts as long as the page */ }
}

let toEdit: Draft | null = null;
/** Edit on My Smart Links: the editor opens on this link once, then on the new-link draft again. */
export function openForEdit(item: Published) { toEdit = draftOf(item); }
export function startingDraft(): Draft {
  const next = toEdit ?? loadDraft();
  toEdit = null;
  return next;
}

async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || 'This is unavailable right now. Try again in a moment.');
  return body;
}

/** The song behind a pasted link; `pick` when the artist chose one of the candidates. Throws the words to show. */
export async function lookupSong(url: string, pick?: string): Promise<FoundSong> {
  const response = await fetch('/api/links/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, ...(pick && { pick }) }) });
  return (await answer<{ song: FoundSong }>(response)).song;
}

/** A song found by its name; choosing it looks up its Deezer `url`. `preview` is Deezer's 30 seconds, whose link lasts minutes. */
export type SearchResult = { title: string; artist: string | null; cover: string | null; url: string; preview: string | null };

/** Songs for a typed name. Throws the words to show. */
export async function searchSongs(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  return (await answer<{ results: SearchResult[] }>(await fetch(`/api/links/search?q=${encodeURIComponent(query)}`, { signal }))).results;
}

/** The pasted text as a song link, when it is one ("open.spotify.com/…" without https:// too); null for a name to search. */
export function asLink(text: string): string | null {
  const trimmed = text.trim();
  if (/^(https?:\/\/|spotify:)/i.test(trimmed)) return trimmed;
  return /^(www\.|m\.)?(open\.spotify\.com|music\.apple\.com|(music\.)?youtube\.com|youtu\.be|deezer\.com)\//i.test(trimmed) ? `https://${trimmed}` : null;
}

/** Whether a link can be published at /l/<name>, with the reason when not. */
export async function checkSlug(name: string): Promise<{ free: boolean; error?: string }> {
  return answer(await fetch(`/api/links/slug?name=${encodeURIComponent(name)}`));
}

/** An address made from the song: "the-weeknd-blinding-lights". */
export function suggestSlug(artist: string, title: string) {
  return `${artist} ${title}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

/** The editor's fields for a found song: its own title, artist and cover, and a button for every service in our order. */
export function fieldsOf(url: string, song: FoundSong): LinkFields {
  return {
    source: url, title: song.title, artist: song.artist ?? '', cover: song.cover, preview: song.preview, isrc: song.isrc,
    services: SERVICES.map(service => ({ service, url: song.links[service].url, exact: song.links[service].exact, hidden: false })),
  };
}

/** Whether a button's link is a search on its service (as the lookup makes them) rather than the song's own page. */
export const isSearch = (url: string) => /\/search\b|[?&](q|term|search_query)=/.test(url);

/** A published link opened again in the editor. */
export function draftOf({ slug, link }: Published): Draft {
  return { url: link.source, link: { ...link, services: link.services.map(row => ({ ...row, exact: !isSearch(row.url) })) }, candidates: null, slug, editing: slug };
}

/** Where fans open it. */
export const addressOf = (slug: string) => `${location.origin}/l/${slug}`;

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listLinks(): Promise<Published[]> {
  return (await (await accountFetch('/api/links')).json() as { links: Published[] }).links;
}

/** Publishes the draft (or saves the changes to the link it was opened from). */
export async function publishDraft(draft: Draft): Promise<Published> {
  const response = await accountFetch('/api/links', { method: draft.editing ? 'PUT' : 'POST', ...json({ slug: draft.editing ?? draft.slug, link: draft.link }) });
  return (await response.json() as { link: Published }).link;
}

export async function deletePublished(slug: string) {
  await accountFetch(`/api/links?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
}
