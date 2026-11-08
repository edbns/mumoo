import { ACCEPTED_LABEL, sniffAudioFormat } from './audio-format';

/** Longest song we decode. A decoded buffer is ~10 MB per minute (mono, 44.1 kHz) — kept small for weak laptops. */
export const MAX_SOURCE_MS = 10 * 60_000;
/** Used only when the browser cannot tell us the duration before decoding. */
const MAX_UNKNOWN_DURATION_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const DECODE_RATE = 44_100;

/** Cheap duration probe (reads headers only). Resolves to undefined if the browser cannot tell. */
export function probeDurationMs(file: Blob): Promise<number | undefined> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const element = document.createElement('audio');
    const done = (value?: number) => {
      clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), 4000);
    element.preload = 'metadata';
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) && element.duration > 0 ? Math.round(element.duration * 1000) : undefined);
    element.onerror = () => done(undefined);
    element.src = url;
  });
}

/** Mix to mono so a long song costs half the memory; every later step (analysis, export) is mono anyway. */
function toMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer;
  const mono = new AudioBuffer({ length: buffer.length, numberOfChannels: 1, sampleRate: buffer.sampleRate });
  const out = mono.getChannelData(0);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const gain = 1 / channels.length;
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    out[i] = sum * gain;
  }
  return mono;
}

export async function decodeAudio(bytes: ArrayBuffer, probedMs?: number): Promise<AudioBuffer> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('This file is too large. Use a song under 200 MB.');
  const format = sniffAudioFormat(bytes);
  if (!format) throw new Error(`This file type is not supported. Use ${ACCEPTED_LABEL}.`);
  if (probedMs !== undefined && probedMs > MAX_SOURCE_MS) {
    throw new Error(`This song is ${Math.round(probedMs / 60_000)} minutes long. Use a song up to ${MAX_SOURCE_MS / 60_000} minutes, or trim it first.`);
  }
  if (probedMs === undefined && bytes.byteLength > MAX_UNKNOWN_DURATION_BYTES) {
    throw new Error('This file is too large to open safely. Export a shorter MP3 or WAV and try again.');
  }
  const context = new OfflineAudioContext(1, 1, DECODE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } catch {
    throw new Error(
      format === 'wav'
        ? 'This WAV could not be decoded.'
        : `Your browser could not read this ${format.toUpperCase()} file. Try exporting it as MP3 or WAV.`,
    );
  }
  if (decoded.duration * 1000 > MAX_SOURCE_MS) {
    throw new Error(`This song is ${Math.round(decoded.duration / 60)} minutes long. Use a song up to ${MAX_SOURCE_MS / 60_000} minutes, or trim it first.`);
  }
  return toMono(decoded);
}

/** SHA-256 of the uploaded bytes, whatever the format. */
export async function hashAudio(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
