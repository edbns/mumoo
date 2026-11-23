import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRunBrowserTests, cardColours, lyricsResult, NEUTRAL_READING, openProduct, reachShelf, songMp3WithCover, songWav, uploadSong } from './support/product-flow.mjs';

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
    await page.getByLabel('Pick your clip').press('ArrowRight');
    assert.match(await page.locator('.clip-range strong').innerText(), /0:01\s*–\s*0:16/);
    await page.getByLabel('Pick your clip').press('ArrowLeft');

    // Continue is locked until lyrics exist and are synced.
    const next = page.locator('.step-actions').getByRole('button', { name: 'Continue' });
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
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length > 0 && !document.querySelector('.creatives-pack-card.pending'), null, { timeout: 30000 });
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
    await page.getByRole('button', { name: /type them myself/ }).click();
    await page.locator('textarea.lyrics-editor').fill('meu texto digitado');
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.getByRole('alert').filter({ hasText: 'lyrics job failed' }).waitFor({ timeout: 30000 });
    assert.equal(calls, 2, 'one automatic retry, then the error is shown');
    assert.equal(await page.locator('textarea.lyrics-editor').inputValue(), 'meu texto digitado');
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lang-chip').waitFor({ timeout: 30000 });
  } finally { await product.close(); }
});

test('the colour of the cover inside the uploaded file colours the Dust card', { timeout: 240000, skip: SKIP }, async () => {
  const dust = async (color) => {
    const product = await openProduct({ lyrics: () => lyricsResult('hold me close tonight', { language: 'en' }) });
    const { page } = product;
    try {
      await uploadSong(page, { file: songMp3WithCover(color) });
      await reachShelf(page);
      assert.deepEqual(product.errors, []);
      if (process.env.MUMOO_SHOTS) await page.screenshot({ path: `${process.env.MUMOO_SHOTS}/cover-${color}.png`, fullPage: true });
      return (await cardColours(page)).Dust;
    } finally { await product.close(); }
  };
  const warm = await dust('0xe1782a');
  const cool = await dust('0x2a3ea0');
  assert.ok(warm.warm > 20, `a warm cover gives a warm Dust card (red minus blue): ${warm.warm}`);
  assert.ok(cool.warm < -10, `a cool cover gives a cool Dust card (red minus blue): ${cool.warm}`);
});

test('sad words grey and cool the live looks, and leave the photo cards (whose preset is their colour) alone', { timeout: 240000, skip: SKIP }, async () => {
  const shelf = async (meaning) => {
    const product = await openProduct({ meaning, lyrics: () => lyricsResult('you cannot change me', { language: 'en' }) });
    const { page } = product;
    try {
      await uploadSong(page, { file: songMp3WithCover('0xe1782a') });
      await reachShelf(page);
      assert.deepEqual(product.errors, []);
      return await cardColours(page);
    } finally { await product.close(); }
  };
  const plain = await shelf(NEUTRAL_READING);
  const sad = await shelf({ ...NEUTRAL_READING, attitude: 'sad', sadness: 3, intensity: 2 });
  const mean = (cards, key) => ['Thermal', 'Halftone', 'Dither', 'ASCII'].reduce((sum, name) => sum + cards[name][key], 0) / 4;
  assert.ok(mean(sad, 'spread') < mean(plain, 'spread') - 4, `sad words dull the live looks: ${mean(plain, 'spread')} → ${mean(sad, 'spread')}`);
  assert.ok(mean(sad, 'warm') < mean(plain, 'warm') - 8, `sad words cool the live looks: ${mean(plain, 'warm')} → ${mean(sad, 'warm')}`);
  for (const name of ['Directed', 'Triptych', 'Collage', 'Film Grain']) assert.deepEqual(sad[name], plain[name], `${name} keeps its preset's colours`);
});

test('every card on the shelf plays from the start of the 15 seconds, wherever the last one was stopped', { timeout: 180000, skip: SKIP }, async () => {
  const product = await openProduct({ lyrics: () => lyricsResult('we keep on running back to you every night', { language: 'en' }) });
  const { page } = product;
  try {
    // Where in the song each sound starts: [offset s, length s].
    await page.evaluate(() => {
      const start = AudioBufferSourceNode.prototype.start;
      window.__starts = [];
      AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
        if (duration) window.__starts.push([offset ?? 0, duration]);
        return start.call(this, when, offset, duration);
      };
    });
    await uploadSong(page);
    await reachShelf(page);
    const play = page.getByRole('button', { name: /^Play .+ creative$/ });
    const second = await play.nth(1).getAttribute('aria-label');
    await play.nth(0).click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: second }).click();
    await page.waitForTimeout(500);
    const starts = await page.evaluate(() => window.__starts);
    assert.equal(starts.length, 2, `two cards played: ${JSON.stringify(starts)}`);
    for (const [offset, duration] of starts) assert.deepEqual([offset, duration], [0, 15], `a card starts at 0 and plays all 15 s: ${JSON.stringify(starts)}`);
    assert.deepEqual(product.errors, []);
  } finally { await product.close(); }
});

