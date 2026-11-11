/**
 * Who sings, heard in the selected 15 seconds: our own worker separates the voice from the music and reads it.
 *
 *   browser ──(the 15 s mono 16 kHz WAV)──▶ Netlify submit ──▶ Modal → job id
 *   browser ──(poll)──────────────────────▶ Netlify status ──▶ Modal → 202 | female / male / both / nothing
 *
 * The worker answers `null` whenever the audio does not support an answer (an instrumental, too little singing, voices that
 * disagree). Nothing is then set and the Doodle row deals its default singers: a wrong singer is worse than an open one.
 * The answer is a refinement, never a gate: a slow or failed reading changes nothing else.
 */
import { useEffect, useState } from 'react';
import type { DoodleVoice } from './doodle-cast';
import { parseSingerVoice, type SingerVoiceState } from './singer-voice';
import { clipToWav16k, sleep } from './lyrics-cloud';
import { withAccess } from './staging-token';

const POLL_MS = 1500;
const JOB_TIMEOUT_MS = 170_000;

async function readOnce(token: string, wav: Uint8Array, signal: AbortSignal): Promise<DoodleVoice | null> {
  const form = new FormData();
  form.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'clip.wav');
  const submitted = await withAccess(token, access => fetch('/.netlify/functions/detect-voice', { method: 'POST', headers: { 'x-mumoo-brain-access': access }, body: form, signal }));
  const { id } = (await submitted.json().catch(() => null) ?? {}) as { id?: string };
  if (!submitted.ok || !id) throw new Error('The voice reading did not start.');
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal);
    const response = await withAccess(token, access => fetch(`/.netlify/functions/detect-voice-status?id=${encodeURIComponent(id)}`, { headers: { 'x-mumoo-brain-access': access }, signal }));
    if (response.status === 202) continue;
    const answer = response.ok ? parseSingerVoice(await response.json().catch(() => null)) : undefined;
    if (!answer) throw new Error('The voice reading failed.');
    return answer.value;
  }
  throw new Error('The voice reading took too long.');
}

/** One automatic retry, so a worker restart never costs the answer. */
async function readSingerVoice(token: string, audio: AudioBuffer, clipStartMs: number, signal: AbortSignal): Promise<DoodleVoice | null> {
  const wav = await clipToWav16k(audio, clipStartMs);
  for (let attempt = 0; ; attempt++) {
    try {
      return await readOnce(token, wav, signal);
    } catch (cause) {
      if (attempt > 0 || signal.aborted) throw cause;
      await sleep(1500, signal);
    }
  }
}

/**
 * Reads who sings once per clip (`clipKey` is the song and where the window sits). `undefined` means "not asked for yet".
 * A failed reading is reported as `error` and the singer stays open.
 */
export function useSingerVoice(token: string, audio: AudioBuffer | undefined, clipStartMs: number, clipKey: string, enabled: boolean): SingerVoiceState | undefined {
  const [result, setResult] = useState<{ key: string; state: SingerVoiceState }>();
  const active = enabled && Boolean(token) && Boolean(audio);

  useEffect(() => {
    if (!active || !audio) return;
    const controller = new AbortController();
    setResult({ key: clipKey, state: { status: 'pending' } });
    readSingerVoice(token, audio, clipStartMs, controller.signal)
      .then(value => setResult({ key: clipKey, state: { status: 'ready', value } }))
      .catch(() => { if (!controller.signal.aborted) setResult({ key: clipKey, state: { status: 'error' } }); });
    return () => controller.abort();
    // `clipKey` already covers the song and the window.
  }, [active, token, clipKey]);

  return active && result?.key === clipKey ? result.state : undefined;
}
