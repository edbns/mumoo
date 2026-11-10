import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Netlify only publishes a function that is a file in netlify/functions, or a folder holding `<folder>.mjs` or `index.mjs`.
 * A folder of other names is silently ignored: the page then gets "not found" and nothing in a unit test notices,
 * because a unit test calls the code directly. This keeps every function where Netlify will find it.
 */
const dir = fileURLToPath(new URL('../netlify/functions/', import.meta.url));

test('every function is a file Netlify will publish', () => {
  const lost = [];
  for (const name of readdirSync(dir)) {
    if (!statSync(`${dir}${name}`).isDirectory()) continue;
    const has = ['.mjs', '.js', '.ts'].some(ext => existsSync(`${dir}${name}/${name}${ext}`) || existsSync(`${dir}${name}/index${ext}`));
    if (!has) lost.push(name);
  }
  assert.deepEqual(lost, [], `Netlify would ignore these folders (no <folder>.mjs or index.mjs inside): ${lost.join(', ')}`);
});

test('every function has a path of its own', async () => {
  const seen = new Map();
  const files = readdirSync(dir).flatMap(name => statSync(`${dir}${name}`).isDirectory()
    ? readdirSync(`${dir}${name}`).filter(file => file === `${name}.mjs` || file === 'index.mjs').map(file => `${name}/${file}`)
    : name.endsWith('.mjs') ? [name] : []);
  for (const file of files) {
    const { config } = await import(`${dir}${file}`);
    const path = config?.path;
    if (!path) continue; // reachable at /.netlify/functions/<name>
    assert.ok(!seen.has(path), `${file} and ${seen.get(path)} both claim ${path}`);
    seen.set(path, file);
  }
  for (const wanted of ['/api/admin/overview', '/api/admin/library', '/api/admin/problems', '/api/report-problem', '/api/library']) {
    assert.ok(seen.has(wanted), `no function answers ${wanted}`);
  }
});
