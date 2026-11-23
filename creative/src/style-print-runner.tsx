import { useEffect, useState } from 'react';
import type { ClipIdentity, MusicAnalysisV1 } from './creative-profile';
import type { Style } from './style-search';
import { encodePcmWav } from './staging-alignment';
import { trace } from './staging-diagnostics';
import { withAccess } from './staging-token';

/** Once per clip and answer in a session: going back and forth between steps sends nothing again. */
const sent = new Set<string>();
const POLL_MS = 3000;
const GIVE_UP_MS = 120_000;
const CUT_OFF_GRACE_MS = 15_000;
/** The sound print hears 48 kHz (a 16 kHz clip prints as another song); the song is decoded at 44.1 kHz. */
const RATE = 48_000;

const post = (accessToken: string, signal: AbortSignal, url: string, type: string, body: BodyInit) => withAccess(accessToken, access => fetch(url, {
  method: 'POST', signal, headers: { 'Content-Type': type, 'X-Mumoo-Brain-Access': access }, body,
}));

/** Starts the sound print of the selected clip and returns its job id. */
async function startPrint(accessToken: string, signal: AbortSignal, audio: AudioBuffer, { offsetMs, durationMs }: ClipIdentity): Promise<string> {
  const context = new OfflineAudioContext(1, durationMs * RATE / 1000, RATE);
  const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination); source.start(0, offsetMs / 1000);
  const rendered = await context.startRendering();
  const started = await post(accessToken, signal, '/.netlify/functions/style-print', 'audio/wav', encodePcmWav(rendered.getChannelData(0), RATE));
  const job = await started.json().catch(() => null);
  if (started.status !== 202 || typeof job?.id !== 'string') throw new Error('not started');
  return job.id;
}

/** Asks for a print job until it is done; the last response, or null after two minutes. */
async function askUntilDone(accessToken: string, signal: AbortSignal, body: object): Promise<Response | null> {
  for (const deadline = Date.now() + GIVE_UP_MS; Date.now() < deadline;) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    if (signal.aborted) return null;
    const response = await post(accessToken, signal, '/.netlify/functions/style-print-status', 'application/json', JSON.stringify(body));
    if (response.status !== 202) return response;
  }
  return null;
}

/** "I don't know" is counted once per clip in a session; a picked style is printed and kept by its check (`useStyleGuess`). */
export function StylePrintRunner({ clip, accessToken }: { clip: ClipIdentity; accessToken: string }) {
  const { sourceSha256, offsetMs } = clip;
  useEffect(() => {
    if (!accessToken) return;
    const key = `${sourceSha256}:${offsetMs}:?`;
    if (sent.has(key)) return;
    sent.add(key);
    const controller = new AbortController();
    void post(accessToken, controller.signal, '/.netlify/functions/style-print', 'application/json', JSON.stringify({ version: 1, unknown: true }))
      .then(response => { if (!response.ok) sent.delete(key); }, () => sent.delete(key));
    return () => controller.abort();
  }, [sourceSha256, offsetMs, accessToken]);
  return null;
}

/** The song reader's tempo and loudness of the clip, kept once per clip in a session beside its print, to learn from later. */
export function useClipTempo(accessToken: string, clip: ClipIdentity, analysis: MusicAnalysisV1 | null) {
  const { sourceSha256, offsetMs } = clip;
  const tempo = analysis?.rhythm.tempo;
  const raw = tempo?.gridBpm ?? tempo?.bpm ?? null;
  const bpm = raw !== null && Number.isFinite(raw) && raw > 0 && raw <= 400 ? Math.round(raw * 10) / 10 : null;
  const frames = analysis?.features.frames ?? [];
  const energy = frames.length ? Math.round(Math.min(1, Math.max(0, frames.reduce((sum, frame) => sum + frame.rms, 0) / frames.length)) * 1000) / 1000 : null;
  useEffect(() => {
    if (!accessToken || !analysis || !sourceSha256 || (bpm === null && energy === null)) return;
    const key = `${sourceSha256}:${offsetMs}:tempo`;
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify({ version: 1, tempo: { sourceSha256, offsetMs, bpm, energy } });
    void post(accessToken, new AbortController().signal, '/.netlify/functions/style-print', 'application/json', body)
      .then(response => { if (!response.ok) sent.delete(key); }, () => sent.delete(key));
  }, [accessToken, analysis, sourceSha256, offsetMs, bpm, energy]);
}

export type GuessAnswer = 'yes' | 'no' | 'unsure';
/**
 * "We think it sounds like…" for a creator who does not know their genre, or "This sounds more like…" when the brain is very
 * sure a creator's pick is another genre: `listening` while the clip is printed and compared, `none` when there is nothing to
 * ask (not sure, the pick sounds right, or the clip could not be heard), `asking` with its guess, `answered` after.
 */
