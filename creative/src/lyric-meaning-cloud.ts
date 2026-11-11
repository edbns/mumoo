/**
 * Lyric meaning in the cloud: the approved words go to OUR model (never a third party) and come back as a few codes.
 *
 *   browser ──(lines + language, tiny JSON)──▶ Netlify submit ──▶ Modal → job id
 *   browser ──(poll)─────────────────────────▶ Netlify status ──▶ Modal → 202 | codes
 *
 * The model can take about two minutes to wake after a quiet spell, so the reading starts the moment the lyrics are
 * approved and is usually done long before the creatives screen opens.
 */
import { useEffect, useState } from 'react';
import type { LyricCue } from './composition';
import { joinWords } from './lyric-text';
import { phrasesFor } from './lyric-motion';
import { parseLyricMeaning, type LyricMeaning, type LyricMeaningState } from './lyric-meaning';
import { sleep } from './lyrics-cloud';
import { withAccess } from './staging-token';

const POLL_MS = 1500;
const JOB_TIMEOUT_MS = 170_000;

async function readLyricMeaning(token: string, lines: string[], language: string | undefined, signal: AbortSignal): Promise<LyricMeaning> {
  const submitted = await withAccess(token, access => fetch('/.netlify/functions/read-lyric-meaning', {
    method: 'POST', signal, headers: { 'x-mumoo-brain-access': access, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines, language: language ?? null }),
  }));
  const { id } = (await submitted.json().catch(() => null) ?? {}) as { id?: string };
  if (!submitted.ok || !id) throw new Error('The lyric reading did not start.');
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal);
    const response = await withAccess(token, access => fetch(`/.netlify/functions/read-lyric-meaning-status?id=${encodeURIComponent(id)}`, { headers: { 'x-mumoo-brain-access': access }, signal }));
    if (response.status === 202) continue;
    const meaning = response.ok ? parseLyricMeaning(await response.json().catch(() => null)) : null;
    if (!meaning) throw new Error('The lyric reading failed.');
    return meaning;
  }
  throw new Error('The lyric reading took too long.');
}

/**
 * Reads the meaning of the approved lyrics once per distinct text. `undefined` means "not asked for yet";
 * a failed reading is reported as `error` and the brain simply goes on with what it hears.
 */
export function useLyricMeaning(token: string, cues: readonly LyricCue[], language: string | undefined, enabled: boolean): LyricMeaningState | undefined {
  const lines = phrasesFor(cues).map(phrase => joinWords(phrase.words.map(word => word.text)));
  const key = JSON.stringify([language ?? null, lines]);
  const [result, setResult] = useState<{ key: string; state: LyricMeaningState }>();
  const active = enabled && Boolean(token) && lines.length > 0;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult({ key, state: { status: 'pending' } });
    readLyricMeaning(token, lines, language, controller.signal)
      .then(meaning => setResult({ key, state: { status: 'ready', meaning } }))
      .catch(() => { if (!controller.signal.aborted) setResult({ key, state: { status: 'error' } }); });
    return () => controller.abort();
    // `key` already covers the lines and the language.
  }, [active, token, key]);

  return active && result?.key === key ? result.state : undefined;
}
