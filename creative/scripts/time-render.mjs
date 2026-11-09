/**
 * Times what one cloud chunk costs: loads the same page the Modal worker loads (render.html) in headless Chromium with
 * software WebGL, starts the scene the way the worker does, then draws consecutive frames and reports the time of each.
 *
 *   node scripts/time-render.mjs spray reggaeton 90 45     style (spray, riso, dust), clip, first frame, how many (defaults 0 and 45, one chunk)
 *   INKSET=orange-teal node scripts/time-render.mjs riso reggaeton
 *
 * Env: FONT, SEED, INKSET (riso), PALETTE (spray), LYRICS=0, PLATE. Writes the last frame to /tmp/time-render-<style>.jpg.
 * Nothing is deployed or sent anywhere: a throwaway local dev server serves the page and is closed at the end.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const [style = 'spray', clip = 'reggaeton', first = '0', count = '45'] = process.argv.slice(2);
const analysis = JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const lyrics = process.env.LYRICS !== '0';
const cues = JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words
  .map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

const opts = {
  style,
  font: process.env.FONT || 'Anton',
  fontSecondary: 'Oswald',
  layout: { rotate: 0, scaleBias: 1, cut: 0, seed: Number(process.env.SEED || 7) },
  cues: lyrics ? cues : [],
  music: { beatsMs: analysis.rhythm.beatsMs, downbeatsMs: analysis.rhythm.downbeatsMs, energy: analysis.features.frames.map(({ timeMs, rms }) => ({ timeMs, rms })) },
  fallbackText: '',
  lyrics,
  ...(style === 'riso' || style === 'dust' ? { plateId: process.env.PLATE || 'burnnet-woman-1547507-1920' } : {}),
  ...(style === 'riso' ? { inkSet: process.env.INKSET || 'pink-blue' } : {}),
  ...(style === 'dust' ? { colors: { ground: '#101820', dust: '#ffb000' } } : {}),
  ...(style === 'spray' ? { sprayPalette: process.env.PALETTE || 'neon-night' } : {}),
};

const server = await createServer({ root, server: { port: 5196, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  page.on('console', message => message.type() === 'error' && console.log('CONSOLE', message.text().slice(0, 300)));
  await page.goto(`${server.resolvedUrls.local[0]}render.html`);
  await page.waitForFunction('window.mumooPack');
  let began = Date.now();
  await page.evaluate(o => window.mumooPack.prepare(o), opts);
  console.log(`${style}: scene started in ${Date.now() - began} ms`);
  const times = [];
  let last = '';
  for (let frame = Number(first); frame < Number(first) + Number(count); frame++) {
    began = Date.now();
    last = await page.evaluate(n => window.mumooPack.frame(n, true), frame);
    times.push(Date.now() - began);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((sum, ms) => sum + ms, 0);
  console.log(`${times.length} frames from ${first}: ${total} ms in all, ${Math.round(total / times.length)} ms each (first ${times[0]}, fastest ${sorted[0]}, median ${sorted[sorted.length >> 1]}, slowest ${sorted.at(-1)})`);
  writeFileSync(`/tmp/time-render-${style}.jpg`, Buffer.from(last, 'base64'));
} finally {
  await browser.close();
  await server.close();
}
