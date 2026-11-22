/**
 * Creatives Pack cloud export — the browser only QUEUES small jobs and asks how they are doing.
 *
 *   browser ──(960 KB WAV once per order + scene JSON per video)──▶ Netlify queue (`render-queue.mjs`) → queue ids
 *   browser ──(all of the order's ids every 3 s)──▶ Netlify status ──▶ queue: starts Modal jobs in turns, keeps the MP4s in Media
 *
 * No canvas capture, no image upload, no WebGL/WebGPU, no encoding on this machine.
 * The cloud renders the same Pixi scene in headless Chromium (parallel frame ranges).
 */
import { DURATION_MS } from './composition';
import { sleep } from './lyrics-cloud';
import { withAccess } from './staging-token';
import type { PackRendererOpts } from './pack-renderer';

const SAMPLE_RATE = 32_000;
const WAV_SAMPLES = SAMPLE_RATE * (DURATION_MS / 1000);
const WAV_BYTES = 44 + WAV_SAMPLES * 2;
/** How often queued videos are asked about. */
const POLL_MS = 3000;
/** The most videos asked about in one request (under the server's limit); a bigger order is asked about in parts. */
const STATUS_CHUNK = 200;
/** A check that has not answered by then is given up and asked again. */
const CHECK_TIMEOUT_MS = 20_000;
/** How long a page keeps an order to pick up again after a refresh; the server keeps how each video went for a week. */
export const ORDER_WAIT_MS = 2 * 24 * 60 * 60 * 1000;

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
  // The page renews its access by itself; if it still could not, say what to do, not what the gateway called it.
  if (response.status === 401 && /staging access/i.test(result?.error ?? '')) return 'Reload the page and try again.';
  return result?.error || 'Creatives are down for a moment. Reload and try again.';
}

/** One video to queue. */
export type CloudJob = {
  /** Exactly what the shelf preview renders — the cloud draws the same scene, frame for frame. */
  opts: PackRendererOpts;
  /** A card drawn on the signed-in person's own picture: its id in their storage. The server fetches it. */
  uploadId?: string;
  /** Our photography draws an approved library picture: its id. The server reads it from the library. */
  libraryId?: string;
  /** The reel in `opts` is edited from the signed-in person's own pictures: the server finds them in their storage, not the library. */
  ownReel?: boolean;
};

/** The most videos queued by one request (the server's `BATCH`). */
export const QUEUE_BATCH = 10;

function metaOf(job: CloudJob): string {
  // Data only. The picture itself never leaves the person's storage through the browser again.
  const { photoUrl: _photo, cutoutUrl: _cutout, motionUrl: _motion, reel, ...scene } = job.opts;
  void [_photo, _cutout, _motion];
  return JSON.stringify({
    ...(job.uploadId ? { upload: job.uploadId } : {}),
    ...(job.libraryId ? { library: job.libraryId } : {}),
    ...(job.ownReel ? { ownReel: true } : {}),
    // A reel goes as the library ids it is edited from, in order; the server swaps in fresh links of its own.
    // The encoder still requires fallbackText; a creative shows only the song's own words, so it is always empty.
    opts: { ...scene, ...(reel?.length ? { reel: reel.map(({ id, kind, shots }) => ({ id, kind, ...(shots ? { shots } : {}) })) } : {}), fallbackText: '' },
  });
}

/**
 * Queue up to `QUEUE_BATCH` videos in one request. The first batch of an order sends `wav` (15 s mono 32 kHz from `clipToMonoWav`,
 * built once); later ones name the `order` it returned. Returns at once with their queue ids, in order; `noCredits` when the credits
 * ran out part way (the rest were not queued). With no credits at all it throws with `noCredits`. A request that did not get through
 * is not sent again: it may have queued its videos, and each took a credit.
 */
export async function submitCloudJobs(token: string, { wav, order, jobs }: { wav: Uint8Array; order?: string; jobs: readonly CloudJob[] }): Promise<{ ids: string[]; order: string; noCredits: boolean }> {
  const form = new FormData();
  if (order) form.append('order', order);
  else form.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'clip.wav');
  for (const job of jobs) form.append('meta', metaOf(job));
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  const response = await withAccess(token, access => fetch('/.netlify/functions/encode-creative', {
    method: 'POST',
    headers: { 'x-mumoo-brain-access': access, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: form,
  }));
  if (response.status === 402) throw Object.assign(new Error(await errorMessage(response)), { noCredits: true });
  if (!response.ok) throw new Error(await errorMessage(response));
  const result = await response.json().catch(() => null) as { ids?: string[]; order?: string; noCredits?: boolean } | null;
  if (!result?.ids?.length || !result.order) throw new Error('Your creatives didn’t start. Reload and try again.');
  return { ids: result.ids, order: result.order, noCredits: Boolean(result.noCredits) };
}

