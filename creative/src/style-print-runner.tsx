import { useEffect, useState } from 'react';
import { DURATION_MS } from './composition';
import type { ClipIdentity } from './creative-profile';
import type { Style } from './style-search';
import { encodePcmWav } from './staging-alignment';
import { trace } from './staging-diagnostics';
import { withAccess } from './staging-token';

/** Once per clip and answer in a session: going back and forth between steps sends nothing again. */
const sent = new Set<string>();
const POLL_MS = 3000;
const GIVE_UP_MS = 120_000;
/** The sound print hears 48 kHz (a 16 kHz clip prints as another song); the song is decoded at 44.1 kHz. */
const RATE = 48_000;

const post = (accessToken: string, signal: AbortSignal, url: string, type: string, body: BodyInit) => withAccess(accessToken, access => fetch(url, {
  method: 'POST', signal, headers: { 'Content-Type': type, 'X-Mumoo-Brain-Access': access }, body,
}));

/** Starts the sound print of the selected 15 s and returns its job id. */
async function startPrint(accessToken: string, signal: AbortSignal, audio: AudioBuffer, offsetMs: number): Promise<string> {
  const context = new OfflineAudioContext(1, DURATION_MS * RATE / 1000, RATE);
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

/**
 * Genre learning on staging: the creator's answer to "What kind of music is it?" teaches the brain how that style sounds.
 * A picked style sends the selected 15 s to be printed and kept with it; "I don't know" only counts the press.
 */
export function StylePrintRunner({ audio, clip, style, unknown, accessToken }: { audio: AudioBuffer; clip: ClipIdentity; style?: Style; unknown: boolean; accessToken: string }) {
  const { sourceSha256, offsetMs } = clip;
  const name = style?.name;
  useEffect(() => {
    if (!accessToken || (!style && !unknown)) return;
    const key = `${sourceSha256}:${offsetMs}:${style?.name ?? '?'}`;
    if (sent.has(key)) return;
    sent.add(key);
    const controller = new AbortController();
    const { signal } = controller;
    let finished = false;
    void (async () => {
      try {
        if (!style) {
          finished = (await post(accessToken, signal, '/.netlify/functions/style-print', 'application/json', JSON.stringify({ version: 1, unknown: true }))).ok;
          return;
        }
        const id = await startPrint(accessToken, signal, audio, offsetMs);
        const label = { sourceSha256, offsetMs, style: style.name, genre: style.genre, subGenre: style.subGenre, source: 'creator' };
        const response = await askUntilDone(accessToken, signal, { version: 1, id, label });
        if (!response) {
          if (!signal.aborted) trace('style_print', { category: 'timeout' });
          return;
        }
        const result = await response.json().catch(() => null);
        finished = response.ok;
        trace('style_print', { category: response.ok ? result?.status : `http_${response.status}` });
      } catch {
        if (!signal.aborted) trace('style_print', { category: 'failed' });
      } finally {
        if (!finished) sent.delete(key);
      }
    })();
    return () => controller.abort();
  // A clip and its answer are sent once per mounted runner; the parent keys it by both.
  }, [audio, sourceSha256, offsetMs, name, unknown, accessToken]);
  return null;
}

export type GuessAnswer = 'yes' | 'no' | 'unsure';
/**
 * "We think it sounds like…" for a creator who does not know their genre: `listening` while the clip is printed and
 * compared, `none` when the brain is not sure enough to ask (or could not hear it), `asking` with its guess, `answered` after.
 */
export type StyleGuess =
  | { status: 'idle' | 'listening' | 'none' }
  | { status: 'asking'; style: Style }
  | { status: 'answered'; style: Style; answer: GuessAnswer };

/** Each clip is guessed and answered once in a session. */
const guesses = new Map<string, { state: StyleGuess; id?: string }>();

/**
 * The brain's guess of the style of the selected 15 s, asked once `enabled`, and how to answer it. Only "yes" teaches
 * the brain (the server keeps the print with its own guess); "no" and "not sure" are only counted.
 */
export function useStyleGuess(accessToken: string, audio: AudioBuffer | undefined, clip: ClipIdentity, enabled: boolean): [StyleGuess, (answer: GuessAnswer) => void] {
  const { sourceSha256, offsetMs } = clip;
  const key = `${sourceSha256}:${offsetMs}`;
  const [, rerender] = useState(0);
  const entry = guesses.get(key);
  useEffect(() => {
    if (!enabled || !accessToken || !audio || !sourceSha256 || guesses.has(key)) return;
    const set = (state: StyleGuess, id?: string) => { guesses.set(key, { state, id }); rerender(count => count + 1); };
    set({ status: 'listening' });
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const id = await startPrint(accessToken, signal, audio, offsetMs);
        const response = await askUntilDone(accessToken, signal, { version: 1, id, guess: { sourceSha256, offsetMs } });
        const result = response?.ok ? await response.json().catch(() => null) : null;
        const guess = result?.status === 'guessed' ? result.guess : null;
        if (signal.aborted) return;
        trace('style_guess', { category: guess ? 'asked' : result?.status === 'guessed' ? 'not_sure' : response ? `http_${response.status}` : 'timeout' });
        set(guess ? { status: 'asking', style: { name: guess.style, genre: guess.genre, subGenre: guess.subGenre } } : { status: 'none' }, id);
      } catch {
        if (signal.aborted) return;
        trace('style_guess', { category: 'failed' });
        set({ status: 'none' });
      }
    })();
    return () => {
      controller.abort();
      if (guesses.get(key)?.state.status === 'listening') guesses.delete(key);
    };
  }, [enabled, accessToken, audio, sourceSha256, offsetMs, key]);

  function answer(given: GuessAnswer) {
    const current = guesses.get(key);
    if (current?.state.status !== 'asking' || !current.id) return;
    const { style } = current.state;
    guesses.set(key, { ...current, state: { status: 'answered', style, answer: given } });
    rerender(count => count + 1);
    const body = { version: 1, id: current.id, answer: given, style: style.name, clip: { sourceSha256, offsetMs } };
    void post(accessToken, new AbortController().signal, '/.netlify/functions/style-print-status', 'application/json', JSON.stringify(body))
      .then(response => trace('style_guess', { category: response.ok ? `answered_${given}` : `http_${response.status}` }),
        () => trace('style_guess', { category: 'answer_failed' }));
  }

  return [enabled ? entry?.state ?? { status: 'idle' } : { status: 'idle' }, answer];
}
