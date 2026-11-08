import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRunBrowserTests, lyricsResult, NEUTRAL_READING, openProduct, songMp3WithCover, uploadSong } from './support/product-flow.mjs';

const SKIP = !canRunBrowserTests;
const HEARD = 'louvado seja o Senhor Deus gloria e graça para sempre';

test('song → clip + lyrics → edit and sync again → creatives', { timeout: 180000, skip: SKIP }, async () => {
  const lyricsCalls = [], analysisCalls = [], meaningCalls = [];
  const product = await openProduct({
    lyricsCalls, analysisCalls, meaningCalls,
    lyrics: ({ lines }) => lines
      ? lyricsResult(lines.flat().join(' '), { language: 'pt', source: 'supplied' })
      : lyricsResult(HEARD, { language: 'pt' }),
  });
  const { page } = product;
  try {
    await uploadSong(page);

    // Step 2: one page, no technical controls, a plain time range.
    assert.equal(await page.getByText('Move the 15-second window').count(), 0);
    assert.equal(await page.getByLabel('Clip start (ms)').count(), 0);
    assert.equal(await page.getByText('Source file details').count(), 0);
    assert.equal(await page.getByText('Video type').count(), 0);
    assert.match(await page.locator('.clip-range strong').innerText(), /0:00\s*–\s*0:15/);
    await page.getByLabel('Choose your 15 seconds').press('ArrowRight');
    assert.match(await page.locator('.clip-range strong').innerText(), /0:01\s*–\s*0:16/);
    await page.getByLabel('Choose your 15 seconds').press('ArrowLeft');

    // Continue is locked until lyrics exist and are synced.
    const next = page.locator('.step-actions .primary-accent');
    assert.equal(await next.isDisabled(), true);

    // Find the lyrics: the worker is asked to transcribe (no lines), language auto.
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
    assert.deepEqual(lyricsCalls[0], { lines: null, language: null });
    assert.equal(await page.locator('.lang-chip').innerText(), 'Portuguese');
    assert.equal((await page.locator('.lyrics-editor').inputValue()).replace(/\n/g, ' '), HEARD);
    assert.equal(await next.isDisabled(), false);

    // Fix a word: Continue locks until synced again, and the edited words are what get sent.
    await page.locator('.lyrics-editor').fill(HEARD.replace('graça', 'graca amém'));
    assert.equal(await next.isDisabled(), true);
    await page.getByRole('button', { name: 'Sync again' }).click();
    await page.waitForFunction(() => !document.querySelector('.lyrics-working'), null, { timeout: 30000 });
    assert.equal(lyricsCalls.length, 2);
    assert.deepEqual(lyricsCalls[1].lines.flat().slice(-4), ['graca', 'amém', 'para', 'sempre']);
    assert.equal(await next.isDisabled(), false);

    // Continue → the music analysis of this exact clip is requested and creatives are recommended.
    await next.click();
    assert.equal(await page.getByText('Upload media').count(), 0, 'no Director gate any more');
    await page.getByRole('heading', { name: /recommended creatives/ }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length === 8, null, { timeout: 30000 });
    assert.equal(analysisCalls.length, 1);
    // The words are read once per distinct text (heard, then edited), only after they are final, with nothing else attached.
    assert.equal(meaningCalls.length, 2);
    assert.deepEqual(Object.keys(meaningCalls[1]).sort(), ['language', 'lines']);
    assert.equal(meaningCalls[1].language, 'pt');
    assert.ok(meaningCalls[1].lines.join(' ').includes('graca amém'));
    assert.deepEqual(product.errors, []);
  } finally { await product.close(); }
});

