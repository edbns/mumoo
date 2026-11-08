import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRunBrowserTests, lyricsResult, openProduct, uploadSong } from './support/product-flow.mjs';

const SKIP = !canRunBrowserTests;
const HEARD = 'louvado seja o Senhor Deus gloria e graça para sempre';

test('song → clip + lyrics → edit and sync again → creatives', { timeout: 180000, skip: SKIP }, async () => {
  const lyricsCalls = [], analysisCalls = [];
  const product = await openProduct({
    lyricsCalls, analysisCalls,
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
    await page.getByRole('button', { name: /Mumoo creatives/ }).click();
    await page.getByRole('heading', { name: /recommended creatives/ }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length === 8, null, { timeout: 30000 });
    assert.equal(analysisCalls.length, 1);
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
