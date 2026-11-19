import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const panel = await server.ssrLoadModule('/src/cart-panel.tsx');
await server.close();

const line = id => ({ item: { id, thumb: '' }, title: `Video ${id}`, available: true });
const chosenPage = (count, limit) => renderToStaticMarkup(createElement(panel.CartPanel, {
  lines: Array.from({ length: count }, (_, index) => line(String(index))), progress: null, limit,
  action: { kind: 'download', run: () => {} }, onClose: () => {}, onRemove: () => {},
}));

test('making only the free video: the chosen videos page says how many to take out, and Make waits until they are', () => {
  const over = chosenPage(3, { have: 1, free: true });
  assert.match(over, /You can make 1 video for free\. Take\s+out 2 videos with the × so only 1 is left, then make it\./);
  assert.match(over, /<button[^>]*disabled=""[^>]*>Make 3 videos/);
  const fits = chosenPage(1, { have: 1, free: true });
  assert.doesNotMatch(fits, /Take\s+out/);
  assert.doesNotMatch(fits, /<button[^>]*disabled=""[^>]*>Make video/);
});

test('making only what the credits cover says how many credits there are', () => {
  assert.match(chosenPage(5, { have: 2, free: false }), /You have 2 credits\. Take\s+out 3 videos with the × so only 2 are left, then make them\./);
  assert.doesNotMatch(chosenPage(2, null), /Take\s+out/);
});

test('too many chosen with some left to make: the choice is offered first, Purchase Credits only with none left', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const fewer = read('cart-panel.tsx');
  assert.match(fewer, /'You can make only 1 video for free, or buy credits to make all your videos\.'/);
  assert.match(fewer, /'Get my free video'/);
  assert.match(fewer, />Buy credits</);
  const studio = read('creatives-pack-studio.tsx');
  assert.match(studio, /if \(have === 0\) askToBuyCredits\(\{ need: items\.length, have \}\);\s+else askToChooseFewer\(/);
});

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

test('the free video is offered only while it is still to come, and the way to make videos stays', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const cta = read('smart-link-cta.tsx');
  assert.match(cta, /\{free \? 'Make my first video free' : 'Create videos for your music'\}/);
  assert.match(cta, /\{free && ' Your first creative is free\.'\}/);
  assert.match(read('main.tsx'), /onClick=\{\(\) => setStep\(2\)\}>\{freeVideo \? 'Get my free video' : 'Continue'\}<\/Button>/);
  assert.match(read('use-free-video.ts'), /addEventListener\(CREDITS_CHANGED, check\)/);
  assert.match(read('main.tsx'), /Drop the song file to start\.\{freeVideo && ' Your first creative is free\.'\}/);
  // No placeholder holding the button's room: with the free video used the cards sit right under the text from the start.
  assert.match(read('pricing-page.tsx'), /\{freeLeft && <Button className="mt-2"/);
  assert.doesNotMatch(read('pricing-page.tsx'), /invisible/);
});
