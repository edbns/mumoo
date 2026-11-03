import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';
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

test('editor validates WAV, seeks, and matches renderer at cue boundaries', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const page = await browser.newPage();
    const render = await browser.newPage();
    await page.goto(origin);
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
    const save = page.getByRole('button', { name: 'Save composition JSON' });
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Save composition JSON').disabled);
    await page.getByLabel('Clip start (ms)').fill('3001');
    assert.equal(await save.isDisabled(), true);
    await page.getByLabel('Clip start (ms)').fill('2000');
    await page.getByLabel('Lyric', { exact: true }).fill(fixture.lyric.text);
    await page.getByLabel('Lyric in (ms)').fill('1017');
    await page.getByLabel('Lyric out (ms)').fill('2017');
    const downloaded = page.waitForEvent('download');
    await save.click();
    const stream = await (await downloaded).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), fixture);
    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    const seek = page.getByRole('slider');
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
  } finally {
    await browser.close();
    await server.close();
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
    '-vf', "select='eq(n,30)+eq(n,31)+eq(n,60)+eq(n,61)',scale=54:96",
    '-vsync', '0', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
  ]);
  const frameSize = 54 * 96;
  assert.equal(pixels.length, frameSize * 4);
  assert.deepEqual([0, 1, 2, 3].map(index =>
    pixels.subarray(index * frameSize, (index + 1) * frameSize).some(pixel => pixel < 100)),
  [false, true, true, false]);
  t.diagnostic(JSON.stringify({
    ...result, ffmpeg: ffmpeg.version, ffprobe: ffprobe.version,
    audioMarkerSeconds: markers, syncErrorMs: errors, bytes: Number(probe.format.size),
  }));
});
