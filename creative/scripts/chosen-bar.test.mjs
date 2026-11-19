import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const panel = await server.ssrLoadModule('/src/cart-panel.tsx');
await server.close();

test('the bottom bar says what the chosen videos cost, one credit a video', () => {
  assert.equal(panel.chosenLabel(1), '1 Video = 1 credit');
  assert.equal(panel.chosenLabel(3), '3 Videos = 3 credits');
  assert.equal(panel.chosenLabel(24), '24 Videos = 24 credits');
});

test('no cart icon, and nothing a person reads says cart', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.doesNotMatch(read('main.tsx'), /CartButton/);
  assert.doesNotMatch(read('cart-panel.tsx'), /ShoppingBag|CartButton/);
  // Words on screen: JSX text, and string or template literals (identifiers like `cart.items` are code, not words).
  for (const file of ['cart-panel.tsx', 'main.tsx', 'use-cart-download.ts', 'purchase-credits.tsx', 'creatives-pack-studio.tsx', 'crash-guard.tsx']) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    const words = [...code.matchAll(/'[^'\n]*'|`[^`]*`|"[^"\n]*"|>[^<>{}\n]+</g)].map(match => match[0])
      .filter(text => !/^['"`][./@]|^'mumoo-|import/.test(text));
    const said = words.filter(text => /\bcart\b/i.test(text) && !/^['"`][\w-]+['"`]$/.test(text));
    assert.deepEqual(said, [], file);
  }
});

test('the profile icon is at the top right, its menu opening downwards', () => {
  const dot = readFileSync(new URL('../src/components/ui/profile-dot.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dot, /fixed bottom/);
  const menu = readFileSync(new URL('../src/components/ui/user-dropdown-menu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /side="bottom"/);
});
