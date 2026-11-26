import { db } from './person.mjs';
import { SERVICES } from './services.mjs';

export { SERVICES };

/**
 * One paste, every service: the song behind a Spotify, Apple Music, YouTube or Deezer link (or one the artist found by its name), matched on Deezer and Apple Music, with a link
 * for every service a fan might use. Only free, keyless public endpoints (Spotify's own API only when SPOTIFY_CLIENT_ID and
 * SPOTIFY_CLIENT_SECRET are set). Each song is looked up once and kept (`song_lookups`).
 *
 * A Spotify link without those keys gives only the title, so the match is a guess: `confident` is false and `candidates` lists the
 * likeliest songs for the artist to choose from. Apple's preview is the one played on the fan page: Deezer's links expire in minutes.
 */

const TIMEOUT_MS = 6000;
/** A kept lookup is redone after this long, so moved or newly released links are found. */
const KEEP_DAYS = 30;
const CANDIDATES = 4;
/** Raised when the lookup finds more than it used to (2: Spotify by ISRC), so songs kept by an older one are looked up again. */
const LOOKUP_VERSION = 2;

/** The service and its id behind a pasted link, or null when it is not a song link we know. */
export function parseSource(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return { platform: 'spotify', id: uri[1] };
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'open.spotify.com') {
    const id = /\/track\/([A-Za-z0-9]{22})(?:\/|$)/.exec(url.pathname)?.[1];
    return id ? { platform: 'spotify', id } : null;
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    const country = /^\/([a-z]{2})\//.exec(url.pathname)?.[1] ?? 'us';
    const id = url.searchParams.get('i') ?? (/\/song\/(?:[^/]+\/)?(\d+)$/.exec(url.pathname)?.[1]);
    return id && /^\d+$/.test(id) ? { platform: 'apple', id, country } : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const id = url.searchParams.get('v') ?? /^\/shorts\/([\w-]{11})/.exec(url.pathname)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? { platform: 'youtube', id } : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? { platform: 'youtube', id } : null;
  }
  if (host === 'deezer.com') {
    const id = /^\/(?:[a-z]{2}\/)?track\/(\d{1,15})$/.exec(url.pathname)?.[1];
    return id ? { platform: 'deezer', id } : null;
  }
  return null;
}

/** For comparing names: lowercase, no accents, no "(Official Video)" or "feat. …", only letters and digits. */
export function plain(text) {
  return String(text ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s[-–]\s.*$/, '')
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/\b(feat|ft|featuring|with)\b\.?.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** How alike two names are, 0…1: the same, one inside the other, or the share of words they have in common. */
export function alike(a, b) {
  const x = plain(a);
  const y = plain(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const words = new Set(x.split(' '));
  const other = y.split(' ');
  const shared = other.filter(word => words.has(word)).length;
  return shared / Math.max(words.size, other.length);
}

const VARIANT = /\b(remix|live|acoustic|instrumental|karaoke|sped up|slowed|cover|edit|version|remaster(ed)?|mix)\b/i;
const isVariant = (title) => VARIANT.test(String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
/** The shape of an ISRC: country, registrant, year, number. */
export const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
/** A candidate the artist picked: its ISRC, or its Deezer track (Deezer's search leaves the ISRC out; its track page has it). */
export const PICK = /^(?:[A-Z]{2}[A-Z0-9]{3}\d{7}|deezer:\d{1,15})$/;

/** How well a found song fits what we know (title, maybe artist and length): higher is better. */
export function fitOf(seed, found) {
  let score = 3 * alike(seed.title, found.title);
  if (seed.artist) score += 2 * alike(seed.artist, found.artist);
  if (seed.durationMs && found.durationMs) score += Math.max(0, 1 - Math.abs(seed.durationMs - found.durationMs) / 10_000);
  if (isVariant(found.title) && !isVariant(seed.title)) score -= 1.5;
  // Between equals (a title alone fits the original and every cover of it), the more played one: Deezer's rank runs to about a million.
  if (found.rank) score += 0.3 * Math.min(1, Math.log10(1 + found.rank) / 6);
  return score;
}

/** A YouTube video's "Artist - Title (Official Video)", or its channel ("ArtistVEVO", "Artist - Topic") when the title has no dash. */
export function fromVideoTitle(title, channel) {
  const clean = String(title ?? '').replace(/\s*[([](official|lyric|lyrics|audio|video|music video|visualizer|hd|4k)[^)\]]*[)\]]/gi, '').trim();
  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(clean);
  if (dash) return { artist: dash[1].trim(), title: dash[2].trim() };
  const artist = String(channel ?? '').replace(/VEVO$/i, '').replace(/\s*-\s*Topic$/i, '').trim();
  return { artist: artist || null, title: clean };
}

async function getJson(fetcher, url, init) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
}

