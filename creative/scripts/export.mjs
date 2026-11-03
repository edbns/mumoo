import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, link, mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';

function inspect(path) {
  return JSON.parse(execFileSync(ffprobe.path, [
    '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path,
  ], { encoding: 'utf8' }));
}

export async function exportMp4(compositionPath, sourcePath, outputPath) {
  const started = performance.now();
  const composition = JSON.parse(await readFile(compositionPath, 'utf8'));
  const source = resolve(sourcePath);
  const output = resolve(outputPath);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  if (hash.digest('hex') !== composition?.sourceSha256) {
    throw new Error('The WAV does not match the saved composition.');
  }
  const probe = inspect(source);
  if (probe.format.format_name !== 'wav' || !probe.streams.some(stream => stream.codec_type === 'audio')) {
    throw new Error('Choose a valid WAV file.');
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(join(dirname(output), '.mumoo-'));
  let browser;
  let server;
  let encoder;
  let encoded;
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, clearScreen: false });
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${address.port}/export.html`);
    await page.waitForFunction(() => Boolean(window.mumoo));
    const { frames, fps, durationMs, width, height } = await page.evaluate(({ snapshot, duration }) => window.mumoo.prepare(snapshot, duration), {
      snapshot: composition, duration: Number(probe.format.duration) * 1000,
    });
    const candidate = join(temporary, basename(output) + '.mp4');
    encoder = spawn(ffmpeg.path, [
      '-hide_banner', '-loglevel', 'error', '-xerror',
      '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
      '-ss', (composition.clipStartMs / 1000).toFixed(3), '-i', source,
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(durationMs / 1000),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart', candidate,
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    encoded = once(encoder, 'close').then(([status]) => {
      if (status !== 0) throw new Error(`FFmpeg failed (${status}).`);
    });
    const inputFinished = finished(encoder.stdin);
    // Observe failures immediately while Chromium is still drawing.
    void encoded.catch(() => {});
    void inputFinished.catch(() => {});
    for (let index = 0; index < frames; index++) {
      const image = await page.evaluate(frame => window.mumoo.frame(frame), index);
      const png = Buffer.from(image, 'base64');
      if (!encoder.stdin.write(png)) await Promise.race([once(encoder.stdin, 'drain'), inputFinished, encoded]);
    }
    encoder.stdin.end();
    await encoded;
    const media = inspect(candidate);
    const [video, audio] = media.streams;
    const duration = durationMs / 1000;
    if (video?.codec_name !== 'h264' || video.width !== width || video.height !== height ||
        video.avg_frame_rate !== `${fps}/1` || Number(video.nb_frames) !== frames ||
        audio?.codec_name !== 'aac' || Number(audio.duration) !== duration ||
        Number(video.duration) !== duration || Number(media.format.duration) !== duration) {
      throw new Error('The encoded file did not meet the fixed MUMOO output profile.');
    }
    await link(candidate, output);
    return { output, chromium: browser.version(), seconds: (performance.now() - started) / 1000 };
  } finally {
    if (encoder && encoder.exitCode === null && encoder.signalCode === null) encoder.kill();
    await encoded?.catch(() => {});
    await browser?.close();
    await server?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 3) throw new Error('Usage: npm run export -- composition.json source.wav output.mp4');
    console.log(await exportMp4(...args));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
