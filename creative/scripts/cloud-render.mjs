/**
 * Renders one creative on the cloud worker (Modal), so the heavy work never runs on this machine. Prints how
 * long the cloud took and saves the MP4 to scripts/fixtures/exports/.
 *
 *   node scripts/cloud-render.mjs dust reggaeton        Dust from a photo, lyrics on
 *   node scripts/cloud-render.mjs filter techno         Filter (FILTER=duotone|split|halftone|glow)
 *   LYRICS=0 node scripts/cloud-render.mjs dust techno  lyrics off
 *   SEED=4 node scripts/cloud-render.mjs dust slaphouse pick the colour pair
 *   node scripts/cloud-render.mjs pulise reggaeton      a library style, through the deployed staging site
 *   BANK=lit-rays-5 node scripts/cloud-render.mjs bank techno
 *
 * Dust and Filter use PHOTO (default: our cleared library photo) and call the worker directly with your Modal
 * login, because the public endpoint only hands the worker a photo for a signed-in person. The library styles go
 * through the deployed site, which must carry the code you want drawn.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const photoStyle = style === 'dust' || style === 'filter';
const opts = {
  style,
  font: 'Anton',
  fontSecondary: 'Oswald',
  layout: { rotate: 0, scaleBias: 1, cut: 0 },
  cues: lyrics ? cues : [],
  music: { beatsMs: analysis.rhythm.beatsMs, downbeatsMs: analysis.rhythm.downbeatsMs, energy: [] },
  fallbackText: '',
  lyrics,
  ...(photoStyle ? { colors: dustColors(Number(process.env.SEED || 7)) } : {}),
  ...(style === 'bank' ? { bankId: process.env.BANK || 'neon-flow-5', typeStyle: 'karaoke' } : {}),
  ...(style === 'filter' ? { filter: process.env.FILTER || 'duotone', typeStyle: 'stack' } : {}),
};
const wav = canonicalWav();
const file = `scripts/fixtures/exports/cloud-${style}${style === 'filter' ? `-${opts.filter}` : ''}-${clip}${lyrics ? '' : '-nolyrics'}.mp4`;
mkdirSync('scripts/fixtures/exports', { recursive: true });
const started = Date.now();

if (photoStyle) {
  const wavFile = join(tmpdir(), 'mumoo-cloud-clip.wav');
  const optsFile = join(tmpdir(), 'mumoo-cloud-opts.json');
  writeFileSync(wavFile, wav);
  writeFileSync(optsFile, JSON.stringify(opts));
  const run = spawnSync('python3', ['../audio-intelligence/render_creative_staging.py', '--wav', wavFile, '--opts', optsFile,
    '--photo', process.env.PHOTO || 'public/punch-plates/burnnet-woman-1547507-1920.jpg', '--out', file], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error('The cloud render failed.');
} else {
  const headers = { Origin: SITE, 'Content-Type': 'application/json' };
  const { token } = await (await fetch(`${SITE}/api/brain-tester-access`, { method: 'POST', headers, body: '{}' })).json();
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  form.append('meta', JSON.stringify({ opts }));
  const submitted = await fetch(`${SITE}/.netlify/functions/encode-creative`, { method: 'POST', headers: { Origin: SITE, 'x-mumoo-brain-access': token }, body: form });
  if (!submitted.ok) throw new Error(`submit ${submitted.status}: ${await submitted.text()}`);
  const { id } = await submitted.json();
  console.log('submitted', id);
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const response = await fetch(`${SITE}/.netlify/functions/encode-creative-status?id=${id}`, { headers: { Origin: SITE, 'x-mumoo-brain-access': token } });
    if (response.status === 202) { process.stdout.write('.'); continue; }
    if (!response.ok) throw new Error(`status ${response.status}: ${await response.text()}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    break;
  }
}
console.log(`\ndone in ${Math.round((Date.now() - started) / 1000)} s on Modal, ${(readFileSync(file).length / 1e6).toFixed(1)} MB -> ${file}`);
