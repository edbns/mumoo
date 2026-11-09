/**
 * One-off helper: turns raw `get-preset` (format js) dumps from the Shaders MCP into
 * src/look-lab/photo-effects/presets/{slug}.json  ({ presetId, title, collection, config, options }).
 *
 *   node scripts/extract-photo-effects.mjs <dir-with-dumps>
 *
 * The dump files are the "Large output" files the MCP client writes. Only collections in
 * the image-effects category are kept. Media inputs are NOT swapped here; the lab does that at bake time.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'look-lab', 'photo-effects', 'presets');
const dumpDir = process.argv[2];
if (!dumpDir) throw new Error('usage: node scripts/extract-photo-effects.mjs <dump-dir>');
mkdirSync(outDir, { recursive: true });

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seen = new Set();
const perCollection = {};

for (const name of readdirSync(dumpDir)) {
  if (!name.endsWith('.txt')) continue;
  const text = readFileSync(join(dumpDir, name), 'utf8');
  if (!text.includes('"collection_category":"image-effects"') || !text.includes('"format":"js"')) continue;
  const line = text.split('\n').find(l => l.startsWith('{') && l.includes('"collection_category"'));
  if (!line) continue;
  const d = JSON.parse(line);
  if (seen.has(d.id)) continue;
  seen.add(d.id);
  // Run the exported snippet against a stub so we capture the exact (config, options) it passes.
  let captured;
  const body = d.code.replace(/^import .*$/m, '').replace('const shader = await createShader', 'await createShader');
  const run = new Function('createShader', 'document', `return (async () => { ${body} })()`);
  await run((_canvas, config, options) => { captured = { config, options: options ?? {} }; return {}; }, { getElementById: () => ({}) });
  const { config, options } = captured;
  const collection = d.collection_name;
  perCollection[collection] = (perCollection[collection] ?? 0) + 1;
  const slug = `${slugify(collection)}-${perCollection[collection]}`;
  writeFileSync(
    join(outDir, `${slug}.json`),
    `${JSON.stringify({ presetId: d.id, title: d.title, collection, description: d.visual_description, config, options }, null, 2)}\n`,
  );
  console.log(slug.padEnd(30), d.id, Object.keys(config).join(','));
}
console.log(`extracted ${seen.size}`);
