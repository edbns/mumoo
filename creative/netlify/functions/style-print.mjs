import { validAccess } from '../lib/access.mjs';
import { note } from '../lib/service-health.mjs';
import { clipMs, maxBytes } from '../lib/clip-wav.mjs';
import { countUnknown, storeTempo, validTempo } from '../lib/style-prints.mjs';
import { siteOf, modal } from '../lib/sites.mjs';

/**
 * Genre learning, step one: start the sound print of the selected clip (10 to 15 s of mono 48 kHz WAV, up to ~1.4 MB) and return
 * its job id at once; style-print-status keeps it with the style once it is ready.
 * A JSON body { version: 1, unknown: true } instead counts one "I don't know", with nothing about the song, and
 * { version: 1, tempo: { sourceSha256, offsetMs, bpm, energy } } keeps the song reader's tempo and loudness of the clip.
 */
const MODAL_SUBMIT = () => modal('mumoo-sound-print-staging-submit');
const RATE = 48_000;
const headers = { 'Cache-Control': 'no-store' };
const error = (status, message) => Response.json({ error: message }, { status, headers });

export default async function stylePrint(request, context) {
  const site = siteOf(request);
  if (!site) {
    return error(404, 'Not available here.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== site.origin) return error(403, 'Open mumoo.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Access is invalid or expired.');
  }
  const type = request.headers.get('content-type') || '';
  if (Number(request.headers.get('content-length') || 0) > maxBytes(RATE)) return error(413, 'The clip is too large.');

  if (/^application\/json(?:\s*;|$)/i.test(type)) {
    const data = await request.json().catch(() => null);
    if (data?.version === 1 && data.unknown === true) await countUnknown();
    else if (data?.version === 1 && validTempo(data.tempo)) await storeTempo(data.tempo);
    else return error(400, 'Invalid request.');
    return new Response(null, { status: 204, headers });
  }

  if (!/^audio\/wav(?:\s*;|$)/i.test(type)) return error(415, 'Expected a WAV clip.');
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Genre learning is not configured.');
  const audio = await request.arrayBuffer();
  if (clipMs(audio, RATE) === null) return error(400, 'Expected 10 to 15 seconds of mono 48 kHz WAV.');
  const startedAt = Date.now();
  try {
    const response = await fetch(MODAL_SUBMIT(), {
      method: 'POST', body: audio, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}`, 'Content-Type': 'audio/wav' },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') { await note(context, 'genre', true, startedAt); return Response.json({ id: result.id }, { status: 202, headers }); }
    if ([400, 413].includes(response.status)) return error(response.status, 'The sound print worker could not take this clip.');
    await note(context, 'genre', false, startedAt);
    return error(502, 'The sound print worker could not take this clip.');
  } catch {
    await note(context, 'genre', false, startedAt);
    return error(504, 'The sound print worker did not respond in time.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
