/**
 * Renders one creative on the cloud worker (Modal) through the deployed staging site, so the heavy work never
 * runs on this machine. Prints how long the cloud took and saves the MP4.
 *
 *   node scripts/cloud-render.mjs dust reggaeton            Dust on the cleared library photo, lyrics on
 *   LYRICS=0 node scripts/cloud-render.mjs dust techno       the same with lyrics off
 *   SEED=4 node scripts/cloud-render.mjs dust slaphouse      pick the colour pair
 *
 * Saves to scripts/fixtures/exports/cloud-<style>-<clip>.mp4. Staging must be deployed with the code you want drawn.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const SITE = 'https://mumoo-staging.netlify.app';
const [style = 'dust', clip = 'reggaeton'] = process.argv.slice(2);
const analysis = JSON.parse(readFileSync(`scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const lyrics = process.env.LYRICS !== '0';
const cues = JSON.parse(readFileSync(`scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words
  .map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

/** The 15 s mono 32 kHz WAV the worker requires: a canonical 44-byte header and 960,000 bytes of samples. */
function canonicalWav() {
  const run = spawnSync(ffmpeg.path, ['-v', 'error', '-i', `scripts/fixtures/analysis/${clip}-clip.wav`, '-t', '15', '-ac', '1', '-ar', '32000', '-f', 's16le', 'pipe:1'], { maxBuffer: 64e6 });
  const samples = Buffer.alloc(960000);
  run.stdout.copy(samples, 0, 0, Math.min(960000, run.stdout.length));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + 960000, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(32000, 24); header.writeUInt32LE(64000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(960000, 40);
  return Buffer.concat([header, samples]);
}

// The colour pair comes from the same code the app uses.
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { dustColors } = await server.ssrLoadModule('/src/dust-colors.ts');
await server.close();

const opts = {
  style,
  font: 'Anton',
  fontSecondary: 'Oswald',
  palette: { bg: '#101014', ink: '#f5f5f5', accent: '#ff5b26' },
  layout: { driftX: 0, driftY: 0, rotate: 0, grain: 0.1, scaleBias: 1, cut: 0 },
  motion: 'scale',
  cues: lyrics ? cues : [],
  music: { beatsMs: analysis.rhythm.beatsMs, downbeatsMs: analysis.rhythm.downbeatsMs, energy: [] },
  fallbackText: '',
  lyrics,
  ...(style === 'dust' ? { dust: dustColors(Number(process.env.SEED || 7)) } : {}),
};

const headers = { Origin: SITE, 'Content-Type': 'application/json' };
const { token } = await (await fetch(`${SITE}/api/brain-tester-access`, { method: 'POST', headers, body: '{}' })).json();
const form = new FormData();
form.append('audio', new Blob([canonicalWav()], { type: 'audio/wav' }), 'clip.wav');
form.append('meta', JSON.stringify({ plate: 'burnnet-woman-1547507-1920', opts }));
const submitted = await fetch(`${SITE}/.netlify/functions/encode-creative`, { method: 'POST', headers: { Origin: SITE, 'x-mumoo-brain-access': token }, body: form });
if (!submitted.ok) throw new Error(`submit ${submitted.status}: ${await submitted.text()}`);
const { id } = await submitted.json();
const started = Date.now();
console.log('submitted', id, JSON.stringify(opts.dust ?? {}));

for (;;) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  const response = await fetch(`${SITE}/.netlify/functions/encode-creative-status?id=${id}`, { headers: { Origin: SITE, 'x-mumoo-brain-access': token } });
  if (response.status === 202) { process.stdout.write('.'); continue; }
  if (!response.ok) throw new Error(`status ${response.status}: ${await response.text()}`);
  const mp4 = Buffer.from(await response.arrayBuffer());
  mkdirSync('scripts/fixtures/exports', { recursive: true });
  const file = `scripts/fixtures/exports/cloud-${style}-${clip}${lyrics ? '' : '-nolyrics'}.mp4`;
  writeFileSync(file, mp4);
  console.log(`\ndone in ${Math.round((Date.now() - started) / 1000)} s on Modal, ${(mp4.length / 1e6).toFixed(1)} MB -> ${file}`);
  break;
}
