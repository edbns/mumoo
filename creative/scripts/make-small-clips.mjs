/**
 * Gives every prepared library clip that has none its small copy (the shelf streams it while a card plays), on our prepare worker.
 *   node --env-file=.env.local scripts/make-small-clips.mjs            how many clips are waiting, nothing made
 *   node --env-file=.env.local scripts/make-small-clips.mjs --make [N]  makes them (at most N), then marks them in the database
 * Needs the Modal command line (python3 -m modal) signed in to the staging workspace.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../netlify/lib/person.mjs';
import { smallKey } from '../netlify/lib/library.mjs';
import { signedDownload, signedUpload } from '../netlify/lib/storage.mjs';

/** Long enough for the whole run: the worker reads and writes through these links. */
const LINK_SECONDS = 3 * 60 * 60;
const make = process.argv.includes('--make');
const most = Number(process.argv[process.argv.indexOf('--make') + 1]) || Infinity;

const sql = db();
const rows = await sql`select id from library_items where kind <> 'photo' and ready and not small order by created_at desc`;
console.log(`${rows.length} clips have no small copy`);
if (!make || rows.length === 0) process.exit(0);

const chosen = rows.slice(0, most);
const jobs = await Promise.all(chosen.map(async ({ id }) => ({
  id,
  source: await signedDownload(`library/${id}.mp4`, null, LINK_SECONDS),
  put: await signedUpload(smallKey(id), LINK_SECONDS),
})));
const dir = mkdtempSync(join(tmpdir(), 'mumoo-smalls-'));
try {
  writeFileSync(join(dir, 'jobs.json'), JSON.stringify(jobs));
  const worker = fileURLToPath(new URL('../../audio-intelligence/modal_prepare_media_staging.py', import.meta.url));
  const run = spawnSync('python3', ['-m', 'modal', 'run', '-e', 'mumoo-staging', `${worker}::smalls`, '--jobs', join(dir, 'jobs.json'), '--results', join(dir, 'results.json')], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error('The worker run failed.');
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const made = Object.keys(results).filter(id => results[id] === true);
  if (made.length) await sql`update library_items set small = true where id = any (${made})`;
  console.log(`${made.length} of ${chosen.length} marked`);
  for (const [id, said] of Object.entries(results)) if (said !== true) console.log(`  ${id}: ${said}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
