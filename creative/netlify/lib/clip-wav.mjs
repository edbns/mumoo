/**
 * The selected clip as the site sends it: mono 16-bit PCM WAV, 10 to 15 seconds in whole tenths of a second (a song shorter
 * than 15 s is used whole). The workers check the same (`audio-intelligence/clip_wav.py`).
 */
export const MIN_MS = 10_000;
export const MAX_MS = 15_000;
const STEP_MS = 100;

export const maxBytes = rate => 44 + rate * MAX_MS / 1000 * 2;

/** How long the clip in `bytes` (an ArrayBuffer) is, in ms; null when it is not a clip at `rate`. */
export function clipMs(bytes, rate) {
  const data = bytes.byteLength - 44;
  if (data <= 0 || data % 2 || (data / 2 * 1000) % rate) return null;
  const ms = data / 2 * 1000 / rate;
  if (ms < MIN_MS || ms > MAX_MS || ms % STEP_MS) return null;
  const view = new DataView(bytes);
  const text = (at, length) => String.fromCharCode(...new Uint8Array(bytes, at, length));
  const fits = text(0, 4) === 'RIFF' && view.getUint32(4, true) === 36 + data && text(8, 8) === 'WAVEfmt '
    && view.getUint32(16, true) === 16 && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1
    && view.getUint32(24, true) === rate && view.getUint32(28, true) === rate * 2 && view.getUint16(32, true) === 2
    && view.getUint16(34, true) === 16 && text(36, 4) === 'data' && view.getUint32(40, true) === data;
  return fits ? ms : null;
}
