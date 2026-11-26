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

test('the phone notice says mumoo works better on desktop, the mobile app is coming, and Media can be opened here', () => {
  const phone = read('mobile-app.tsx');
  assert.match(phone, />mumoo works better on desktop</);
  assert.match(phone, /title="Mobile app under development">Stay tuned!</);
  assert.match(phone, /title="Your Media, on your phone"/);
  assert.match(phone, /'Open my Media' : 'Sign in to my Media'/);
});

test('phone Media: two videos a row, each watched full screen, shared, downloaded or deleted, from the same account as the computer', () => {
  const phone = read('mobile-app.tsx');
  assert.match(phone, /grid list-none grid-cols-2 gap-3/);
  assert.match(phone, /accountFetch\('\/api\/renders'\)/);
  assert.match(phone, /accountFetch\(`\/api\/renders\?id=\$\{deleting\.id\}`, \{ method: 'DELETE' \}\)/);
  assert.match(phone, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.match(phone, /name === 'NotAllowedError'\) \{ set\(video\.id, 'ready'\)/);
  assert.match(phone, /document\.addEventListener\('visibilitychange', renew\)/);
  assert.match(phone, /role="dialog" aria-modal="true"[^>]*className="fixed inset-0 z-40/);
});
