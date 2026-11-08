import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('Lyric Impact catalog uses approved words, music signals, and validates 28 styles', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { IMPACT_STYLES, impactFrame, impactSignals, fitImpactText } = await server.ssrLoadModule('/src/lyric-impact.ts');
    const { validate, IMPACT_VARIANTS } = await server.ssrLoadModule('/src/composition.ts');
    const cues = [{ text: 'No', startMs: 1000, endMs: 1250 }, { text: 'miro', startMs: 1250, endMs: 1600 }, { text: 'atrás.', startMs: 1600, endMs: 2100 }];
    assert.equal(IMPACT_STYLES.length, 28);
    assert.equal(IMPACT_VARIANTS.length, 28);
    assert.deepEqual(IMPACT_STYLES.map(item => item.id), [...IMPACT_VARIANTS]);
    assert.equal(impactFrame(cues, 29).phrase, '');
    assert.equal(impactFrame(cues, 48).phrase, 'No miro atrás.');
    assert.equal(impactFrame(cues, 48).word, 'atrás.');
    assert.equal(impactFrame(cues, 63).phrase, '');
    assert.equal(impactFrame([{ text: 'End', startMs: 14990, endMs: 15000 }], 449).word, 'End');
    assert.equal(impactFrame([{ text: 'The', startMs: 14900, endMs: 14990 }, { text: 'end', startMs: 14990, endMs: 15000 }], 449).word, 'end');
    const track = { beatsMs: [1000], energy: [{ timeMs: 0, rms: 0.2 }, { timeMs: 1000, rms: 0.8 }] };
    assert.ok(impactSignals(track, 1000).beat > impactSignals(track, 1400).beat);
    assert.deepEqual(impactSignals(track, 1000), impactSignals(track, 1000));
    const originalSegmenter = Intl.Segmenter;
    try {
      Intl.Segmenter = undefined;
      const ctx = { font: '', measureText(value) { return { width: value.length * Number(this.font.match(/(\d+)px/)[1]) }; } };
      const fit = fitImpactText(ctx, 'x'.repeat(48), 900, 220, 800, 3);
      assert.ok(fit.lines.every(line => ctx.measureText(line).width <= 900));
    } finally { Intl.Segmenter = originalSegmenter; }
    const base = { version: 2, template: 'lyric-impact', sourceSha256: 'a'.repeat(64), clipStartMs: 0, cues };
    for (const style of IMPACT_VARIANTS) {
      assert.doesNotThrow(() => validate({ ...base, lyricImpact: { style, music: track } }, 15000));
    }
    assert.throws(() => validate({ ...base, cues: [] }, 15000));
    assert.throws(() => validate({ ...base, lyricImpact: { style: 'wrong', music: track } }, 15000));
    assert.throws(() => validate({ ...base, lyricImpact: { style: 'poster', music: track } }, 15000));
    assert.doesNotThrow(() => validate({ ...base, lyricImpact: { style: 'billboard', music: track, plateId: 'ember-dusk' } }, 15000));
    assert.throws(() => validate({ ...base, lyricImpact: { style: 'billboard', music: track, plateId: '../x' } }, 15000));
  } finally { await server.close(); }
});