export type StyleGuess =
  | { status: 'idle' | 'listening' | 'none' }
  | { status: 'asking'; style: Style }
  | { status: 'answered'; style: Style; answer: GuessAnswer };

/** Each clip (with its pick) is guessed and answered once in a session. */
const guesses = new Map<string, { state: StyleGuess; id?: string }>();
/** `?preview-guess` on the page: a made-up guess, to see the question before the brain is sure of any; nothing is sent. */
const PREVIEW = new URLSearchParams(location.search).has('preview-guess');
const PREVIEW_STYLE: Style = { name: 'Afrobeats', genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats' };

/**
 * The brain's guess of the style of the selected clip, asked once `enabled`, and how to answer it. With no pick only "yes"
 * teaches the brain (the server keeps the print with its own guess). With a `picked` style "yes" switches to the guess and
 * "no" keeps the pick, both kept; a pick the brain does not question is kept straight away.
 */
export function useStyleGuess(accessToken: string, audio: AudioBuffer | undefined, clip: ClipIdentity, enabled: boolean, picked?: Style): [StyleGuess, (answer: GuessAnswer) => void] {
  const { sourceSha256, offsetMs, durationMs } = clip;
  const key = `${sourceSha256}:${offsetMs}:${picked?.name ?? '?'}`;
  const pick = picked ? { style: picked.name, genre: picked.genre, subGenre: picked.subGenre } : undefined;
  const [, rerender] = useState(0);
  const entry = guesses.get(key);
  useEffect(() => {
    if (!enabled || !accessToken || !audio || !sourceSha256 || guesses.has(key)) return;
    const set = (state: StyleGuess, id?: string) => { guesses.set(key, { state, id }); rerender(count => count + 1); };
    set({ status: 'listening' });
    if (PREVIEW) {
      const timer = setTimeout(() => set({ status: 'asking', style: PREVIEW_STYLE }), 3000);
      return () => { clearTimeout(timer); if (guesses.get(key)?.state.status === 'listening') guesses.delete(key); };
    }
    const controller = new AbortController();
    const { signal } = controller;
    // The creatives wait on the guess: a request the browser leaves hanging is cut off, and the guess is not asked.
    const cutOff = setTimeout(() => {
      controller.abort();
      trace('style_guess', { category: 'cut_off' });
      set({ status: 'none' });
    }, GIVE_UP_MS + CUT_OFF_GRACE_MS);
    void (async () => {
      try {
        const id = await startPrint(accessToken, signal, audio, { sourceSha256, offsetMs, durationMs });
        const response = await askUntilDone(accessToken, signal, { version: 1, id, guess: { sourceSha256, offsetMs }, ...(pick && { picked: pick }) });
        const result = response?.ok ? await response.json().catch(() => null) : null;
        const guess = result?.status === 'guessed' ? result.guess : null;
        if (signal.aborted) return;
        trace(pick ? 'style_check' : 'style_guess', { category: guess ? 'asked' : result?.status === 'guessed' ? 'not_sure' : response ? `http_${response.status}` : 'timeout' });
        set(guess ? { status: 'asking', style: { name: guess.style, genre: guess.genre, subGenre: guess.subGenre } } : { status: 'none' }, id);
      } catch {
        if (signal.aborted) return;
        trace('style_guess', { category: 'failed' });
        set({ status: 'none' });
      } finally {
        clearTimeout(cutOff);
      }
    })();
    return () => {
      clearTimeout(cutOff);
      controller.abort();
      if (guesses.get(key)?.state.status === 'listening') guesses.delete(key);
    };
  // `key` holds the pick: a new pick is checked afresh.
  }, [enabled, accessToken, audio, sourceSha256, offsetMs, durationMs, key]);

  function answer(given: GuessAnswer) {
    const current = guesses.get(key);
    if (current?.state.status !== 'asking') return;
    const { style } = current.state;
    guesses.set(key, { ...current, state: { status: 'answered', style, answer: given } });
    rerender(count => count + 1);
    if (!current.id) return;
    const body = { version: 1, id: current.id, answer: given, style: style.name, clip: { sourceSha256, offsetMs }, ...(pick && { picked: pick }) };
    void post(accessToken, new AbortController().signal, '/.netlify/functions/style-print-status', 'application/json', JSON.stringify(body))
      .then(response => trace('style_guess', { category: response.ok ? `answered_${given}` : `http_${response.status}` }),
        () => trace('style_guess', { category: 'answer_failed' }));
  }

  return [enabled ? entry?.state ?? { status: 'idle' } : { status: 'idle' }, answer];
}