/** How one queued video ended: null when it was kept in the person's Media, the MP4 itself when it could not be (their storage is full). */
export type CloudJobEnd = { video: Blob | null } | { cause: Error } | { cancelled: true };
type JobState = { status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'missing'; error?: string; download?: string; slow?: boolean };

/** One status request about up to `STATUS_CHUNK` videos; with `cancel`, the ones still waiting are taken back first. */
async function askAbout(token: string, ids: string[], { cancel = false, signal }: { cancel?: boolean; signal?: AbortSignal } = {}): Promise<Response> {
  // The sign-in token is read for every request: a big order outlasts one, and a stale one would be refused on every check.
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  const timeout = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  return withAccess(token, access => fetch('/.netlify/functions/encode-creative-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mumoo-brain-access': access, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ ids, ...(cancel ? { cancel: true } : {}) }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }));
}

const chunksOf = (ids: readonly string[]) =>
  Array.from({ length: Math.ceil(ids.length / STATUS_CHUNK) }, (_, index) => ids.slice(index * STATUS_CHUNK, (index + 1) * STATUS_CHUNK));

/**
 * Takes back the queued videos `ids` that have not started yet; their credits are given back. Ones already being made carry on.
 * `followCloudJobs` then hears them end as cancelled.
 */
export async function cancelCloudJobs(token: string, ids: readonly string[]): Promise<void> {
  for (const chunk of chunksOf(ids)) {
    const response = await askAbout(token, chunk, { cancel: true });
    if (!response.ok) throw new Error(await errorMessage(response));
  }
}

/**
 * Follows queued videos until each has ended, asking about all of them in one request every few seconds. `onUpdate` hears how many
 * are still waiting their turn, how many are being made and how many of those are taking longer than usual (`slow`: being made a
 * long time, or being tried again); `onEnd` hears each video as it ends. A big order is asked about in
 * parts. A check that does not get through is tried again, more slowly, for as long as the page is open: the videos go on being
 * made and kept either way.
 */
export async function followCloudJobs(token: string, ids: readonly string[], on: {
  onUpdate: (waiting: number, making: number, slow: number) => void;
  onEnd: (id: string, end: CloudJobEnd) => void;
}, signal?: AbortSignal): Promise<void> {
  const open = new Set(ids);
  let pause = 0;
  while (open.size) {
    await sleep(pause, signal);
    const all = [...open];
    const jobs: Record<string, JobState> = {};
    let missed = false;
    for (const chunk of chunksOf(all)) {
      const response = await askAbout(token, chunk, { signal }).catch(cause => {
        if (signal?.aborted) throw cause;
        return null;
      });
      if (!response?.ok) {
        if (response && response.status < 500 && response.status !== 401) throw new Error(await errorMessage(response));
        missed = true;
        break;
      }
      Object.assign(jobs, (await response.json() as { jobs: Record<string, JobState> }).jobs);
    }
    if (missed) {
      pause = Math.min(30_000, Math.max(POLL_MS, pause * 2));
      continue;
    }
    pause = POLL_MS;
    let waiting = 0;
    let making = 0;
    let slow = 0;
    for (const id of all) {
      const job = jobs[id];
      if (job?.slow) slow += 1;
      if (!job || job.status === 'queued') { waiting += 1; continue; }
      if (job.status === 'running') { making += 1; continue; }
      open.delete(id);
      if (job.status === 'cancelled') on.onEnd(id, { cancelled: true });
      else if (job.status === 'failed') on.onEnd(id, { cause: new Error(job.error || 'Your creative couldn’t be made. Try again.') });
      else if (job.status === 'missing') on.onEnd(id, { cause: new Error('This video is no longer being made. Choose it again.') });
      else if (!job.download) on.onEnd(id, { video: null });
      else {
        const video = await fetch(job.download, { signal }).then(file => (file.ok ? file.blob() : null)).catch(() => null);
        on.onEnd(id, video && video.size >= 1000 ? { video } : { cause: new Error('Your creative was made but couldn’t be downloaded. Try again.') });
      }
    }
    on.onUpdate(waiting, making, slow);
  }
}
