import { validAccess } from '../lib/access.mjs';
import { note } from '../lib/service-health.mjs';
import { personFrom } from '../lib/person.mjs';
import { submitLabel, voterOf } from '../lib/style-learning.mjs';
import { CHECK_ANSWERS, GUESS_ANSWERS, blendGuess, checkPick, countCheckAnswer, countGuessAnswer, guardrailsOn, loadPrints, loadTempo, validLabel, validPrint } from '../lib/style-prints.mjs';
import { siteOf, modal } from '../lib/sites.mjs';

/**
 * Genre learning, step two: ask for a sound print job (from style-print). 202 while it runs. Only answers go back to the
 * browser, never the print. Three bodies, each { version: 1, id, … }:
 *   label: { sourceSha256, offsetMs, style, genre, subGenre, source: 'creator' }: once ready, the print waits with the style.
 *   guess: { sourceSha256, offsetMs }: "I don't know"; returns the brain's guess, or null when it is not sure. Nothing is kept.
 *   answer: 'yes' | 'no' | 'unsure', style, clip: { sourceSha256, offsetMs }: the creator's answer to the guess they were shown
 *     (`style`). The guess is made again here and must still be that style: "yes" leaves the print with it as 'confirmed';
 *     "no" and "unsure" are only counted.
 * A guess or an answer with `picked: { style, genre, subGenre }` is the check of a creator's own pick: the guess is offered only when
 * the brain is very sure it is another genre (else the print is left with the pick at once, and the guess is null). Answering it,
 * "yes" switches (the print is left with the guess as 'corrected'), "no" keeps the pick (left as the creator's), "unsure" leaves nothing.
 * Nothing left here teaches the brain yet: it waits for the daily check (`style-learning.mjs`), with a code for the signed-in
 * account (Authorization, optional) and the song, so each account is one voice per song.
 * With the tempo guardrails on, the clip's tempo (kept from style-print) nudges the guess; it may arrive between the question
 * and the answer, so an answer stands for the guess made with it or without it.
 */
const MODAL_STATUS = () => modal('mumoo-sound-print-staging-status');
const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;
const LIMIT = 4096;
const headers = { 'Cache-Control': 'no-store' };
const error = (status, message) => Response.json({ error: message }, { status, headers });
const validClip = clip => validLabel({ ...clip, style: '-', genre: '-', subGenre: '-', source: 'creator' });
const validPicked = (clip, picked) => picked === undefined || validLabel({ ...clip, ...picked, source: 'creator' });

export default async function stylePrintStatus(request, context) {
  const site = siteOf(request);
  if (!site) {
    return error(404, 'Not available here.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== site.origin) return error(403, 'Open mumoo.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Access is invalid or expired.');
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
  if (!kind || (kind !== 'label' && !validPicked(kind === 'guess' ? data.guess : data.clip, data.picked))) return error(400, 'Invalid request.');
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Genre learning is not configured.');

  let response;
  const startedAt = Date.now();
  const noted = ok => note(context, 'genre', ok, startedAt);
  try {
    response = await fetch(`${MODAL_STATUS()}?id=${encodeURIComponent(data.id)}`, {
      redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
  } catch {
    await noted(false);
    return error(504, 'The sound print worker did not respond in time.');
  }
  if (response.status === 202) return Response.json({ status: 'running' }, { status: 202, headers });
  if (response.status === 410) return error(410, 'This print expired.');
  if (!response.ok) { await noted(false); return error(502, 'The sound print job failed.'); }
  const result = await response.json().catch(() => null);
  if (result?.version === 1 && result.status === 'unavailable') { await noted(true); return Response.json({ status: 'skipped' }, { headers }); }
  if (!validPrint(result)) { await noted(false); return error(502, 'The sound print worker returned an invalid result.'); }
  await noted(true);
  const voter = voterOf(await personFrom(request).catch(() => null), (kind === 'label' ? data.label : kind === 'guess' ? data.guess : data.clip).sourceSha256, bridgeSecret);
  const leave = label => submitLabel(label, result, voter);
  if (kind === 'label') {
    await leave(data.label);
    return Response.json({ status: 'waiting' }, { headers });
  }

  const clip = kind === 'guess' ? data.guess : data.clip;
  const guardrails = guardrailsOn();
  const tempo = guardrails ? await loadTempo(clip) : null;
  const rows = await loadPrints();
  /** The guess with the clip's tempo first, then without it. */
  const guesses = make => [make({ guardrails, tempo }), ...(tempo ? [make({ guardrails, tempo: null })] : [])];
  if (data.picked) {
    const { style, genre, subGenre } = data.picked;
    const picked = { sourceSha256: clip.sourceSha256, offsetMs: clip.offsetMs, style, genre, subGenre, source: 'creator' };
    const offers = guesses(options => checkPick(result.values, rows, clip.sourceSha256, picked, options));
    if (kind === 'guess') {
      if (!offers[0]) await leave(picked);
      return Response.json({ status: 'guessed', guess: offers[0] }, { headers });
    }
    const offer = offers.find(item => item?.style === data.style);
    if (!offer) return error(409, 'The guess for this clip has changed.');
    if (data.answer === 'yes') await leave({ ...picked, ...offer, source: 'corrected' });
    if (data.answer === 'no') await leave(picked);
    await countCheckAnswer(style, offer.style, CHECK_ANSWERS[data.answer]);
    return Response.json({ status: data.answer === 'unsure' ? 'counted' : 'waiting' }, { headers });
  }
  const made = guesses(options => blendGuess(result.values, rows, clip.sourceSha256, options));
  if (kind === 'guess') return Response.json({ status: 'guessed', guess: made[0] }, { headers });
  const guess = made.find(item => item?.style === data.style);
  if (!guess) return error(409, 'The guess for this clip has changed.');
  if (data.answer === 'yes') await leave({ ...clip, ...guess, source: 'confirmed' });
  await countGuessAnswer(guess.style, data.answer);
  return Response.json({ status: data.answer === 'yes' ? 'waiting' : 'counted' }, { headers });
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
