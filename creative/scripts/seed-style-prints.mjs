import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { storePrint, validLabel, validPrint } from '../netlify/lib/style-prints.mjs';

/**
 * Keeps the owner's labelled songs as `seeded` style prints (made on his computer by audio-intelligence/seed_style_prints.py).
 * Each style typed is read by the song step's own search: its first suggestion is the style, as a creator picking it would get.
 * `--as "<typed>=<style>"` names the style itself where the owner chose another (a typo, a style the directory lacks).
 * Shows what it would keep; `--write` keeps it.
 *
 *   node --env-file=.env.local scripts/seed-style-prints.mjs /tmp/seed_prints.json [--as "Funk Mandaloe=funk mandelão"] [--write]
 */
const args = process.argv.slice(2);
const file = args[0];
const write = args.includes('--write');
const chosen = new Map(args.flatMap((arg, i) => (arg === '--as' ? [args[i + 1].split('=').map(part => part.trim())] : [])));
if (!file) throw new Error('Usage: seed-style-prints.mjs <prints.json> [--as "<typed>=<style>"] [--write]');
const { prints } = JSON.parse(readFileSync(file, 'utf8'));
const styles = JSON.parse(readFileSync(new URL('../src/styles.json', import.meta.url), 'utf8'));

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { searchStyles } = await server.ssrLoadModule('/src/style-search.ts');
await server.close();

for (const [typed, name] of chosen) {
  if (!styles.some(style => style.name === name)) throw new Error(`No style named "${name}" (for "${typed}")`);
}
const kept = [];
const seen = new Map();
for (const print of prints) {
  const style = chosen.has(print.typed) ? styles.find(s => s.name === chosen.get(print.typed)) : searchStyles(print.typed, 1)[0]?.style;
  if (!seen.has(print.typed)) {
    seen.set(print.typed, style);
    console.log(`${print.typed.padEnd(24)} -> ${style ? `${style.name} (${style.genre} / ${style.subGenre})` : 'NOT FOUND, skipped'}`);
  }
  if (!style) continue;
  const label = { sourceSha256: print.sourceSha256, offsetMs: print.offsetMs, style: style.name, genre: style.genre, subGenre: style.subGenre, source: 'seeded' };
  const result = { version: 1, status: 'ready', model: print.model, values: print.values };
  if (!validLabel(label) || !validPrint(result)) throw new Error(`Invalid print for ${print.typed}`);
  kept.push([label, result]);
}
console.log(`${kept.length} of ${prints.length} prints ${write ? 'kept' : 'would be kept (add --write)'}`);
if (write) for (const [label, result] of kept) await storePrint(label, result);
