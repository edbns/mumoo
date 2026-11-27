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
  assert.match(over, /You have 1 free export\. Remove 2 videos to export now, or top up your balance\./);
  assert.match(over, /<button[^>]*disabled=""[^>]*>Export<\/button>/);
  const fits = chosenPage(1, { have: 1, free: true });
  assert.doesNotMatch(fits, /Remove \d/);
  assert.doesNotMatch(fits, /<button[^>]*disabled=""[^>]*>Export/);
  assert.match(fits, />Export<\/button>/);
  assert.doesNotMatch(fits, /role="progressbar"|progress/i);
});

test('the chosen videos page: Create with its credits at the top as well as the bottom, and Close is an icon on the right', () => {
  const page = chosenPage(3, null);
  assert.match(page, />Export · 3 credits<\/button>[\s\S]*aria-label="Close"/);
  assert.match(page, />Export<\/button>/);
  assert.doesNotMatch(page, />Close<\/button>/);
  assert.match(chosenPage(1, null), />Export · 1 credit<\/button>/);
});

test('making only what the credits cover says how many credits there are', () => {
  assert.match(chosenPage(5, { have: 2, free: false }), /You have 2 credits\. Remove 3 videos to export now, or top up your balance\./);
  assert.doesNotMatch(chosenPage(2, null), /Remove \d/);
});

test('too many chosen with some left to make: the choice is offered first, Purchase Credits only with none left', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const fewer = read('cart-panel.tsx');
  assert.match(fewer, /'Your first export is free\. Grab credits to render the rest\.'/);
  assert.match(fewer, /'Export 1 free video'/);
  assert.match(fewer, />Get credits</);
  const studio = read('creatives-pack-studio.tsx');
  assert.match(studio, /if \(have === 0\) askToBuyCredits\(\{ need: items\.length, have \}\);\s+else askToChooseFewer\(/);
});

