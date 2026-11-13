import { adminFrom, refuse, reply } from '../lib/admin.mjs';
import { db } from '../lib/person.mjs';
import { CALL_ID, CLIP_WAV_SIZE, PRINT_WORKER, loadPrints, readiness, storePrint, validLabel, validPrint } from '../lib/style-prints.mjs';

/**
 * /api/admin/genre: the admin teaches the brain genres from songs whose style they know, before creators do.
 * The admin's browser cuts the clips; the sound print worker prints them; only the print, the song's hash and the style are kept.
 *   GET: the songs it can learn from, per sub-genre, and how ready the guess is.
 *   POST (one 15 s mono 48 kHz WAV clip): starts its print, returns { id }.
 *   PUT { id, label } (label.source 'seeded'): 202 while printing; then keeps the print with the style.
 *   DELETE ?song=<sha256>: forgets every clip of a song (a wrong style).
 */
const SHA = /^[a-f0-9]{64}$/;
const bridge = () => process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';

export default async function handler(request) {
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  try {
    if (request.method === 'GET') return reply(200, await overview());
    if (request.method === 'DELETE') {
      const song = new URL(request.url).searchParams.get('song') ?? '';
      if (!SHA.test(song)) return refuse(400, 'Which song?');
      await db()`delete from style_prints where source_sha256 = ${song}`;
      return reply(200, await overview());
    }
    if (bridge().length < 32) return refuse(503, 'Genre learning is not configured.');
    if (request.method === 'POST') return await start(request);
    if (request.method === 'PUT') return await keep(request);
    return refuse(405, 'Use GET, POST, PUT or DELETE.');
  } catch (cause) {
    console.error('admin genre:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

async function overview() {
  const rows = await loadPrints();
  const songs = new Map();
  for (const row of rows) {
    const song = songs.get(row.source_sha256) ?? { song: row.source_sha256, style: row.style, genre: row.genre, subGenre: row.sub_genre, source: row.source, clips: 0, at: row.created_at };
    song.clips += 1;
    if (row.created_at > song.at) Object.assign(song, { style: row.style, genre: row.genre, subGenre: row.sub_genre, source: row.source, at: row.created_at });
    songs.set(row.source_sha256, song);
  }
  const groups = new Map();
  for (const song of songs.values()) {
    const key = `${song.genre}\n${song.subGenre}`;
    const group = groups.get(key) ?? { genre: song.genre, subGenre: song.subGenre, songs: 0 };
    group.songs += 1;
    groups.set(key, group);
  }
  return {
    ready: readiness(rows),
    groups: [...groups.values()].sort((a, b) => b.songs - a.songs || a.genre.localeCompare(b.genre) || a.subGenre.localeCompare(b.subGenre)),
    songs: [...songs.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 300),
  };
}

async function start(request) {
  if (!/^audio\/wav(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return refuse(415, 'Expected a WAV clip.');
  if (Number(request.headers.get('content-length') || 0) > CLIP_WAV_SIZE) return refuse(413, 'The clip is too large.');
  const audio = await request.arrayBuffer();
  if (audio.byteLength !== CLIP_WAV_SIZE) return refuse(400, 'Expected exactly 15 seconds of mono 48 kHz WAV.');
  const response = await fetch(PRINT_WORKER.SUBMIT, {
    method: 'POST', body: audio, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${bridge()}`, 'Content-Type': 'audio/wav' },
  });
  const result = await response.json().catch(() => null);
  if (response.ok && typeof result?.id === 'string') return reply(202, { id: result.id });
  return refuse(502, 'The sound print worker could not take this clip.');
}

async function keep(request) {
  const data = await request.json().catch(() => null);
  if (!CALL_ID.test(data?.id ?? '') || !validLabel(data.label) || data.label.source !== 'seeded') return refuse(400, 'Invalid request.');
  const response = await fetch(`${PRINT_WORKER.STATUS}?id=${encodeURIComponent(data.id)}`, {
    redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${bridge()}` },
  });
  if (response.status === 202) return reply(202, { status: 'running' });
  if (response.status === 410) return refuse(410, 'This print expired.');
  if (!response.ok) return refuse(502, 'The sound print job failed.');
  const result = await response.json().catch(() => null);
  if (result?.version === 1 && result.status === 'unavailable') return reply(200, { status: 'skipped' });
  if (!validPrint(result)) return refuse(502, 'The sound print worker returned an invalid result.');
  await storePrint(data.label, result);
  return reply(200, { status: 'stored' });
}

export const config = { path: '/api/admin/genre', rateLimit: { windowSize: 60, windowLimit: 300, aggregateBy: ['ip'] } };
