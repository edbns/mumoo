import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('research review stays separate from creator flow and requests explicit ad-safety approval', { timeout: 30000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); let reviewed = false;
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/api/media-catalog', route => {
      const input = route.request().postDataJSON();
      if (input.operation === 'research-review') { assert.equal(input.adSafety, 'SAFE'); reviewed = true; return route.fulfill({ json: {} }); }
      return route.fulfill({ json: { assets: [{ id: 'cma-1', title: 'Test source', previewUrl: '', sourceUrl: 'https://www.clevelandart.org/art/1', creator: '', provider: 'Cleveland', sourceCharacter: 'cultural_object', rights: { statement: 'Item CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' }, review: { status: 'PENDING' }, adSafety: { status: 'REVIEW_REQUIRED' }, retainedMaster: { status: 'NOT_RETAINED' } }], nextOffset: null } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?catalog-research=1`);
    await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByText('Test source').waitFor(); page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Approve rights and ad safety' }).click(); assert.equal(reviewed, false);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Approve rights and ad safety' }).click();
    await page.getByText('Review saved. Source retention is a separate step.').waitFor(); assert.equal(reviewed, true);
    assert.equal(await page.getByRole('button', { name: 'Save original' }).isDisabled(), true);
  } finally { await browser.close(); await server.close(); }
});
