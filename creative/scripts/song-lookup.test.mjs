import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { alike, fitOf, fromVideoTitle, lookupSong, lookupSongKept, parseSource, searchSongs } from '../netlify/lib/song-lookup.mjs';
import { db } from '../netlify/lib/person.mjs';
import handler from '../netlify/functions/links-lookup.mjs';

/** Smart links, step one: one pasted link becomes the song and its link on every service. The services are answered from here. */

test('song links from Spotify, Apple Music and YouTube are read, and nothing else is', () => {
  assert.deepEqual(parseSource('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=abc'), { platform: 'spotify', id: '0VjIjW4GlUZAMYd2vXMi3b' });
  assert.deepEqual(parseSource('https://open.spotify.com/intl-de/track/3n3Ppam7vgaVa1iaRUc9Lp'), { platform: 'spotify', id: '3n3Ppam7vgaVa1iaRUc9Lp' });
  assert.deepEqual(parseSource('spotify:track:0VjIjW4GlUZAMYd2vXMi3b'), { platform: 'spotify', id: '0VjIjW4GlUZAMYd2vXMi3b' });
  assert.deepEqual(parseSource('https://music.apple.com/gb/album/after-hours/1499378108?i=1499378615'), { platform: 'apple', id: '1499378615', country: 'gb' });
  assert.deepEqual(parseSource('https://music.apple.com/us/song/blinding-lights/1499378615'), { platform: 'apple', id: '1499378615', country: 'us' });
  assert.deepEqual(parseSource('https://www.youtube.com/watch?v=4NRXx6U8ABQ&list=x'), { platform: 'youtube', id: '4NRXx6U8ABQ' });
  assert.deepEqual(parseSource('https://youtu.be/kJQP7kiw5Fk'), { platform: 'youtube', id: 'kJQP7kiw5Fk' });
  assert.deepEqual(parseSource('https://music.youtube.com/watch?v=kJQP7kiw5Fk'), { platform: 'youtube', id: 'kJQP7kiw5Fk' });
  for (const other of ['', 'hello', 'https://evil.example/track/0VjIjW4GlUZAMYd2vXMi3b', 'https://open.spotify.com/album/0VjIjW4GlUZAMYd2vXMi3b',
    'https://music.apple.com/us/album/after-hours/1499378108', 'javascript:alert(1)', 'https://open.spotify.com.evil.example/track/0VjIjW4GlUZAMYd2vXMi3b']) {
    assert.equal(parseSource(other), null, `${other} is not a song link`);
  }
});

test('a video title gives artist and title, and the channel stands in for a missing artist', () => {
  assert.deepEqual(fromVideoTitle('The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO'), { artist: 'The Weeknd', title: 'Blinding Lights' });
  assert.deepEqual(fromVideoTitle('Blinding Lights [Official Audio]', 'The Weeknd - Topic'), { artist: 'The Weeknd', title: 'Blinding Lights' });
  assert.deepEqual(fromVideoTitle('Despacito', 'LuisFonsiVEVO'), { artist: 'LuisFonsi', title: 'Despacito' });
});

test('the original beats its remix, cover and "versión", and the length breaks ties', () => {
  const seed = { title: 'Despacito', artist: 'Luis Fonsi', durationMs: 228_000 };
  const original = fitOf(seed, { title: 'Despacito', artist: 'Luis Fonsi & Daddy Yankee', durationMs: 229_000 });
  assert.ok(original > fitOf(seed, { title: 'Despacito (Versión Pop)', artist: 'Luis Fonsi', durationMs: 229_000 }));
  assert.ok(original > fitOf(seed, { title: 'Despacito (Remix)', artist: 'Luis Fonsi', durationMs: 228_000 }));
  assert.ok(original > fitOf(seed, { title: 'Despacito', artist: 'Some Cover Band', durationMs: 228_000 }));
  assert.equal(alike('Mr. Brightside', 'Mr Brightside'), 1);
  assert.equal(alike('Blinding Lights (feat. Nobody)', 'blinding lights'), 1);
});

const DEEZER = {
  id: 908604612, title: 'Blinding Lights', isrc: 'USUG11904206', link: 'https://www.deezer.com/track/908604612', duration: 200, rank: 984833,
  artist: { name: 'The Weeknd' }, album: { cover_xl: 'https://cdn.deezer.example/cover.jpg' },
};
const DEEZER_PREVIEW = 'https://cdnt-preview.dzcdn.net/blinding.mp3';
const COVER = { ...DEEZER, id: 1, title: 'Blinding Lights', isrc: 'GBXXX2000001', artist: { name: 'Loi' }, link: 'https://www.deezer.com/track/1', rank: 2000 };
const ITUNES = {
  wrapperType: 'track', trackId: 1499378615, trackName: 'Blinding Lights', artistName: 'The Weeknd', trackTimeMillis: 200_040,
  trackViewUrl: 'https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615&uo=4', previewUrl: 'https://audio.example/preview.m4a',
  artworkUrl100: 'https://art.example/100x100bb.jpg', collectionName: 'After Hours',
};
const REMIX = { ...ITUNES, trackId: 2, trackName: 'Blinding Lights (Remix)', artistName: 'The Weeknd & ROSALÍA', trackTimeMillis: 192_000 };