test('a worker failure is retried once, and a second failure keeps the user\'s words', { timeout: 120000, skip: SKIP }, async () => {
  let calls = 0;
  const product = await openProduct({
    lyrics: () => (++calls <= 2 ? new Error('The lyrics job failed. Try again.') : lyricsResult(HEARD, { language: 'pt' })),
  });
  const { page } = product;
  try {
    await uploadSong(page);
    await page.getByRole('button', { name: "I'll type them myself" }).click();
    await page.locator('textarea.lyrics-editor').fill('meu texto digitado');
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.getByRole('alert').filter({ hasText: 'lyrics job failed' }).waitFor({ timeout: 30000 });
    assert.equal(calls, 2, 'one automatic retry, then the error is shown');
    assert.equal(await page.locator('textarea.lyrics-editor').inputValue(), 'meu texto digitado');
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lang-chip').waitFor({ timeout: 30000 });
  } finally { await product.close(); }
});

test('the cover inside the uploaded file steers which backgrounds lead', { timeout: 240000, skip: SKIP }, async () => {
  const leading = async (color) => {
    const product = await openProduct({ lyrics: () => lyricsResult('hold me close tonight', { language: 'en' }) });
    const { page } = product;
    try {
      await uploadSong(page, { file: songMp3WithCover(color) });
      await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
      await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
      await page.locator('.step-actions .primary-accent').click();
      await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length === 8, null, { timeout: 30000 });
      assert.deepEqual(product.errors, []);
      await page.waitForTimeout(2500); // previews are painted asynchronously
      if (process.env.MUMOO_SHOTS) await page.screenshot({ path: `${process.env.MUMOO_SHOTS}/cover-${color}.png`, fullPage: true });
      // What the creator actually sees: how red-vs-blue the first three previews are (mean of R - B, -255…255).
      return await page.evaluate(() => [...document.querySelectorAll('.creatives-pack-card canvas')].slice(0, 3).map(canvas => {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] - data[i + 2];
        return Math.round(sum / (data.length / 4));
      }));
    } finally { await product.close(); }
  };
  const warm = await leading('0xe1782a');
  const cool = await leading('0x2a3ea0');
  const mean = values => values.reduce((n, v) => n + v, 0) / values.length;
  assert.ok(mean(warm) > 20, `warm cover leads with warm previews (red minus blue): ${warm}`);
  assert.ok(mean(cool) < -10, `cool cover leads with cool previews (red minus blue): ${cool}`);
});

test('what the lyrics mean greys and cools the previews of the same song', { timeout: 240000, skip: SKIP }, async () => {
  const preview = async (meaning) => {
    const product = await openProduct({ meaning, lyrics: () => lyricsResult('you cannot change me', { language: 'en' }) });
    const { page } = product;
    try {
      await uploadSong(page, { file: songMp3WithCover('0xe1782a') });
      await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
      await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
      await page.locator('.step-actions .primary-accent').click();
      await page.getByRole('heading', { name: /recommended creatives/ }).waitFor({ timeout: 30000 });
      await page.getByText('Reading what your lyrics say').waitFor({ state: 'detached', timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length === 8, null, { timeout: 30000 });
      await page.waitForTimeout(3000); // previews are painted asynchronously
      assert.deepEqual(product.errors, []);
      // Same song, same cards: how colourful (max - min channel) and how warm (R - B) the previews are on average.
      return await page.evaluate(() => {
        let spread = 0, warm = 0, pixels = 0;
        for (const canvas of document.querySelectorAll('.creatives-pack-card canvas')) {
          const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < data.length; i += 4) {
            spread += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
            warm += data[i] - data[i + 2];
            pixels++;
          }
        }
        return { spread: spread / pixels, warm: warm / pixels };
      });
    } finally { await product.close(); }
  };
  const plain = await preview(NEUTRAL_READING);
  const sad = await preview({ ...NEUTRAL_READING, attitude: 'heartbroken', sadness: 3, intensity: 2 });
  assert.ok(sad.spread < plain.spread - 8, `sad words dull the previews: ${plain.spread} → ${sad.spread}`);
  assert.ok(sad.warm < plain.warm - 8, `sad words cool the previews: ${plain.warm} → ${sad.warm}`);
});
