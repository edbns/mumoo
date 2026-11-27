import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a phone gets its own small app, chosen once as the page opens, so a narrowed computer window keeps its work', () => {
  const main = read('main.tsx');
  assert.match(main, /const PHONE = '\(max-width: 740px\)';/);
  assert.match(main, /const \[phone\] = useState\(\(\) => window\.matchMedia\(PHONE\)\.matches\);/);
  assert.match(main, /phone \? <Suspense fallback=\{null\}><MobileApp \/><\/Suspense> : <App \/>/);
  assert.match(main, /render\(<CrashGuard><Root \/><\/CrashGuard>\)/);
});

test('the phone notice: create on desktop, post from the phone, the app coming, and Media opened here', () => {
  const phone = read('mobile-app.tsx');
  assert.match(phone, />Create on desktop\. Post from your phone\.</);
  assert.doesNotMatch(phone, /Early access/);
  assert.match(phone, /title="Full studio on desktop"/);
  assert.match(phone, /title="Mobile app coming soon">We’re bringing the studio to mobile next\.</);
  assert.match(phone, /title="Your Media, ready to post"/);
  assert.match(phone, /'Open my Media' : 'Sign in to my Media'/);
  assert.match(read('legal-corner.tsx'), /<div className=\{`flex \$\{NOT_ON_PHONE\}`\}><StatusDot \/><\/div>/);
  assert.match(read('legal-corner.tsx'), /link\.href === PRICING_PATH && NOT_ON_PHONE/);
  assert.doesNotMatch(read('welcome-page.tsx'), /location\.replace\('\/'\)/);
});

test('phone Media: two a row with nothing on them; a tap selects, and the actions float; iPhone saves through the share sheet, others one by one', () => {
  const phone = read('mobile-app.tsx');
  assert.match(phone, /grid list-none grid-cols-2 gap-1\.5 p-0/);
  assert.match(phone, /aria-pressed=\{on\}[^>]*onClick=\{\(\) => toggle\(video\)\}/);
  assert.match(phone, /role="toolbar" aria-label="Selected videos"/);
  assert.match(phone, /if \(action === 'save' && !IOS\) \{\s+await downloadEach\(list, onFile\);/);
  assert.match(phone, /\{chosen\.length === 1 && <FloatingAction label="Share"/);
  assert.match(phone, /`\$\{total\} videos saved to your camera roll\.`/);
  assert.match(phone, /if \(action === 'save'\) setSelected\(new Set\(\)\);/);
  assert.match(phone, /busy: work\?\.action === action, ready: again === action/);
  assert.doesNotMatch(phone, /fflate|zipSync/);
  assert.match(phone, /accountFetch\('\/api\/renders'\)/);
  assert.match(phone, /if \(name === 'NotAllowedError'\) return 'tap-again';/);
  assert.match(phone, /document\.addEventListener\('visibilitychange', renew\)/);
});

test('on a touch screen the sign-in popup opens without the keyboard, and popups sit in the middle of a phone', () => {
  const dialog = read('sign-in-dialog.tsx');
  assert.match(dialog, /initialFocusRef=\{TOUCH \? start : undefined\}/);
  assert.match(dialog, /focusEmail=\{!TOUCH\}/);
  assert.match(read('components/ui/magic-link-otp-login.tsx'), /autoFocus=\{focusEmail\}/);
  assert.match(read('components/ui/modal.tsx'), /fixed inset-0 z-50 grid place-items-center p-4 pt-\[max\(1rem,env\(safe-area-inset-top\)\)\] pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
});
