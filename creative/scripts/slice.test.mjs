import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

function wav(seconds, markers = [], sampleRate = rate) {
  const samples = seconds * sampleRate;
  const data = Buffer.alloc(44 + 2 * samples);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (const marker of markers) {
    const first = Math.round(marker * sampleRate);
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

test('Orbit exports actual animated frames and selected audio', { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mumoo-orbit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const composition = join(directory, 'composition.json');
  const source = join(directory, 'source.wav');
  const output = join(directory, 'orbit.mp4');
  const clip = { sourceSha256: fixture.sourceSha256, offsetMs: 2000, durationMs: 15000 };
  const assembly = { version: 1, engineVersion: 1, variationSeed: 0, id: 'orbit-v1', compositionId: 'orbit', clip, durationMs: 15000, assets: [], provenance: 'MUMOO original procedural graphics', layers: [], timeline: { version: 1, clip, beatsMs: [1000, 1500, 2000], onsetsMs: [1000], energy: [{ timeMs: 0, rms: 0.3, centroidHz: 1000 }], tempo: { status: 'estimated', bpm: 120, alternativesBpm: [60] } } };
  assembly.layers.push({ id: 'orbit', kind: 'procedural', effect: 'orbit', startMs: 0, endMs: 15000, opacity: 1 });
  await writeFile(composition, JSON.stringify({ ...approved, template: 'orbit', assembly }));
  await writeFile(source, sourceBytes);
  const result = await exportMp4(composition, source, output);
  const probe = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
  assert.deepEqual([probe.streams[0].codec_name, probe.streams[0].width, probe.streams[0].height, probe.streams[0].nb_frames, probe.streams[1].codec_name, probe.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
  const frames = execFileSync(ffmpeg.path, ['-v', 'error', '-i', output, '-vf', "select='eq(n,0)+eq(n,30)',scale=54:96", '-vsync', '0', '-pix_fmt', 'gray', '-f', 'rawvideo', '-']);
  assert.notDeepEqual(frames.subarray(0, 54 * 96), frames.subarray(54 * 96));
  t.diagnostic(JSON.stringify({ seconds: result.seconds, bytes: Number(probe.format.size) }));
});

test('Horizon image assembly exports a visible scene transition', { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mumoo-horizon-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const composition = join(directory, 'composition.json');
  const source = join(directory, 'source.wav');
  const output = join(directory, 'horizon.mp4');
  const clip = { sourceSha256: fixture.sourceSha256, offsetMs: 2000, durationMs: 15000 };
  const assembly = { version: 1, engineVersion: 1, variationSeed: 1, id: 'horizon-v1', compositionId: 'horizon', clip, durationMs: 15000, assets: ['horizon-a', 'horizon-b'], provenance: 'MUMOO original procedural graphics', layers: [
    { id: 'first', kind: 'image', asset: 'horizon-a', startMs: 0, endMs: 8200, opacity: 1, fadeOutMs: 1400 },
    { id: 'second', kind: 'image', asset: 'horizon-b', startMs: 6800, endMs: 15000, opacity: 1, fadeInMs: 1400 },
    { id: 'overlay', kind: 'procedural', effect: 'orbit', startMs: 0, endMs: 15000, opacity: 0.7 },
    { id: 'lyrics', kind: 'lyrics', startMs: 0, endMs: 15000, opacity: 1 },
  ], timeline: null };
  await writeFile(composition, JSON.stringify({ ...approved, template: 'horizon', assembly }));
  await writeFile(source, sourceBytes);
  const result = await exportMp4(composition, source, output);
  const probe = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
  assert.deepEqual([probe.streams[0].codec_name, probe.streams[0].width, probe.streams[0].height, probe.streams[0].nb_frames, probe.streams[1].codec_name, probe.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
  const frames = execFileSync(ffmpeg.path, ['-v', 'error', '-i', output, '-vf', "select='eq(n,180)+eq(n,225)+eq(n,270)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const size = 54 * 96 * 3; assert.equal(frames.length, size * 3);
  assert.notDeepEqual(frames.subarray(0, size), frames.subarray(size, size * 2));
  assert.notDeepEqual(frames.subarray(size, size * 2), frames.subarray(size * 2));
  const pcm = execFileSync(ffmpeg.path, ['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 2_000_000 });
  const markers = [];
  for (let offset = 0; offset < pcm.length; offset += 2) {
    if (Math.abs(pcm.readInt16LE(offset)) < 9000) continue;
    const time = offset / 2 / rate;
    if (!markers.length || time - markers.at(-1) > 0.1) markers.push(time);
  }
  assert.equal(markers.length, 3);
  [1.017, 2.017, 14.9].forEach((expected, index) => assert.ok(Math.abs(markers[index] - expected) < 0.005));
  const second = join(directory, 'horizon-b.mp4');
  const repeat = join(directory, 'horizon-repeat.mp4');
  await writeFile(composition, JSON.stringify({ ...approved, template: 'horizon', assembly: { ...assembly, variationSeed: 0 } }));
  await exportMp4(composition, source, second);
  await writeFile(composition, JSON.stringify({ ...approved, template: 'horizon', assembly }));
  await exportMp4(composition, source, repeat);
  const sample = path => execFileSync(ffmpeg.path, ['-v', 'error', '-i', path, '-vf', "select='eq(n,90)+eq(n,225)+eq(n,360)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const firstFrames = sample(output);
  assert.notDeepEqual(firstFrames, sample(second), 'different seeds must change rendered frames');
  assert.deepEqual(firstFrames, sample(repeat), 'the same seed must reproduce encoded frames');
  const parityServer = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await parityServer.listen();
  const parityBrowser = await chromium.launch();
  try {
    const page = await parityBrowser.newPage();
    await page.goto(`http://127.0.0.1:${parityServer.httpServer.address().port}/export.html`);
    await page.waitForFunction(() => Boolean(window.mumoo));
    await page.evaluate(value => window.mumoo.prepare(value, 18000), { ...approved, template: 'horizon', assembly });
    const rawFrames = [];
    for (const index of [90, 225, 360]) {
      const png = Buffer.from(await page.evaluate(frame => window.mumoo.frame(frame), index), 'base64');
      rawFrames.push(execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=54:96', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: png }));
    }
    const raw = Buffer.concat(rawFrames);
    const meanError = raw.reduce((sum, value, index) => sum + Math.abs(value - firstFrames[index]), 0) / raw.length;
    assert.ok(meanError < 12, `preview/export mean pixel error ${meanError}`);
    t.diagnostic(`Preview/export mean absolute RGB error: ${meanError.toFixed(2)} / 255`);
  } finally { await parityBrowser.close(); await parityServer.close(); }
  if (process.env.MUMOO_HORIZON_SAMPLE) await copyFile(output, process.env.MUMOO_HORIZON_SAMPLE);
  t.diagnostic(JSON.stringify({ seconds: result.seconds, bytes: Number(probe.format.size) }));
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
