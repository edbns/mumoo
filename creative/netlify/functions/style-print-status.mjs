import { validAccess } from '../lib/access.mjs';
import { GUESS_ANSWERS, countGuessAnswer, guessStyle, loadPrints, storePrint, validLabel, validPrint } from '../lib/style-prints.mjs';

/**
 * Genre learning, step two: ask for a sound print job (from style-print). 202 while it runs. Only answers go back to the
 * browser, never the print. Three bodies, each { version: 1, id, … }:
 *   label: { sourceSha256, offsetMs, style, genre, subGenre, source: 'creator' }: once ready, the print is kept with the style.
 *   guess: { sourceSha256, offsetMs }: "I don't know"; returns the brain's guess, or null when it is not sure. Nothing is kept.
 *   answer: 'yes' | 'no' | 'unsure', style, clip: { sourceSha256, offsetMs }: the creator's answer to the guess they were shown
 *     (`style`). The guess is made again here and must still be that style: "yes" keeps the print with it as 'confirmed';
 *     "no" and "unsure" are only counted.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_STATUS = 'https://edbns-mumoo-staging--mumoo-sound-print-staging-status.us-east.modal.run';
const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;
const LIMIT = 4096;
const headers = { 'Cache-Control': 'no-store' };
const error = (status, message) => Response.json({ error: message }, { status, headers });
const validClip = clip => validLabel({ ...clip, style: '-', genre: '-', subGenre: '-', source: 'creator' });

export default async function stylePrintStatus(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Genre learning is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return error(415, 'Expected JSON.');
  if (Number(request.headers.get('content-length') || 0) > LIMIT) return error(413, 'Request too large.');
  const data = await request.json().catch(() => null);
  if (data?.version !== 1 || !CALL_ID.test(data.id ?? '')) return error(400, 'Invalid request.');
  // A creator's own pick is the only label the browser may give; a guess is always made here.
  const kind = data.label !== undefined ? (validLabel(data.label) && data.label.source === 'creator' ? 'label' : null)
    : data.guess !== undefined ? (validClip(data.guess) ? 'guess' : null)
    : data.answer !== undefined ? (GUESS_ANSWERS.includes(data.answer) && validClip(data.clip) && typeof data.style === 'string' ? 'answer' : null)
    : null;
  if (!kind) return error(400, 'Invalid request.');
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Genre learning is not configured.');

  let response;
  try {
    response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(data.id)}`, {
      redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
  } catch {
    return error(504, 'The sound print worker did not respond in time.');
  }
  if (response.status === 202) return Response.json({ status: 'running' }, { status: 202, headers });
  if (response.status === 410) return error(410, 'This print expired.');
  if (!response.ok) return error(502, 'The sound print job failed.');
  const result = await response.json().catch(() => null);
  if (result?.version === 1 && result.status === 'unavailable') return Response.json({ status: 'skipped' }, { headers });
  if (!validPrint(result)) return error(502, 'The sound print worker returned an invalid result.');
  if (kind === 'label') {
    await storePrint(data.label, result);
    return Response.json({ status: 'stored' }, { headers });
  }

  const clip = kind === 'guess' ? data.guess : data.clip;
  const guess = guessStyle(result.values, await loadPrints(), clip.sourceSha256);
  if (kind === 'guess') return Response.json({ status: 'guessed', guess }, { headers });
  if (guess?.style !== data.style) return error(409, 'The guess for this clip has changed.');
  if (data.answer === 'yes') await storePrint({ ...clip, ...guess, source: 'confirmed' }, result);
  await countGuessAnswer(guess.style, data.answer);
  return Response.json({ status: data.answer === 'yes' ? 'stored' : 'counted' }, { headers });
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
