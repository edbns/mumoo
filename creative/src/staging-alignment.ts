import { DURATION_MS, type LyricCue } from './composition';

export const IS_ALIGNMENT_STAGING = location.hostname === 'mumoo-staging.netlify.app';

if (IS_ALIGNMENT_STAGING && location.hash.startsWith('#tester=')) {
  const invite = location.hash.slice('#tester='.length);
  if (/^\d{10}\.[a-f0-9]{64}$/.test(invite)) sessionStorage.setItem('mumoo-staging-tester', invite);
  history.replaceState(null, '', location.pathname + location.search);
}

export const STAGING_INVITE = IS_ALIGNMENT_STAGING ? sessionStorage.getItem('mumoo-staging-tester') ?? '' : '';

function encodeWav(samples: Float32Array, rate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = new TextEncoder();
  bytes.set(text.encode('RIFF'), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(text.encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(text.encode('data'), 36);
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function syncStagingLyrics(samples: Float32Array, rate: number, lyrics: string, accessCode: string, signal: AbortSignal) {
  const response = await fetch('/.netlify/functions/align-lyrics', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Mumoo-Tester': accessCode },
    body: JSON.stringify({ audio: encodeWav(samples, rate), lyrics, language: 'en' }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? 'Sign in to MUMOO Staging and try again.');
  if (result?.version !== 1 || result.method !== 'whisperx_supplied_lyrics' || !Array.isArray(result.words)) {
    throw new Error('The worker returned an invalid alignment.');
  }
  const cues: LyricCue[] = [];
  const unmatched: string[] = [];
  for (const word of result.words) {
    if (typeof word?.text !== 'string') throw new Error('The worker returned an invalid word.');
    if (word.status !== 'aligned') {
      unmatched.push(word.text);
      continue;
    }
    if (!Number.isInteger(word.startMs) || !Number.isInteger(word.endMs) ||
        word.startMs < (cues.at(-1)?.endMs ?? 0) || word.endMs > DURATION_MS || word.startMs >= word.endMs) {
      throw new Error('The worker returned an invalid word range.');
    }
    cues.push({ text: word.text, startMs: word.startMs, endMs: word.endMs });
  }
  return { cues, unmatched };
}