test('a 12-second song (a saved TikTok) is the clip, whole, and its cards play all 12 seconds', { timeout: 180000, skip: SKIP }, async () => {
  const analysisCalls = [];
  const product = await openProduct({ analysisCalls, lyrics: () => lyricsResult('short and sweet for the feed', { language: 'en' }) });
  const { page } = product;
  try {
    await page.evaluate(() => {
      const start = AudioBufferSourceNode.prototype.start;
      window.__starts = [];
      AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
        if (duration) window.__starts.push([offset ?? 0, duration]);
        return start.call(this, when, offset, duration);
      };
    });
    await uploadSong(page, { seconds: 12, heading: 'Your clip' });
    assert.match(await page.locator('.clip-range strong').innerText(), /0:00\s*–\s*0:12/);
    await page.getByText('Your whole song is the clip: 12 seconds.').waitFor();
    await page.getByLabel('Pick your clip').press('ArrowRight');
    assert.match(await page.locator('.clip-range strong').innerText(), /0:00\s*–\s*0:12/, 'there is nothing to move');
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
    await page.getByText('/ 0:12').waitFor();
    await page.locator('.step-actions').getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length > 0 && !document.querySelector('.creatives-pack-card.pending'), null, { timeout: 30000 });
    assert.equal(analysisCalls.length, 1);
    await page.getByRole('button', { name: /^Play .+ creative$/ }).first().click();
    await page.waitForTimeout(500);
    const starts = await page.evaluate(() => window.__starts);
    assert.deepEqual(starts.at(-1), [0, 12], `the card plays the whole 12 s: ${JSON.stringify(starts)}`);
    assert.deepEqual(product.errors, []);
  } finally { await product.close(); }
});

test('a song under 10 seconds is refused before the clip step', { timeout: 120000, skip: SKIP }, async () => {
  const product = await openProduct({ lyrics: () => lyricsResult('too short', { language: 'en' }) });
  const { page } = product;
  try {
    await page.locator('input[type=file]').first().setInputFiles({ name: 'short.wav', mimeType: 'audio/wav', buffer: songWav(8) });
    await page.getByRole('alert').filter({ hasText: 'Need at least 10' }).waitFor({ timeout: 30000 });
    assert.deepEqual(product.errors, []);
  } finally { await product.close(); }
});

test('a picked genre the song does not sound like is questioned on the analysis page, and a switch paints for the genre it heard', { timeout: 180000, skip: SKIP }, async () => {
  const styleCalls = [];
  const heard = { style: 'funk carioca', genre: 'Latin & Urbano', subGenre: 'General Latin' };
  const product = await openProduct({ styleCalls, styleGuess: heard, lyrics: () => lyricsResult('vai descendo devagarinho', { language: 'pt' }) });
  const { page } = product;
  try {
    await uploadSong(page, { genre: 'Pop' });
    await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
    await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
    const dialog = page.getByRole('dialog', { name: 'Sounds more like Funk carioca' });
    for (let tries = 0; !styleCalls.some(body => body.guess) && tries < 100; tries += 1) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    assert.equal(await dialog.count(), 0, 'the guess is in, but nothing is asked before the analysis page');
    await page.locator('.step-actions').getByRole('button', { name: 'Continue' }).click();
    await dialog.waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.creatives-pack-card:not(.pending)').count(), 0, 'no creative is shown for the wrong genre meanwhile');
    await dialog.getByRole('button', { name: 'Switch to Funk carioca' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length > 0 && !document.querySelector('.creatives-pack-card.pending'), null, { timeout: 30000 });
    const guess = styleCalls.find(body => body.guess);
    assert.deepEqual(guess.picked, { style: 'pop music', genre: 'Pop', subGenre: 'General Pop' }, `the pick is sent to be checked: ${JSON.stringify(guess.picked)}`);
    const answer = styleCalls.find(body => body.answer);
    assert.deepEqual([answer.answer, answer.style, answer.picked.style], ['yes', 'funk carioca', 'pop music']);
    const tempos = styleCalls.filter(body => body.tempo);
    assert.deepEqual(tempos.map(body => [body.tempo.sourceSha256 === guess.guess.sourceSha256, body.tempo.bpm, body.tempo.energy]), [[true, 100, 0.2]], 'the song reader\'s tempo of the clip is kept once');
    assert.deepEqual(product.errors, []);
  } finally { await product.close(); }
});