const fromDeezer = (track) => ({
  title: track.title, artist: track.artist?.name ?? null, durationMs: track.duration ? track.duration * 1000 : null,
  isrc: track.isrc ?? null, url: track.link, cover: track.album?.cover_xl ?? null, deezerId: track.id, rank: track.rank ?? 0,
});
const fromItunes = (track) => ({
  title: track.trackName, artist: track.artistName, durationMs: track.trackTimeMillis ?? null,
  url: track.trackViewUrl?.replace(/[?&]uo=\d+/, ''), cover: track.artworkUrl100?.replace(/100x100bb/, '1000x1000bb') ?? null,
  preview: track.previewUrl ?? null, album: track.collectionName ?? null, appleId: track.trackId,
});

let spotifyToken;
/** Why the last Spotify lookup could not use Spotify's API ('ok', 'kept' when it was not asked, 'no keys' or what Spotify answered), for the function's answer and logs. */
export let spotifyState = 'no keys';
async function spotifyBearer(fetcher, client, secret) {
  if (!spotifyToken || spotifyToken.until < Date.now()) {
    const body = await getJson(fetcher, 'https://accounts.spotify.com/api/token', {
      method: 'POST', body: 'grant_type=client_credentials',
      headers: { Authorization: `Basic ${Buffer.from(`${client}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    spotifyToken = { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
  }
  return spotifyToken.value;
}
async function spotifyTrack(fetcher, id) {
  const { SPOTIFY_CLIENT_ID: client, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!client || !secret) {
    spotifyState = !client && !secret ? 'no keys' : !client ? 'no SPOTIFY_CLIENT_ID' : 'no SPOTIFY_CLIENT_SECRET';
    return null;
  }
  const track = await getJson(fetcher, `https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${await spotifyBearer(fetcher, client, secret)}` } });
  spotifyState = 'ok';
  return { title: track.name, artist: track.artists?.map(a => a.name).join(', ') ?? null, durationMs: track.duration_ms ?? null, isrc: track.external_ids?.isrc ?? null, cover: track.album?.images?.[0]?.url ?? null };
}

/** The song's own Spotify page, found by its ISRC; null without the keys or when Spotify does not have it. */
async function spotifyByIsrc(fetcher, isrc) {
  const { SPOTIFY_CLIENT_ID: client, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!client || !secret || !ISRC.test(isrc ?? '')) return null;
  const body = await getJson(fetcher, `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(`isrc:${isrc}`)}`,
    { headers: { Authorization: `Bearer ${await spotifyBearer(fetcher, client, secret)}` } });
  const id = body.tracks?.items?.[0]?.id;
  return /^[A-Za-z0-9]{22}$/.test(id ?? '') ? `https://open.spotify.com/track/${id}` : null;
}

/** What the pasted link itself tells us: always a title, and as much else as the service gives away. */
async function seedOf(fetcher, source) {
  if (source.platform === 'apple') {
    const body = await getJson(fetcher, `https://itunes.apple.com/lookup?id=${source.id}&country=${source.country}&entity=song`);
    const track = body.results?.find(item => item.wrapperType === 'track' && String(item.trackId) === source.id);
    if (!track) return null;
    return { ...fromItunes(track), apple: fromItunes(track), sure: true };
  }
  if (source.platform === 'deezer') {
    const track = await getJson(fetcher, `https://api.deezer.com/track/${source.id}`);
    return track?.id ? { ...fromDeezer(track), sure: true } : null;
  }
  if (source.platform === 'spotify') {
    const full = await spotifyTrack(fetcher, source.id).catch((cause) => {
      spotifyState = cause instanceof Error ? cause.message : 'failed';
      console.error('spotify api:', spotifyState);
      return null;
    });
    if (full) return { ...full, sure: true };
    const body = await getJson(fetcher, `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${source.id}`)}`);
    return body.title ? { title: body.title, artist: null, cover: body.thumbnail_url ?? null, sure: false } : null;
  }
  const body = await getJson(fetcher, `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${source.id}`)}`);
  return body.title ? { ...fromVideoTitle(body.title, body.author_name), cover: body.thumbnail_url ?? null, sure: false } : null;
}

const searchUrl = {
  spotify: q => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  apple: q => `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`,
  youtube: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  youtubeMusic: q => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  deezer: q => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  tidal: q => `https://tidal.com/search?q=${encodeURIComponent(q)}`,
  soundcloud: q => `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`,
  amazon: q => `https://music.amazon.com/search/${encodeURIComponent(q)}`,
};
/**
 * Looks the song up everywhere. Returns null when the link is not one we know or the song cannot be found.
 * `picked` is the candidate the artist chose when we were not sure (its `pick`, see PICK): it is trusted when that song has the link's title.
 * `fetcher` is `fetch` (a test passes its own).
 */
export async function lookupSong(raw, fetcher = fetch, picked = null) {
  const source = parseSource(raw);
  if (!source) return null;
  const seed = await seedOf(fetcher, source);
  if (!seed?.title) return null;
  if (picked && PICK.test(picked) && !seed.isrc) {
    const track = await getJson(fetcher, `https://api.deezer.com/track/${ISRC.test(picked) ? `isrc:${picked}` : picked.slice('deezer:'.length)}`).catch(() => null);
    if (track?.id && alike(seed.title, track.title) >= 0.8) {
      Object.assign(seed, { artist: track.artist?.name ?? seed.artist, isrc: track.isrc ?? (ISRC.test(picked) ? picked : null), sure: true });
    }
  }

  const query = [seed.artist, plain(seed.title) || seed.title].filter(Boolean).join(' ');
  const deezerFound = seed.isrc
    ? await getJson(fetcher, `https://api.deezer.com/track/isrc:${seed.isrc}`).then(track => (track?.id ? [fromDeezer(track)] : []), () => [])
    : [];
  if (!deezerFound.length) {
    const body = await getJson(fetcher, `https://api.deezer.com/search?limit=10&q=${encodeURIComponent(query)}`).catch(() => ({ data: [] }));
    deezerFound.push(...(body.data ?? []).map(fromDeezer));
  }
  const ranked = deezerFound.map(found => ({ found, fit: fitOf(seed, found) })).sort((a, b) => b.fit - a.fit);
  const deezer = seed.isrc && deezerFound[0]?.isrc === seed.isrc ? deezerFound[0] : ranked[0]?.found ?? null;

  // What we now believe the song is: the link's own word where it is sure, Deezer's for what it could not tell.
  const known = {
    title: seed.sure ? seed.title : deezer?.title ?? seed.title,
    artist: seed.artist ?? deezer?.artist ?? null,
    durationMs: seed.durationMs ?? deezer?.durationMs ?? null,
  };
  let apple = seed.apple ?? null;
  if (!apple) {
    const country = source.country ?? 'us';
    const body = await getJson(fetcher, `https://itunes.apple.com/search?entity=song&limit=10&country=${country}&term=${encodeURIComponent([known.artist, plain(known.title)].filter(Boolean).join(' '))}`).catch(() => ({ results: [] }));
    const best = (body.results ?? []).map(fromItunes).map(found => ({ found, fit: fitOf(known, found) })).sort((a, b) => b.fit - a.fit)[0];
    if (best && alike(known.title, best.found.title) >= 0.8 && (!known.artist || alike(known.artist, best.found.artist) >= 0.5)) apple = best.found;
  }

  const sureOfDeezer = Boolean(deezer && (seed.isrc ? deezer.isrc === seed.isrc : alike(known.title, deezer.title) >= 0.8 && (!seed.artist || alike(seed.artist, deezer.artist) >= 0.5)));
  const confident = seed.sure || Boolean(seed.artist && sureOfDeezer);
  // Deezer's search leaves the ISRC out; its track page has it, and the ISRC finds the song's own Spotify page.
  if (confident && sureOfDeezer && !deezer.isrc && !seed.isrc) {
    deezer.isrc = (await getJson(fetcher, `https://api.deezer.com/track/${deezer.deezerId}`).catch(() => null))?.isrc ?? null;
  }
  const isrc = seed.isrc ?? (sureOfDeezer ? deezer.isrc : null);
  const spotify = source.platform === 'spotify' ? `https://open.spotify.com/track/${source.id}`
    : confident ? await spotifyByIsrc(fetcher, isrc).catch((cause) => { console.error('spotify isrc:', cause instanceof Error ? cause.message : cause); return null; })
    : null;
  const q = [known.artist, plain(known.title) || known.title].filter(Boolean).join(' ');
  // A guess is not a link: until the artist confirms the song, the other services get searches.
  const exact = {
    spotify,
    apple: confident ? apple?.url ?? null : null,
    youtube: source.platform === 'youtube' ? `https://www.youtube.com/watch?v=${source.id}` : null,
    youtubeMusic: source.platform === 'youtube' ? `https://music.youtube.com/watch?v=${source.id}` : null,
    deezer: confident && sureOfDeezer ? deezer.url : null,
  };
  const links = Object.fromEntries(SERVICES.map(service => [service, exact[service]
    ? { url: exact[service], exact: true }
    : { url: searchUrl[service](q), exact: false }]));

  return {
    source: `${source.platform}:${source.id}`,
    title: known.title,
    artist: known.artist,
    durationMs: known.durationMs,
    isrc,
    cover: apple?.cover ?? (sureOfDeezer ? deezer.cover : null) ?? seed.cover ?? null,
    // Deezer's own preview links expire in minutes, so a song Apple lacks keeps Deezer's track instead (`deezer:<id>`, played through /api/links/preview).
    preview: apple?.preview ?? (sureOfDeezer && deezer.deezerId ? `deezer:${deezer.deezerId}` : null),
    links,
    confident,
    ...(confident ? {} : { candidates: ranked.slice(0, CANDIDATES).map(({ found }) => ({ title: found.title, artist: found.artist, cover: found.cover, url: found.url, pick: found.isrc ?? `deezer:${found.deezerId}` })) }),
  };
}

const RESULTS = 8;
const PREVIEWS_BORROWED = 3;
const https = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : null);
/**
 * Songs for a typed name ("artist title"), for the artist to choose from: each is then looked up by its link. Spotify first (its
 * search knows a release on its first day; only with its keys), then Deezer and Apple Music; one song found on several is listed once,
 * with a preview from whichever has one.
 */
