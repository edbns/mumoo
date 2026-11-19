import { accountFetch } from './account';

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
/** A link's own ad accounts: the IDs, and only whether each token is set (tokens are never sent back). */
export type Tracking = {
  meta_pixel_id: string | null; meta_capi_token: boolean; tiktok_pixel_id: string | null; tiktok_events_token: boolean; google_ads_id: string | null;
};
/** The ad account IDs the editor holds (kept with the draft; the tokens never are). */
export type AdIds = { meta_pixel_id: string; tiktok_pixel_id: string; google_ads_id: string };
export const NO_ADS: AdIds = { meta_pixel_id: '', tiktok_pixel_id: '', google_ads_id: '' };
export type TokenField = 'meta_capi_token' | 'tiktok_events_token';
/** Tokens typed in the editor: a new one replaces the saved one, null removes it, left out keeps it. */
export type AdTokens = Partial<Record<TokenField, string | null>>;

/** A published link. Listed, it has its visits and clicks ever and of the last seven days, clicks per service and its ad accounts. */
export type Published = {
  slug: string; link: Omit<LinkFields, 'services'> & { services: Omit<ServiceRow, 'exact'>[] }; created_at: string; updated_at: string;
  views?: number; clicks?: number; week_views?: number; week_clicks?: number; paid_views?: number;
  services?: Partial<Record<Service, number>>; tracking?: Tracking;
};

/** A row of a breakdown: visits and clicks for one country, browser, source… */
export type Tally = { key: string; views: number; clicks: number };
/** A link's analytics over `days` (0: all time), as `summarise` in netlify/lib/link-stats.mjs makes them. */
export type LinkStats = {
  days: number; from: string; to: string;
  totals: { views: number; clicks: number; engagement: number; paid_views: number; paid_clicks: number };
  daily: { day: string; views: number; clicks: number }[];
  services: Tally[]; traffic: Tally[]; sources: Tally[]; countries: Tally[]; browsers: Tally[]; devices: Tally[]; systems: Tally[];
};

export async function linkStats(slug: string, days: number, signal?: AbortSignal): Promise<LinkStats> {
  const response = await accountFetch(`/api/links/stats?slug=${encodeURIComponent(slug)}&days=${days}`, { signal });
  return (await answer<{ stats: LinkStats }>(response)).stats;
}

/**
 * What the editor holds. `editing` is the address of the published link being changed, or null for a new one; `ads` its ad
 * account IDs, and `tokensSaved` which tokens the published link already has.
 */
export type Draft = {
  url: string; link: LinkFields | null; candidates: Candidate[] | null; slug: string; editing: string | null;
  ads: AdIds; tokensSaved: Record<TokenField, boolean>;
};
export const EMPTY_DRAFT: Draft = {
  url: '', link: null, candidates: null, slug: '', editing: null, ads: NO_ADS, tokensSaved: { meta_capi_token: false, tiktok_events_token: false },
};

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
  if (!response.ok || !body) throw new Error(body?.error || 'Unavailable right now. Try again in a moment.');
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
export function draftOf({ slug, link, tracking }: Published): Draft {
  return {
    url: link.source, link: { ...link, services: link.services.map(row => ({ ...row, exact: !isSearch(row.url) })) }, candidates: null, slug, editing: slug,
    ads: { meta_pixel_id: tracking?.meta_pixel_id ?? '', tiktok_pixel_id: tracking?.tiktok_pixel_id ?? '', google_ads_id: tracking?.google_ads_id ?? '' },
    tokensSaved: { meta_capi_token: Boolean(tracking?.meta_capi_token), tiktok_events_token: Boolean(tracking?.tiktok_events_token) },
  };
}

/** Where fans open it. */
export const addressOf = (slug: string) => `${location.origin}/l/${slug}`;

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The person's links as last fetched in this tab, so My Smart Links shows them at once while it fetches them again. */
let lastList: { user: string; links: Published[] } | null = null;
export const knownLinks = (user: string) => (lastList?.user === user ? lastList.links : null);
export function rememberLinks(user: string, links: Published[]) { lastList = { user, links }; }

export async function listLinks(user: string): Promise<Published[]> {
  const links = (await answer<{ links: Published[] }>(await accountFetch('/api/links'))).links;
  rememberLinks(user, links);
  return links;
}

/** Publishes the draft with its ad accounts (or saves the changes to the link it was opened from). Throws the words to show. */
export async function publishDraft(draft: Draft, tokens: AdTokens): Promise<Published> {
  const typed = Object.fromEntries(Object.entries(tokens).filter(([, value]) => value === null || value?.trim()).map(([field, value]) => [field, value ?? '']));
  const response = await accountFetch('/api/links', {
    method: draft.editing ? 'PUT' : 'POST', ...json({ slug: draft.editing ?? draft.slug, link: draft.link, tracking: { ...draft.ads, ...typed } }),
  });
  return (await answer<{ link: Published }>(response)).link;
}

export async function deletePublished(slug: string) {
  await accountFetch(`/api/links?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
}
