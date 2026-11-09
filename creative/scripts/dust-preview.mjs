/**
 * Renders the Dust prototype (dust.html) with Brave and writes JPEGs or a 15 s MP4 with the song's audio to /tmp/dust.
 *
 *   node scripts/dust-preview.mjs headed 200,330,500 7          stills at those ms, colour seed 7
 *   node scripts/dust-preview.mjs headed video 7 techno         the whole clip as MP4 (clip: a scripts/fixtures/analysis name)
 *   node scripts/dust-preview.mjs swift 600,610 7               same, on software GL like the cloud worker (reports ms per frame)
 *
 * Env: LYRICS=0 hides the lyric word, GRAINS=<count>, AA=0 turns antialiasing off (much faster on software GL; the grains are smoothed in the shader anyway).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const [mode = 'headed', what = '200,330,500,1500', seeds = '7', clip = 'techno', image = '/punch-plates/burnnet-woman-1547507-1920.jpg'] = process.argv.slice(2);
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/dust.html`;
const { rhythm } = JSON.parse(readFileSync(`scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const cues = JSON.parse(readFileSync(`scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));
const browser = await chromium.launch(mode === 'swift'
  ? { headless: true, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
  : { headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.dustLab);
const info = await page.evaluate(r => window.dustLab.prepare({ imageUrl: r.image, beatsMs: r.beats, downbeatsMs: r.downbeats, cues: r.cues, grains: r.grains, antialias: r.antialias }), { image, beats: rhythm.beatsMs, downbeats: rhythm.downbeatsMs, cues, grains: process.env.GRAINS ? Number(process.env.GRAINS) : undefined, antialias: process.env.AA !== '0' });
console.log(mode, 'prepared', info);
mkdirSync('/tmp/dust', { recursive: true });
for (const seed of seeds.split(',').map(Number)) {
  if (what === 'video') {
    rmSync('/tmp/dust/frames', { recursive: true, force: true }); mkdirSync('/tmp/dust/frames');
    let total = 0;
    for (let f = 0; f < 450; f++) {
      const out = await page.evaluate(a => window.dustLab.frame({ ms: a.ms, seed: a.seed, lyrics: a.lyrics }, true), { ms: f * 1000 / 30, seed, lyrics: process.env.LYRICS !== '0' });
      total += out.ms;
      writeFileSync(`/tmp/dust/frames/${String(f).padStart(4, '0')}.jpg`, Buffer.from(out.jpeg, 'base64'));
    }
    console.log('avg draw ms/frame', Math.round(total / 450));
    const dest = `/tmp/dust/dust-${clip}-seed${seed}.mp4`;
    const r = spawnSync(ffmpeg.path, ['-y', '-framerate', '30', '-i', '/tmp/dust/frames/%04d.jpg', '-i', `scripts/fixtures/analysis/${clip}-clip.wav`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-maxrate', '14M', '-bufsize', '28M', '-c:a', 'aac', '-shortest', dest], { encoding: 'utf8' });
    console.log(r.status === 0 ? `wrote ${dest}` : r.stderr.slice(-400));
  } else {
    for (const ms of what.split(',').map(Number)) {
      const t0 = Date.now();
      const out = await page.evaluate(a => window.dustLab.frame({ ms: a.ms, seed: a.seed, lyrics: a.lyrics }, true), { ms, seed, lyrics: process.env.LYRICS !== '0' });
      out.ms = Date.now() - t0;
      writeFileSync(`/tmp/dust/${mode}-s${seed}-${ms}.jpg`, Buffer.from(out.jpeg, 'base64'));
      console.log('seed', seed, 'ms', ms, 'draw', Math.round(out.ms), 'ms');
    }
  }
}
await browser.close(); await server.close();
