import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { exportMp4 } from './export.mjs';

const rate = 48_000;
const fixture = {
  version: 1, template: 'scribble', clipStartMs: 2000,
  lyric: { text: 'ON THE BEAT', startMs: 1017, endMs: 2017 },
};

function wav(seconds, markers = []) {
  const samples = seconds * rate;
  const data = Buffer.alloc(44 + 2 * samples);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (const marker of markers) {
    const first = Math.round(marker * rate);
    for (let n = 0; n < 480; n++) {
      data.writeInt16LE(Math.round(28_000 * Math.sin(n * Math.PI / 8)), 44 + (first + n) * 2);
    }
  }
  return data;
}

const sourceBytes = wav(18, [0.5, 3.017, 4.017, 16.9, 17.5]);
fixture.sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const { lyric, ...base } = fixture;
const approved = { ...base, version: 2, cues: [lyric, { text: 'SECOND LINE', startMs: 4000, endMs: 5000 }] };

test('built editor trims WAV, matches cue frames, and downloads a real MP4', { timeout: 180_000 }, async () => {
  await build({ logLevel: 'error' });
  const deployed = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const page = await browser.newPage();
    const render = await browser.newPage();
    await page.goto(`http://127.0.0.1:${deployed.httpServer.address().port}`);
    await render.goto(origin + '/export.html');
    await render.waitForFunction(() => Boolean(window.mumoo));
    await render.evaluate(snapshot => window.mumoo.prepare(snapshot, 18000), fixture);

    const upload = page.getByLabel('Source WAV');
    const choose = buffer => upload.setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer });
    await choose(Buffer.from('not a WAV'));
    await page.getByRole('alert').getByText(/valid RIFF WAV/).waitFor();
    await choose(wav(14));
    await page.getByRole('alert').getByText(/at least 15 seconds/).waitFor();
    await choose(sourceBytes);
    const next = page.getByRole('button', { name: 'Continue without lyrics' });
    await next.waitFor();
    const clipStart = page.getByLabel('Clip start (ms)');
    await clipStart.fill('3001');
    assert.equal(await next.isDisabled(), true);
    await clipStart.fill('0');
    const wave = page.getByRole('img', { name: /Song waveform/ });
    const bounds = await wave.boundingBox();
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(bounds.x + bounds.width * 0.4, y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.5, y, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs(Number(await clipStart.inputValue()) - 1800) < 50);
    await page.getByRole('slider', { name: 'Move the 15-second window' }).fill('2000');
    assert.equal(await clipStart.inputValue(), '2000');
    await page.getByText('Selected · 2.000–17.000 s').waitFor();
    await page.getByRole('button', { name: 'Audition selection' }).click();
    await page.getByRole('button', { name: 'Pause audition' }).click();
    await page.getByText('Advanced manual timing', { exact: true }).click();
    const add = page.getByRole('button', { name: 'Add lyric line' });
    await add.click();
    const approve = page.getByRole('button', { name: 'Approve lyrics and choose visual' });
    assert.equal(await approve.isDisabled(), true);
    await page.getByLabel('Lyric 1', { exact: true }).fill(lyric.text);
    await page.getByLabel('Line 1 in (ms)').fill('1017');
    await page.getByLabel('Line 1 out (ms)').fill('2017');
    await add.click();
    await page.getByLabel('Lyric 2', { exact: true }).fill('SECOND LINE');
    await page.getByLabel('Seek within selection').fill('4000');
    await page.getByRole('button', { name: 'Set in to playhead' }).nth(1).click();
    await page.getByLabel('Line 2 out (ms)').fill('5000');
    await page.getByText('Current lyric: SECOND LINE').waitFor();
    const timing = page.getByRole('region', { name: 'Review lyric timing' });
    const secondLineButton = timing.getByRole('button', { name: 'SECOND LINE' });
    assert.equal(await secondLineButton.getAttribute('aria-current'), 'true');
    await timing.getByRole('button', { name: lyric.text }).click();
    await page.getByText('Current lyric: ' + lyric.text, { exact: true }).waitFor();
    await approve.click();
    await page.getByRole('button', { name: 'Edit music and lyrics' }).click();
    assert.equal(await clipStart.inputValue(), '2000');
    await page.getByText('Advanced manual timing', { exact: true }).click();
    assert.equal(await page.getByLabel('Line 2 in (ms)').inputValue(), '4000');
    await approve.click();
    await page.getByText('2 approved lyric cues').waitFor();
    await page.getByText('Local export fallback', { exact: true }).click();
    const save = page.getByRole('button', { name: 'Download composition JSON' });
    const downloaded = page.waitForEvent('download');
    await save.click();
    const file = await downloaded;
    assert.equal(file.suggestedFilename(), 'composition.json');
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), approved);
    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    const seek = page.getByRole('slider', { name: 'Seek within clip' });
    const images = [];
    for (const index of [30, 31, 60, 61]) {
      const position = Math.ceil(index * 1000 / 30);
      await seek.fill(String(position));
      const expected = await render.evaluate(frame => window.mumoo.frame(frame), index);
      await page.waitForFunction(png => document.querySelector('canvas').toDataURL().endsWith(png), expected);
      images.push(expected);
    }
    assert.equal(images[0], images[3]);
    assert.notEqual(images[0], images[1]);
    assert.notEqual(images[1], images[2]);
    await render.evaluate(snapshot => window.mumoo.prepare(snapshot, 18000), approved);
    await seek.fill('4000');
    const secondLine = await render.evaluate(() => window.mumoo.frame(120));
    await page.waitForFunction(png => document.querySelector('canvas').toDataURL().endsWith(png), secondLine);
    const previewFrames = new Set();
    const exportedFrames = new Set();
    for (const template of ['scribble', 'elastic', 'glitch']) {
      await page.locator(`input[name="motion-preset"][value="${template}"]`).check();
      await seek.fill('1034');
      await render.evaluate(snapshot => window.mumoo.prepare(snapshot, 18000), { ...approved, template });
      const expected = await render.evaluate(() => window.mumoo.frame(31));
      await page.waitForFunction(png => document.querySelector('canvas').toDataURL().endsWith(png), expected);
      previewFrames.add(expected);
      const downloadMp4 = page.waitForEvent('download', { timeout: 90_000 });
      const failed = page.getByRole('alert').waitFor({ timeout: 90_000 }).then(async () => {
        throw new Error(await page.getByRole('alert').innerText());
      });
      await page.getByRole('button', { name: 'Export MP4' }).click();
      const mp4 = await Promise.race([downloadMp4, failed]);
      assert.equal(mp4.suggestedFilename(), 'mumoo.mp4');
      exportedFrames.add(verifyMp4(await mp4.path(), true).frameDigest);
    }
    assert.equal(previewFrames.size, 3);
    assert.equal(exportedFrames.size, 3);
  } finally {
    await browser.close();
    await server.close();
    await new Promise((resolve, reject) => deployed.httpServer.close(error => error ? reject(error) : resolve()));
  }
});