test('the bottom tray: a deck of up to 4 miniatures, how many are selected, Export with its credits, and Clear', () => {
  const items = count => Array.from({ length: count }, (_, index) => ({ id: String(index), thumb: `data:image/jpeg;base64,${index}` }));
  const tray = (count, extra = {}) => renderToStaticMarkup(createElement(panel.ChosenBar, { items: items(count), count, progress: null, onOpen: () => {}, ...extra }));
  const six = tray(6, { onClear: () => {} });
  assert.equal((six.match(/<img/g) ?? []).length, 4, 'the newest four only');
  assert.match(six, /base64,5"/);
  assert.doesNotMatch(six, /base64,1"/);
  assert.match(six, />6 selected</);
  assert.match(six, />Export · 6 credits<svg/);
  assert.match(six, /aria-label="Clear the chosen videos"[^>]*>Clear</);
  assert.match(tray(1), />Export · 1 credit<svg/);
  assert.doesNotMatch(six, /videos = |credits = /);
  assert.equal(tray(0), '', 'nothing chosen, no tray');
  const css = readFileSync(new URL('../src/cart-panel.tsx', import.meta.url), 'utf8');
  assert.match(css, /bg-\[#1A1A1D\]\/90[^"]*shadow-\[[^\]]*inset_0_0_0_1px_rgba\(255,255,255,0\.12\)\][^"]*backdrop-blur-md/);
  assert.match(readFileSync(new URL('../src/creatives-pack-studio.tsx', import.meta.url), 'utf8'), /launchToTray\(item\.id, card\.getBoundingClientRect\(\)\);\s+cart\.add\(item\);/);
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
  assert.match(cta, /\{free \? 'Make my first video free' : 'Create videos'\}/);
  assert.match(cta, /\{free && ' First video free—no watermark\.'\}/);
  assert.match(read('main.tsx'), /onClick=\{\(\) => setStep\(2\)\}>\{freeVideo \? 'Get my free video' : 'Continue'\}<\/Button>/);
  assert.match(read('use-free-video.ts'), /addEventListener\(CREDITS_CHANGED, check\)/);
  assert.match(read('main.tsx'), /Drop the song file to start\.\{freeVideo && ' Your first video is free\.'\}/);
  // No placeholder holding the button's room: with the free video used the cards sit right under the text from the start.
  assert.match(read('pricing-page.tsx'), /\{freeLeft && <Button className="mt-2"/);
  assert.doesNotMatch(read('pricing-page.tsx'), /invisible/);
});

test('Create goes straight to Media, where the bottom tray shows the percentage and the actions scroll away', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const main = read('main.tsx');
  assert.match(main, /return \{ kind: 'download', run: \(\) => \{ toMedia\(\); void downloadRef\.current\?\.\(\); \} \};/);
  assert.match(main, /if \(signedIn\) \{ toMedia\(\); void downloadRef\.current\?\.\(\); \}/);
  assert.match(main, /<div className="masthead-actions">/);
  assert.doesNotMatch(read('history-page.tsx'), /RenderProgress/);
  assert.doesNotMatch(read('cart-panel.tsx'), /RenderProgress/);
  const css = read('styles/shell.css');
  assert.match(css, /\.masthead-actions \{ position: absolute; z-index: 9; top: 1rem; right: 1\.5rem;/, 'the actions scroll away on every page');
  assert.match(read('cart-panel.tsx'), /className="fixed bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\] left-1\/2 z-\[15\]/);
});

test('the upload popup has no title or long text, only a small line under Select files', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const upload = read('picture-upload.tsx');
  assert.doesNotMatch(upload, /Use your own photos or videos|Pick up to/);
  assert.match(upload, /hideTitle/);
  assert.match(upload, /note="Only upload media you have the rights to use\."/);
  assert.doesNotMatch(read('analyzing-screen.tsx'), /minute or two/);
});

test('the bottom tray shows while choosing and while the videos are made', () => {
  const bar = (count, progress) => renderToStaticMarkup(createElement(panel.ChosenBar, { count, progress, onOpen: () => {} }));
  assert.match(bar(2, null), />2 selected</);
  assert.match(bar(0, { label: 'Making your videos', percent: 42 }), />Making your videos 42%</);
  assert.equal(bar(0, null), '');
});

test('while videos are made the bar opens nothing and changes nothing, and Cancel shows only while some have not started', () => {
  const bar = (progress, onCancel) => renderToStaticMarkup(createElement(panel.ChosenBar, { count: 20, progress, onOpen: () => {}, onClear: () => {}, onCancel }));
  const making = bar({ label: 'Made 9 of 20 · 7 waiting their turn', percent: 64, cancellable: true }, () => {});
  assert.match(making, />20 selected</);
  assert.doesNotMatch(making, /Export/);
  assert.equal((making.match(/<button(?![^>]*disabled="")/g) ?? []).length, 1, 'only Cancel can be pressed');
  assert.match(making, /aria-label="Cancel the videos that have not started"[^>]*>.*Cancel</);
  assert.doesNotMatch(making, /Clear the chosen videos/);
  assert.match(bar({ label: 'x', percent: 70, cancelling: true }, () => {}), /disabled=""[^>]*>.*Cancelling…</);
  assert.doesNotMatch(bar({ label: 'Made 16 of 20', percent: 90 }, () => {}), /<button(?![^>]*disabled="")/);
});

test('the videos page shows no error text above the videos, the preview line sits left of Lyrics, and Refresh floats on its own', () => {
  const studio = readFileSync(new URL('../src/creatives-pack-studio.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(studio, /\{error && <p|\{playbackError && <p|no lyric style|Staging access is unavailable/);
  assert.match(studio, /<p className="hint m-0 mr-auto">Live preview · Exports in full 1080p HD\.<\/p>/);
  assert.match(studio, /<RefreshFloat disabled=\{!allReady\} onRefresh=\{refreshShelf\} \/>/);
  assert.match(readFileSync(new URL('../src/refresh-float.tsx', import.meta.url), 'utf8'), /aria-label="Refresh all videos"/);
});

test('popups: centred text, buttons at their own size set apart left and right; the style guess asks Maybe, No or Yes and nothing about learning', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('components/ui/modal.tsx'), /<div className="relative shrink-0 px-10 pb-4 pt-6 text-center">/);
  assert.match(read('components/ui/action-dialog.tsx'), /<div className="flex items-center justify-between gap-3">/);
  assert.match(read('cart-panel.tsx'), /<div className="flex items-center justify-between gap-3">\s+<Button variant="secondary" onClick=\{onFewer\}>/);
  const main = read('main.tsx');
  assert.match(main, /<div className="flex items-center justify-between gap-3">\s+<Button variant="secondary" onClick=\{\(\) => answerGuess\('unsure'\)\}>Maybe<\/Button>\s+<Button variant="secondary" onClick=\{\(\) => answerGuess\('no'\)\}>No<\/Button>\s+<Button onClick=\{\(\) => answerGuess\('yes'\)\}>Yes<\/Button>/);
  assert.doesNotMatch(main, /learn your music/);
});

test('pricing: centred "Every video comes with", questions that open one by one, no Terms line under them', () => {
  const pricing = readFileSync(new URL('../src/pricing-page.tsx', import.meta.url), 'utf8');
  assert.match(pricing, /items-center gap-4 text-center">\s+<h2 className="m-0 text-lg font-semibold">Every video comes with<\/h2>/);
  assert.match(pricing, />Everything you need to know about making a video with mumoo<\/h2>/);
  assert.match(pricing, /<details key=\{q\}[\s\S]*<summary[\s\S]*ChevronDownIcon/);
  assert.doesNotMatch(pricing, /See the <a|Anything else:|>Questions</);
});

test('Clear on the bottom tray; chosen videos never made are not kept for another visit', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const bar = (count, onClear) => renderToStaticMarkup(createElement(panel.ChosenBar, { count, progress: null, onOpen: () => {}, onClear }));
  assert.match(bar(2, () => {}), /aria-label="Clear the chosen videos"/);
  assert.doesNotMatch(bar(2, undefined), /Clear/);
  const main = read('main.tsx');
  assert.match(main, /onClear=\{cart\.clear\}/);
  assert.match(main, /setInCreatives\(false\);\n\s+cart\.clearAll\(\);/);
  const cart = read('cart.ts');
  assert.match(cart, /sessionStorage\.setItem\(KEY/);
  assert.match(cart, /localStorage\.removeItem\(KEY\)/);
  assert.doesNotMatch(cart, /localStorage\.setItem/);
});

test('one look for every text box and focus ring, and no Help line in the account menu', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('components/ui/field.ts'), /focus-visible:shadow-\[0_0_0_2px_var\(--focus-ring\)\]/);
  assert.match(read('settings-page.tsx'), /className=\{POPUP_FIELD\}/);
  assert.doesNotMatch(read('settings-page.tsx'), /outline-2/);
  assert.match(read('styles/app.css'), /\.outline-ring:focus-visible \{ outline-color: var\(--focus-ring\); outline-offset: 0; \}/);
  assert.doesNotMatch(read('account-pages.ts'), /'help'|Help/);
});

test('one look across pages: soft focus everywhere, 12px corners and 2px green rings on pricing, no pill buttons, old buttons gone from Lyrics', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('styles/legacy.css'), /:focus-visible \{ outline: 2px solid var\(--focus-ring\); outline-offset: 2px; \}/);
  for (const file of ['pricing-page.tsx', 'components/ui/pricing-interaction.tsx', 'purchase-credits.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /rounded-(2xl|3xl)|\[3px\]|w-full rounded-full/, file);
  }
  assert.doesNotMatch(read('components/ui/cookie-consent.tsx'), /border border-border/);
  const lyrics = read('lyrics-studio.tsx');
  assert.doesNotMatch(lyrics, /className=\{?['"](primary-accent|secondary)|'❚❚'|'▶'/);
  assert.match(lyrics, /<Button variant=\{dirty \? 'default' : 'secondary'\}/);
});

test('actions are buttons, not underlined text; Media keeps one tidy bar; the style box keeps its own height', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  for (const file of ['main.tsx', 'history-page.tsx', 'settings-page.tsx', 'link-analytics.tsx', 'ad-tracking.tsx', 'smart-link-parts.tsx']) {
    assert.doesNotMatch(read(file), /bg-transparent p-0 text-(sm|xs) text-muted-foreground underline/, file);
  }
  const main = read('main.tsx');
  assert.match(main, /<Button variant="secondary" onClick=\{\(\) => setPage\('links'\)\}><Link2Icon/);
  assert.match(main, /<div className="grid items-start gap-5 md:grid-cols-2">/);
  const media = read('history-page.tsx');
  assert.match(media, /chosen\.length === 0 \? storage && <StorageMeter/);
  assert.match(media, /opacity-0 outline-ring transition-\[opacity,background-color\] group-hover:opacity-100/);
  assert.doesNotMatch(read('styles/legacy.css'), /\.link-button \{[^}]*underline/);
});

test('the smart link, once live: short words, the live song in the phone, and a delete popup named by the song', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const cta = read('smart-link-cta.tsx');
  assert.match(cta, />Promote this release<\/p>/);
  assert.doesNotMatch(cta, /Sparkles/);
  assert.match(cta, /Turn “\{title\}” into beat-cut promo videos\./);
  assert.doesNotMatch(cta, /lyric videos|in minutes|’s song|cuts for/);
  const links = read('links-page.tsx');
  assert.match(links, /Share it anywhere\. Track clicks by platform in My Smart Links\./);
  assert.match(links, /placeholder="Paste a Spotify, Apple Music, or YouTube link—or type a song"/);
  assert.match(links, />Create another smart link<\/Button>/);
  assert.match(links, /'What fans see.'/);
  assert.match(links, /<PhonePreview link=\{link \?\? \(published \? draftOf\(published\)\.link : null\)\}/);
  const mine = read('my-links-page.tsx');
  assert.match(mine, /`Delete smart link for “\$\{deletingTitle\}”\?`/);
  assert.match(mine, /This link will stop working immediately and its click stats will be permanently deleted\./);
  assert.match(mine, /No smart links yet\. Create one link for your release across Spotify, Apple Music, YouTube, and more\./);
});
