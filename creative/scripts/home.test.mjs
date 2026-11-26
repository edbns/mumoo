import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** The rules for `/`, in the order Netlify tries them. */
const homeRules = toml.split('[[redirects]]').slice(1).filter(rule => /from = "\/"\n/.test(rule));

test('`/` is the studio when signed in, chosen, or coming back from Google or a checkout; the welcome page otherwise', () => {
  assert.equal(homeRules.length, 6);
  for (const rule of homeRules) assert.match(rule, /status = 200\n {2}force = true/);
  const ways = homeRules.map(rule => /query = \{(\w+)/.exec(rule)?.[1] ?? /Cookie = \["([^"]+)"\]/.exec(rule)?.[1] ?? 'everyone');
  assert.deepEqual(ways, ['neon_popup', 'checkout_id', 'buy', '__Secure-neon-auth.session_token', 'mumoo_start', 'everyone']);
  assert.deepEqual(homeRules.map(rule => /to = "([^"]+)"/.exec(rule)[1]), [...Array(5).fill('/index.html'), '/welcome.html']);
  assert.match(read('account.tsx'), /const GOOGLE_BACK = \(\) => `\$\{location\.origin\}\/\?neon_popup=1`;/);
  assert.match(read('site-paths.ts'), /export const START_COOKIE = 'mumoo_start';/);
  assert.match(toml, /from = "\/welcome"\n {2}to = "\/"\n {2}status = 301/);
});

test('the welcome page: its words, the video, the way in, and the links at the foot', () => {
  const page = read('welcome-page.tsx');
  assert.match(page, />\s*Your song, directed to the beat\.\s*</);
  assert.match(page, /Drop a track, pick 15 seconds, and get ready-to-post Reels, TikToks, and Shorts—matched to your sound, with optional beat-synced lyrics\. No editing\./);
  assert.match(page, /onClick=\{start\}>Make your first video free<ArrowRightIcon/);
  assert.match(page, />Sign in<\/Button>/);
  assert.match(page, /First video free, no watermark · Then from 25¢ a video · No subscription/);
  assert.match(page, /<span>© 2026 mumoo<\/span>/);
  assert.match(page, /LEGAL_LINKS\.map/);
  assert.match(page, /keepReferral\(\);/);
  assert.match(page, /src="\/home\/welcome\.mp4" poster="\/home\/welcome\.jpg"/);
  assert.match(page, /muted loop playsInline/);
  for (const file of ['welcome.mp4', 'welcome.jpg']) assert.ok(existsSync(new URL(`../public/home/${file}`, import.meta.url)), file);
});

test('signing out or deleting the account lands on the welcome page, the choice to start forgotten', () => {
  const account = read('account.tsx');
  assert.match(account, /const SIGNED_OUT_PAGE = '\/';/);
  assert.equal(account.match(/forgetStart\(\);/g)?.length, 2);
});
