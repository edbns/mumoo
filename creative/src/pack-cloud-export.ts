/**
 * Creatives Pack cloud export — the browser only SUBMITS a small job and POLLS.
 *
 *   browser ──(960 KB WAV + scene JSON)──▶ Netlify submit ──▶ Modal spawn → job id
 *   browser ──(poll job id every 1.5 s)──▶ Netlify status ──▶ Modal → 202 | MP4
 *
 * No canvas capture, no image upload, no WebGL/WebGPU, no encoding on this machine.
 * The cloud renders the same Pixi scene in headless Chromium (parallel frame ranges).
 */
import { DURATION_MS } from './composition';
import { sleep } from './lyrics-cloud';
import type { PackRendererOpts } from './pack-renderer';

const SAMPLE_RATE = 32_000;
const WAV_SAMPLES = SAMPLE_RATE * (DURATION_MS / 1000);
const WAV_BYTES = 44 + WAV_SAMPLES * 2;
const POLL_MS = 1500;
/** How long a render is waited for before giving up. */
export const JOB_TIMEOUT_MS = 900_000;

function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

/** Build 15s mono 32 kHz WAV in chunks so the UI can breathe. */
export async function clipToMonoWav(audio: AudioBuffer, clipStartMs: number): Promise<Uint8Array> {
  const start = Math.max(0, Math.floor((clipStartMs / 1000) * audio.sampleRate));
  const need = Math.floor((DURATION_MS / 1000) * audio.sampleRate);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const mono = new Float32Array(need);
  const chunk = 48_000;
  for (let i = 0; i < need; i++) {
    const src = start + i;
    if (src >= audio.length) break;
    let sum = 0;
    for (const data of channels) sum += data[src] || 0;
    mono[i] = sum / channels.length;
    if (i > 0 && i % chunk === 0) await yieldToUi();
  }

  await yieldToUi();
  const out = new Float32Array(WAV_SAMPLES);
  const ratio = audio.sampleRate / SAMPLE_RATE;
  for (let i = 0; i < WAV_SAMPLES; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = (mono[i0] || 0) * (1 - t) + (mono[i1] || 0) * t;
    if (i > 0 && i % chunk === 0) await yieldToUi();
  }

  await yieldToUi();
  const buffer = new ArrayBuffer(WAV_BYTES);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + WAV_SAMPLES * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, WAV_SAMPLES * 2, true);
  let offset = 44;
  for (let i = 0; i < WAV_SAMPLES; i++) {
    const sample = Math.max(-1, Math.min(1, out[i] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
    if (i > 0 && i % chunk === 0) await yieldToUi();
  }
  return new Uint8Array(buffer);
}

async function errorMessage(response: Response): Promise<string> {
  const result = await response.json().catch(() => null) as { error?: string } | null;
  return result?.error || 'Cloud encode is temporarily unavailable. Reload and try again.';
}

export type CloudJobInput = {
  token: string;
  /** 15 s mono 32 kHz WAV from `clipToMonoWav` (build once per batch). */
  wav: Uint8Array;
  /** Exactly what the shelf preview renders — the cloud draws the same scene, frame for frame. */
  opts: PackRendererOpts;
  /** Dust and Filter draw the signed-in person's own picture: its id in their storage. The server fetches it. */
  uploadId?: string;
};

/** Submit one render job. Returns immediately with a job id. */
export async function submitCloudJob(input: CloudJobInput): Promise<string> {
  const form = new FormData();
  form.append('audio', new Blob([input.wav as BlobPart], { type: 'audio/wav' }), 'clip.wav');
  // Data only. The picture itself never leaves the person's storage through the browser again.
  const { photoUrl: _photo, cutoutUrl: _cutout, motionUrl: _motion, ...scene } = input.opts;
  void [_photo, _cutout, _motion];
  form.append('meta', JSON.stringify({
    ...(input.uploadId ? { upload: input.uploadId } : {}),
    opts: { ...scene, fallbackText: (scene.fallbackText || 'NOW').slice(0, 80) },
  }));
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  const response = await fetch('/.netlify/functions/encode-creative', {
    method: 'POST',
    headers: { 'x-mumoo-brain-access': input.token, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: form,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const result = await response.json().catch(() => null) as { id?: string } | null;
  if (!result?.id) throw new Error('Cloud encode did not start. Reload and try again.');
  return result.id;
}

/** Poll until the MP4 is ready. Cheap: one tiny GET every 1.5 s, no work on this machine. Aborting the signal stops it. */
export async function awaitCloudJob(token: string, id: string, signal?: AbortSignal): Promise<Blob> {
  // Signed-in people get the finished video kept in their history; the token is good for far longer than a render.
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal);
    const response = await fetch(`/.netlify/functions/encode-creative-status?id=${encodeURIComponent(id)}`, {
      headers: { 'x-mumoo-brain-access': token, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      signal,
    });
    if (response.status === 202) continue;
    if (!response.ok) throw new Error(await errorMessage(response));
    const blob = await response.blob();
    if (blob.size < 1000) throw new Error('Cloud encode returned an empty file.');
    return blob;
  }
  throw new Error('Cloud encode took too long. Try again in a moment.');
}
