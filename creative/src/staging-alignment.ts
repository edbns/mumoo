export const IS_ALIGNMENT_STAGING = location.hostname === 'mumoo-staging.netlify.app' || (import.meta.env.DEV && location.hostname === '127.0.0.1');

/** 16-bit mono PCM WAV (44-byte header). */
export function encodePcmWav(samples: Float32Array, rate: number) {
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
  return bytes;
}
