import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bake-punch-plates writes 1080×1920 proxies and a rights manifest', () => {
  const result = spawnSync(process.execPath, ['scripts/bake-punch-plates.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifestPath = join(root, 'public', 'punch-plates', 'plates.json');
  assert.ok(existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.width, 1080);
  assert.equal(manifest.height, 1920);
  assert.ok(manifest.plates.length >= 1);
  for (const plate of manifest.plates) {
    assert.match(plate.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.equal(plate.type, 'still');
    assert.ok(existsSync(join(root, 'public', 'punch-plates', plate.file)));
    assert.ok(existsSync(join(root, 'public', 'punch-plates', plate.thumb)));
    assert.ok(typeof plate.license === 'string' && plate.license);
    assert.ok(typeof plate.clearedBy === 'string' && plate.clearedBy);
    assert.ok(typeof plate.clearedAt === 'string' && plate.clearedAt);
  }
});

test('bake-punch-plates publishes the baked photography effects, and only the pictures', () => {
  const result = spawnSync(process.execPath, ['scripts/bake-punch-plates.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const published = readdirSync(join(root, 'public', 'punch-plates', 'effects')).sort();
  const effects = JSON.parse(readFileSync(join(root, 'punch-plates', 'effects', 'effects.json'), 'utf8'));
  assert.deepEqual(published, effects.map(effect => `${effect.id}.jpg`).sort(), 'every effect and nothing else, no contact sheets');
});

test('punch plate helpers accept safe ids', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const mod = await server.ssrLoadModule('/src/punch-plates.ts');
    assert.equal(mod.isPunchPlateId('ember-dusk'), true);
    assert.equal(mod.isPunchPlateId('../no'), false);
    assert.equal(mod.punchPlatesBase(), '/punch-plates');
  } finally {
    await server.close();
  }
});
