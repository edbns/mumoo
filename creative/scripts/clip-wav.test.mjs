import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipMs, maxBytes } from '../netlify/lib/clip-wav.mjs';

/** Silence as the browser writes it (`encodePcmWav`): mono 16-bit PCM WAV. */
function wav(rate, ms) {
  const data = rate * ms / 1000 * 2;
  const bytes = new ArrayBuffer(44 + data);
  const view = new DataView(bytes);
  const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + data, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data, true);
  return bytes;
}

test('a clip is 10 to 15 seconds of mono 16-bit WAV in whole tenths', () => {
  for (const rate of [16_000, 48_000]) {
    assert.equal(clipMs(wav(rate, 15_000), rate), 15_000);
    assert.equal(clipMs(wav(rate, 12_300), rate), 12_300);
    assert.equal(clipMs(wav(rate, 10_000), rate), 10_000);
    assert.equal(wav(rate, 15_000).byteLength, maxBytes(rate));
    assert.equal(clipMs(wav(rate, 9_900), rate), null, 'under 10 seconds');
    assert.equal(clipMs(wav(rate, 15_100), rate), null, 'over 15 seconds');
  }
  assert.equal(clipMs(wav(16_000, 12_000), 48_000), null, 'another rate');
  assert.equal(clipMs(new ArrayBuffer(44 + 16_000 * 2 * 12), 16_000), null, 'no header');
});
