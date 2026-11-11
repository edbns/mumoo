/**
 * Lyrics in the cloud — transcribe (no lyrics given) or sync (user's text), any language.
 *
 *   browser ──(15 s mono 16 kHz WAV + tiny JSON)──▶ Netlify submit ──▶ Modal → job id
 *   browser ──(poll every 1.2 s)──────────────────▶ Netlify status ──▶ Modal → 202 | words
 *
 * The browser only cuts the 15 s clip, sends it, and polls. No model runs on this machine.
 */
import { DURATION_MS, type LyricCue } from './composition';
import { encodePcmWav } from './staging-alignment';
import { joinWords } from './lyric-text';
import { withAccess } from './staging-token';

export const MAX_LYRIC_WORDS = 120;
const RATE = 16_000;
const POLL_MS = 1200;
const JOB_TIMEOUT_MS = 240_000;

/** Common languages first. Whisper can transcribe all of these; alignment works for any script. */
export const LYRIC_LANGUAGES: readonly [code: string, name: string][] = [
  ['en', 'English'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'],
  ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['nl', 'Dutch'], ['tr', 'Turkish'],
  ['ar', 'Arabic'], ['fa', 'Persian'], ['he', 'Hebrew'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['ta', 'Tamil'],
  ['id', 'Indonesian'], ['ms', 'Malay'], ['th', 'Thai'], ['vi', 'Vietnamese'], ['tl', 'Filipino'],
  ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['sw', 'Swahili'], ['yo', 'Yoruba'], ['ha', 'Hausa'], ['sn', 'Shona'], ['af', 'Afrikaans'],
];

export function languageName(code?: string): string {
  if (!code) return 'Unknown';
  const known = LYRIC_LANGUAGES.find(([c]) => c === code);
  if (known) return known[1];
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

/** Cut the chosen 15 seconds to 16 kHz mono 16-bit WAV. Rendering runs natively, off the main thread. */
export async function clipToWav16k(audio: AudioBuffer, clipStartMs: number): Promise<Uint8Array> {
  const context = new OfflineAudioContext(1, (DURATION_MS * RATE) / 1000, RATE);
  const source = context.createBufferSource();
  source.buffer = audio;
  source.connect(context.destination);
  source.start(0, clipStartMs / 1000);
  const rendered = await context.startRendering();
  return encodePcmWav(rendered.getChannelData(0), RATE);
}

// ---------------------------------------------------------------- jobs

export type LyricWord = LyricCue & { line: number; estimated: boolean };

export type LyricsResult = {
  source: 'transcribed' | 'supplied';
  language?: string;
  languageProbability?: number;
  alternatives: { language: string; probability: number }[];
  words: LyricWord[];
};

type JobInput = { token: string; wav: Uint8Array; lines?: string[][]; language?: string; signal?: AbortSignal };

/** `retryable` marks failures that are usually gone a moment later (network blip, worker restart). */
export class LyricsError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    throw new LyricsError(
      navigator.onLine === false ? 'You appear to be offline. Check your connection and try again.'
        : 'Could not reach the lyrics service. Check your connection and try again.',
      true,
    );
  }
}

async function failure(response: Response): Promise<LyricsError> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new LyricsError(
    body?.error ?? 'Lyrics are temporarily unavailable. Try again in a moment.',
    response.status >= 500 || response.status === 410,
  );
}

export async function submitLyricsJob({ token, wav, lines, language, signal }: JobInput): Promise<string> {
  const form = new FormData();
  form.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'clip.wav');
  form.append('meta', JSON.stringify({ lines: lines ?? null, language: language ?? null }));
  const response = await withAccess(token, access => call('/.netlify/functions/transcribe-lyrics', {
    method: 'POST', headers: { 'x-mumoo-brain-access': access }, body: form, signal,
  }));
  if (!response.ok) throw await failure(response);
  const body = await response.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) throw new LyricsError('Lyrics did not start. Reload and try again.');
  return body.id;
}

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

/** Validate what the worker sent: ordered, inside the clip, never trusted blindly. */
export function parseLyricsResult(raw: unknown): LyricsResult {
  const body = raw as Record<string, unknown> | null;
  if (!body || body.version !== 2 || !Array.isArray(body.words) || (body.source !== 'transcribed' && body.source !== 'supplied')) {
    throw new LyricsError('The lyrics worker returned an unexpected answer. Try again.', true);
  }
  const words: LyricWord[] = [];
  let cursor = 0;
  for (const item of body.words.slice(0, MAX_LYRIC_WORDS) as Record<string, unknown>[]) {
    const text = typeof item.text === 'string' ? [...item.text.trim()].slice(0, 48).join('') : '';
    const { startMs, endMs, line } = item as { startMs: unknown; endMs: unknown; line: unknown };
    if (!text || !Number.isInteger(startMs) || !Number.isInteger(endMs)) continue;
    const start = Math.max(cursor, startMs as number);
    const end = Math.min(DURATION_MS, endMs as number);
    if (start >= end) continue;
    words.push({ text, startMs: start, endMs: end, line: Number.isInteger(line) ? line as number : 0, estimated: item.status !== 'aligned' });
    cursor = end;
  }
  const alternatives = Array.isArray(body.languageAlternatives)
    ? (body.languageAlternatives as { language?: unknown; probability?: unknown }[])
      .filter(item => typeof item.language === 'string' && typeof item.probability === 'number')
      .map(item => ({ language: item.language as string, probability: item.probability as number }))
    : [];
  return {
    source: body.source,
    language: typeof body.language === 'string' ? body.language : undefined,
    languageProbability: typeof body.languageProbability === 'number' ? body.languageProbability : undefined,
    alternatives,
    words,
  };
}

export async function awaitLyricsJob(token: string, id: string, signal?: AbortSignal): Promise<LyricsResult> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal);
    const response = await withAccess(token, access => call(`/.netlify/functions/transcribe-lyrics-status?id=${encodeURIComponent(id)}`, {
      headers: { 'x-mumoo-brain-access': access }, signal,
    }));
    if (response.status === 202) continue;
    if (!response.ok) throw await failure(response);
    return parseLyricsResult(await response.json().catch(() => null));
  }
  throw new LyricsError('This is taking longer than usual. Try again in a moment.');
}

/** Submit and wait. One automatic retry for transient failures, so a worker restart never reaches the user. */
export async function runLyricsJob(input: JobInput): Promise<LyricsResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await awaitLyricsJob(input.token, await submitLyricsJob(input), input.signal);
    } catch (cause) {
      if (attempt > 0 || !(cause instanceof LyricsError) || !cause.retryable) throw cause;
      await sleep(1500, input.signal);
    }
  }
}

/** Words → editor text, one line per sung line. */
export function wordsToText(words: readonly LyricWord[]): string {
  const lines: string[][] = [];
  let current = -1;
  for (const word of words) {
    if (word.line !== current || !lines.length) { lines.push([]); current = word.line; }
    lines[lines.length - 1].push(word.text);
  }
  return lines.map(joinWords).join('\n');
}

/** Group timed cues into display lines (for the preview), using the worker's line numbers. */
export function groupLines(words: readonly LyricWord[]): { word: LyricWord; index: number }[][] {
  const lines: { word: LyricWord; index: number }[][] = [];
  let current = -1;
  words.forEach((word, index) => {
    if (word.line !== current || !lines.length) { lines.push([]); current = word.line; }
    lines[lines.length - 1].push({ word, index });
  });
  return lines;
}
