/**
 * The daily genre check by hand: what it would let into the brain, hold or reject now, and what that does on known songs.
 *   DATABASE_URL=… node scripts/promote-style-prints.mjs          (nothing changes)
 *   DATABASE_URL=… node scripts/promote-style-prints.mjs --write  (as the daily run would)
 */
import { promote, summary } from '../netlify/lib/style-learning.mjs';

const write = process.argv.includes('--write');
const result = await promote({ write });
console.log(`${write ? '' : 'Dry run. '}${summary(result)}`);
for (const { item, status, reason } of result.decisions) {
  console.log(`  ${status.padEnd(8)} ${item.genre.padEnd(28)} ${item.style.padEnd(24)} ${item.source.padEnd(9)} ${item.source_sha256.slice(0, 10)} ${reason}`);
}
process.exit(0);