test('real MP4 preserves the selected source segment and cue synchronization', { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mumoo-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const composition = join(directory, 'composition.json');
  const source = join(directory, 'source.wav');
  const output = join(directory, 'output.mp4');
  await writeFile(composition, JSON.stringify(fixture));
  // Outside markers detect accidentally exporting the beginning or end of the source.
  await writeFile(source, wav(18));
  await assert.rejects(exportMp4(composition, source, output), /does not match/);
  await writeFile(source, sourceBytes);
  const result = await exportMp4(composition, source, output);
  t.diagnostic(JSON.stringify({ ...result, ...verifyMp4(output) }));
});

function verifyMp4(output, hasSecondLine = false) {
  const probe = JSON.parse(execFileSync(ffprobe.path, [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', output,
  ]));
  const [video, audio] = probe.streams;
  assert.deepEqual([
    video.codec_name, video.width, video.height, video.avg_frame_rate, video.nb_frames, video.duration,
    audio.codec_name, audio.duration, probe.format.duration,
  ], ['h264', 1080, 1920, '30/1', '450', '15.000000', 'aac', '15.000000', '15.000000']);

  const pcm = execFileSync(ffmpeg.path, [
    '-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-',
  ], { maxBuffer: 2_000_000 });
  const markers = [];
  for (let offset = 0; offset < pcm.length; offset += 2) {
    if (Math.abs(pcm.readInt16LE(offset)) < 9000) continue;
    const time = offset / 2 / rate;
    if (!markers.length || time - markers.at(-1) > 0.1) markers.push(time);
  }
  assert.equal(markers.length, 3);
  assert.ok(Math.abs(markers[2] - 14.9) < 0.005);
  const errors = markers.slice(0, 2).map((marker, index) => {
    assert.ok(Math.abs(marker - (1.017 + index)) < 0.005);
    return Math.abs((31 + index * 30) / 30 - marker) * 1000;
  });
  assert.ok(errors.every(error => error < 1000 / 30));
  const pixels = execFileSync(ffmpeg.path, [
    '-v', 'error', '-i', output, '-an',
    '-vf', "select='eq(n,30)+eq(n,31)+eq(n,60)+eq(n,61)+eq(n,120)+eq(n,150)',scale=54:96",
    '-vsync', '0', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
  ]);
  const frameSize = 54 * 96;
  assert.equal(pixels.length, frameSize * 6);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(index =>
    pixels.subarray(index * frameSize, (index + 1) * frameSize).some(pixel => pixel < 100)),
  [false, true, true, false, hasSecondLine, false]);
  return { ffmpeg: ffmpeg.version, ffprobe: ffprobe.version,
    frameDigest: createHash('sha256').update(pixels).digest('hex'),
    audioMarkerSeconds: markers, syncErrorMs: errors, bytes: Number(probe.format.size) };
}

test('real model syncs pasted words in the production worker', {
  skip: !process.env.MUMOO_SYNC_FIXTURE,
  timeout: 240_000,
}, async () => {
  await build({ logLevel: 'error' });
  const deployed = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${deployed.httpServer.address().port}`);
    await page.getByLabel('Source WAV').setInputFiles(process.env.MUMOO_SYNC_FIXTURE);
    await page.getByLabel('Lyrics for this section').fill('the quick brown fox jumps over the lazy dog');
    await page.getByRole('button', { name: 'Sync lyrics', exact: true }).click();
    await Promise.race([
      page.getByRole('button', { name: 'Approve lyrics and choose visual' }).waitFor({ timeout: 200_000 }),
      page.getByRole('alert').waitFor({ timeout: 200_000 }).then(async () => {
        throw new Error(await page.getByRole('alert').innerText());
      }),
    ]);
    await page.getByRole('button', { name: 'Approve lyrics and choose visual' }).click();
    await page.getByText('9 approved lyric cues').waitFor();
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => deployed.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