/** The services, as they answer; every request is kept. */
function services({ spotifyTitle = 'Blinding Lights' } = {}) {
  const asked = [];
  const fetcher = async (url) => {
    asked.push(String(url));
    const { hostname, pathname } = new URL(url);
    const json = (body) => Response.json(body);
    if (hostname === 'open.spotify.com') return json({ title: spotifyTitle, thumbnail_url: 'https://spotify.example/thumb.jpg' });
    if (hostname === 'accounts.spotify.com') return json({ access_token: 'token', expires_in: 3600 });
    if (hostname === 'api.spotify.com') {
      const q = new URL(url).searchParams.get('q');
      return json({ tracks: { items: q === `isrc:${DEEZER.isrc}` || q === 'blinding lights'
        ? [{ id: '0VjIjW4GlUZAMYd2vXMi3b', name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], album: { images: [{ url: 'https://i.scdn.co/a.jpg' }] }, preview_url: null, external_ids: { isrc: DEEZER.isrc } }] : [] } });
    }
    if (hostname === 'www.youtube.com') return json({ title: 'The Weeknd - Blinding Lights (Official Video)', author_name: 'TheWeekndVEVO' });
    if (hostname === 'api.deezer.com' && pathname.startsWith('/track/isrc:')) return json(pathname.endsWith(DEEZER.isrc) ? { ...DEEZER, preview: DEEZER_PREVIEW } : { error: {} });
    if (hostname === 'api.deezer.com' && pathname.startsWith('/track/')) return json(pathname === `/track/${DEEZER.id}` ? DEEZER : { error: {} });
    if (hostname === 'api.deezer.com') return json({ data: [COVER, DEEZER] });
    if (hostname === 'itunes.apple.com' && pathname === '/lookup') return json({ results: [{ wrapperType: 'collection' }, ITUNES] });
    if (hostname === 'itunes.apple.com') return json({ results: [REMIX, ITUNES] });
    return new Response('not here', { status: 404 });
  };
  return { fetcher, asked };
}

test('a YouTube link is matched exactly everywhere: Apple\'s preview and cover, Deezer by name, searches for the rest', async () => {
  const { fetcher } = services();
  const song = await lookupSong('https://youtu.be/4NRXx6U8ABQ', fetcher);
  assert.equal(song.source, 'youtube:4NRXx6U8ABQ');
  assert.deepEqual([song.artist, song.title, song.isrc, song.confident], ['The Weeknd', 'Blinding Lights', 'USUG11904206', true]);
  assert.equal(song.preview, 'https://audio.example/preview.m4a', 'Apple\'s preview, whose link does not expire');
  assert.equal(song.cover, 'https://art.example/1000x1000bb.jpg', 'the large cover');
  assert.deepEqual(song.links.apple, { url: 'https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615', exact: true }, 'not the remix');
  assert.deepEqual(song.links.deezer, { url: DEEZER.link, exact: true }, 'not the cover version');
  assert.equal(song.links.youtube.url, 'https://www.youtube.com/watch?v=4NRXx6U8ABQ');
  assert.deepEqual(song.links.tidal, { url: 'https://tidal.com/search?q=The%20Weeknd%20blinding%20lights', exact: false });
  assert.equal(song.links.spotify.exact, false, 'without its keys Spotify can only be searched');
  assert.equal(song.candidates, undefined);
});

test('an Apple Music link is sure of itself and goes straight to Deezer by name', async () => {
  const { fetcher, asked } = services();
  const song = await lookupSong('https://music.apple.com/us/album/after-hours/1499378108?i=1499378615', fetcher);
  assert.deepEqual([song.artist, song.title, song.confident, song.links.apple.exact, song.links.deezer.exact], ['The Weeknd', 'Blinding Lights', true, true, true]);
  assert.ok(!asked.some(url => url.includes('itunes.apple.com/search')), 'Apple is not searched for what the link already said');
});

