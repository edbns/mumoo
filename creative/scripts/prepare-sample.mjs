/**
 * Prepares one picture on the cloud worker the way the app does, without a browser: a photo gets its cut-out
 * mask, a video or GIF becomes a portrait copy plus a poster and its shots (OUT.shots.json). Results go next to OUT.
 *
 *   node scripts/prepare-sample.mjs photo public/punch-plates/burnnet-woman-1547507-1920.jpg scripts/fixtures/prepared/woman
 *   node scripts/prepare-sample.mjs motion scripts/fixtures/VIDEO.mp4 scripts/fixtures/prepared/clip
 *
 * Needs .env.local for the storage keys, and your Modal login. The temporary files are removed afterwards.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { putObject, getObject, deleteObject, signedUpload, signedDownload } from '../netlify/lib/storage.mjs';

const [kind, file, out] = process.argv.slice(2);
if (!['photo', 'motion'].includes(kind) || !file || !out) throw new Error('Usage: prepare-sample.mjs photo|motion <file> <out>');
const base = `samples/${randomUUID()}`;
const outputs = kind === 'photo' ? { cutout: 'png' } : { motion: 'mp4', poster: 'jpg' };
const keys = { source: `${base}/source`, ...Object.fromEntries(Object.entries(outputs).map(([name, ext]) => [name, `${base}/${name}.${ext}`])) };
mkdirSync(dirname(out), { recursive: true });
try {
  await putObject(keys.source, readFileSync(file), 'application/octet-stream');
  const puts = Object.fromEntries(await Promise.all(Object.keys(outputs).map(async name => [name, await signedUpload(keys[name])])));
  const started = Date.now();
  const run = spawnSync('python3', ['../audio-intelligence/prepare_media_staging.py', '--kind', kind, '--source', await signedDownload(keys.source, null, 1800), '--puts', JSON.stringify(puts)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (run.status !== 0) throw new Error('The cloud worker failed.');
  const result = JSON.parse(run.stdout.trim().split('\n').pop());
  if (!result.ok) throw new Error(`Refused: ${result.error}`);
  for (const [name, ext] of Object.entries(outputs)) writeFileSync(`${out}.${name}.${ext}`, await getObject(keys[name]));
  if (result.shots) writeFileSync(`${out}.shots.json`, JSON.stringify(result.shots));
  console.log(`prepared in ${Math.round((Date.now() - started) / 1000)} s`, result.bytes);
} finally {
  await Promise.all(Object.values(keys).map(key => deleteObject(key).catch(() => {})));
}