export async function searchSongs(query, fetcher = fetch) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (q.length < 2) return [];
  const { SPOTIFY_CLIENT_ID: client, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  const quiet = (service) => (cause) => { console.error(`${service} search:`, cause instanceof Error ? cause.message : cause); return []; };
  const [spotify, deezer, apple] = await Promise.all([
    client && secret
      ? spotifyBearer(fetcher, client, secret)
        .then(token => getJson(fetcher, `https://api.spotify.com/v1/search?type=track&limit=${RESULTS}&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } }))
        .then(body => Promise.all((body.tracks?.items ?? []).filter(track => /^[A-Za-z0-9]{22}$/.test(track?.id ?? '')).map(async (track, at) => ({
          title: track.name, artist: track.artists?.map(a => a.name).join(', ') ?? null, cover: https(track.album?.images?.at(-2)?.url ?? track.album?.images?.[0]?.url),
          url: `https://open.spotify.com/track/${track.id}`,
          // Spotify rarely gives a preview now: the likeliest few borrow Deezer's, found by the ISRC.
          preview: https(track.preview_url) ?? (at < PREVIEWS_BORROWED && ISRC.test(track.external_ids?.isrc ?? '')
            ? https((await getJson(fetcher, `https://api.deezer.com/track/isrc:${track.external_ids.isrc}`).catch(() => null))?.preview) : null),
        })))).catch(quiet('spotify'))
      : [],
    getJson(fetcher, `https://api.deezer.com/search?limit=${RESULTS}&q=${encodeURIComponent(q)}`)
      .then(body => (body.data ?? []).filter(track => Number.isSafeInteger(track?.id) && track.readable !== false).map(track => ({
        title: track.title, artist: track.artist?.name ?? null, cover: https(track.album?.cover_medium), url: `https://www.deezer.com/track/${track.id}`, preview: https(track.preview),
      }))).catch(quiet('deezer')),
    getJson(fetcher, `https://itunes.apple.com/search?entity=song&limit=${RESULTS}&term=${encodeURIComponent(q)}`)
      .then(body => (body.results ?? []).filter(track => Number.isSafeInteger(track?.trackId)).map(track => ({
        title: track.trackName, artist: track.artistName ?? null, cover: https(track.artworkUrl100?.replace(/100x100bb/, '200x200bb')),
        url: `https://music.apple.com/us/song/${track.trackId}`, preview: https(track.previewUrl),
      }))).catch(quiet('apple')),
  ]);
  const byName = new Map();
  for (const found of [...spotify, ...deezer, ...apple]) {
    // The whole title, "(Remix)" and all: only the same version is the same song.
    const key = `${plain(found.artist)}|${String(found.title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    const known = byName.get(key);
    if (!known) byName.set(key, found);
    else if (!known.preview && found.preview) known.preview = found.preview;
  }
  return [...byName.values()].slice(0, RESULTS);
}

/**
 * The same, kept: a song is looked up once (and again after `KEEP_DAYS`). Only a sure answer is kept: a guess is cheap to make again,
 * and may be bettered (Spotify's keys arriving, a new release on Deezer). A song the artist picked is kept apart from the plain
 * lookup (`source#isrc`), so one person's choice never changes what another sees for the same link.
 */
export async function lookupSongKept(raw, fetcher = fetch, picked = null) {
  const source = parseSource(raw);
  if (!source) return null;
  const pick = picked && PICK.test(picked) ? picked : null;
  const key = `${source.platform}:${source.id}${pick ? `#${pick}` : ''}`;
  const sql = db();
  const [kept] = await sql`select song from song_lookups where source = ${key} and (song->>'confident')::boolean
    and song->>'version' = ${String(LOOKUP_VERSION)} and looked_up_at > now() - make_interval(days => ${KEEP_DAYS})`;
  if (kept) {
    spotifyState = 'kept';
    return kept.song;
  }
  const song = await lookupSong(raw, fetcher, pick);
  if (song?.confident) {
    await sql`insert into song_lookups (source, song) values (${key}, ${JSON.stringify({ ...song, version: LOOKUP_VERSION })}::jsonb)
      on conflict (source) do update set song = excluded.song, looked_up_at = now()`;
  }
  return song;
}