test('a Spotify link without keys is only a guess until the artist picks the song, and then it is exact', async () => {
  const { fetcher } = services();
  const guess = await lookupSong('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', fetcher);
  assert.equal(guess.confident, false);
  assert.deepEqual(guess.candidates.map(c => c.artist), ['The Weeknd', 'Loi'], 'the more played one first, whatever order Deezer gave');
  assert.deepEqual(guess.links.spotify, { url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', exact: true });
  assert.equal(guess.links.apple.exact, false, 'a guess is not a link');
  assert.equal(guess.links.deezer.exact, false);

  const picked = await lookupSong('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', fetcher, 'USUG11904206');
  assert.deepEqual([picked.artist, picked.confident, picked.links.apple.exact, picked.links.deezer.url], ['The Weeknd', true, true, DEEZER.link]);
  const wrong = await lookupSong('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', services({ spotifyTitle: 'Another Song' }).fetcher, 'USUG11904206');
  assert.equal(wrong.confident, false, 'a pick with a different title is not believed');

  // Deezer's real search leaves the ISRC out: the candidate is then picked by its Deezer track, whose page has it.
  assert.equal(guess.candidates[0].pick, 'USUG11904206');
  const byTrack = await lookupSong('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', fetcher, `deezer:${DEEZER.id}`);
  assert.deepEqual([byTrack.artist, byTrack.isrc, byTrack.confident, byTrack.links.deezer.url], ['The Weeknd', 'USUG11904206', true, DEEZER.link]);
});

test('a Deezer link is sure of itself, and its ISRC gives Apple and Deezer exactly', async () => {
  assert.deepEqual(parseSource('https://www.deezer.com/en/track/908604612'), { platform: 'deezer', id: '908604612' });
  assert.equal(parseSource('https://www.deezer.com/album/908604612'), null);
  const song = await lookupSong('https://www.deezer.com/track/908604612', services().fetcher);
  assert.deepEqual([song.source, song.artist, song.isrc, song.confident], ['deezer:908604612', 'The Weeknd', 'USUG11904206', true]);
  assert.deepEqual([song.links.deezer.url, song.links.apple.exact], [DEEZER.link, true]);
});

/** Runs `work` with Spotify's keys set, as on staging and mumoo.app. */
async function withSpotifyKeys(work) {
  const kept = { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET };
  Object.assign(process.env, { SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: 'secret' });
  try { await work(); } finally {
    for (const [name, value] of [['SPOTIFY_CLIENT_ID', kept.id], ['SPOTIFY_CLIENT_SECRET', kept.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('with Spotify\'s keys, a song from any link gets its own Spotify page, found by its ISRC', async () => {
  await withSpotifyKeys(async () => {
    const song = await lookupSong('https://youtu.be/4NRXx6U8ABQ', services().fetcher);
    assert.deepEqual(song.links.spotify, { url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', exact: true });
  });
});

test('a typed name finds songs on every service, each listed once, with a preview from whichever has one', async () => {
  const plainly = await searchSongs('blinding lights', services().fetcher);
  assert.deepEqual(plainly.map(found => `${found.artist}: ${found.title}`), ['Loi: Blinding Lights', 'The Weeknd: Blinding Lights', 'The Weeknd & ROSALÍA: Blinding Lights (Remix)']);
  assert.equal(plainly[1].url, DEEZER.link, 'chosen by its Deezer link');
  assert.equal(plainly[1].preview, ITUNES.previewUrl, 'Apple\'s preview, as Deezer gave none');
  assert.equal(plainly[2].url, 'https://music.apple.com/us/song/2', 'a song only Apple has is looked up by its Apple link');
  assert.deepEqual(await searchSongs(' ', services().fetcher), []);
  await withSpotifyKeys(async () => {
    const withSpotify = await searchSongs('blinding lights', services().fetcher);
    assert.equal(withSpotify[0].url, 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', 'Spotify first: it knows new releases first');
    assert.equal(withSpotify[0].preview, DEEZER_PREVIEW, 'Spotify gives no preview: Deezer\'s, by the ISRC');
    assert.equal(withSpotify.filter(found => found.artist === 'The Weeknd' && found.title === 'Blinding Lights').length, 1);
  });
});

test('a sure song is looked up once, a guess every time, and an artist\'s pick is kept apart from what everyone else sees', { skip: !process.env.DATABASE_URL, timeout: 30000 }, async () => {
  const sql = db();
  const id = randomUUID().replace(/-/g, '').slice(0, 22);
  const url = `https://open.spotify.com/track/${id}`;
  try {
    await lookupSongKept(url, services().fetcher);
    const guessAgain = services();
    assert.equal((await lookupSongKept(url, guessAgain.fetcher)).confident, false);
    assert.ok(guessAgain.asked.length > 0, 'a guess is not kept, so it can be bettered');

    assert.equal((await lookupSongKept(url, services().fetcher, 'USUG11904206')).confident, true);
    const pickAgain = services();
    assert.equal((await lookupSongKept(url, pickAgain.fetcher, 'USUG11904206')).confident, true);
    assert.equal(pickAgain.asked.length, 0, 'a sure answer is kept: the second time nothing is asked');
    assert.equal((await lookupSongKept(url, services().fetcher)).confident, false, 'the plain lookup is unchanged by the pick');
  } finally {
    await sql`delete from song_lookups where source like ${`spotify:${id}%`}`;
  }
});

test('/api/links/lookup looks up only song links', async () => {
  const response = await handler(new Request('https://example.test/api/links/lookup', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/x' }) }));
  assert.ok([400, 503].includes(response.status));
  assert.equal((await handler(new Request('https://example.test/api/links/lookup'))).status, 405);
});
