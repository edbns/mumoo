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
      if (input.operation === 'pixabay-search') return route.fulfill({ json: { candidates: [{ id: 'pixabay-1', title: 'City lights', creator: 'Creator', sourceUrl: 'https://pixabay.com/videos/id-1/', previewUrl: null, renderUrl: 'https://cdn.pixabay.com/video/test.mp4' }] } });
      return route.fulfill({ json: { assets: [{ id: 'commons2-1', type: 'video', title: 'Test source', previewUrl: '', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example', creator: '', provider: 'Commons', sourceCharacter: 'unknown', rights: { statement: 'Item CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' }, review: { status: 'PENDING' }, adSafety: { status: 'REVIEW_REQUIRED' }, retainedMaster: { status: 'NOT_RETAINED' } }], nextOffset: null } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?catalog-research=1`);
    await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByText('Test source').waitFor(); page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Approve rights and ad safety' }).click(); assert.equal(reviewed, false);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Approve rights and ad safety' }).click();
    await page.getByText('Review saved. Source retention is a separate step.').waitFor(); assert.equal(reviewed, true);
    assert.equal(await page.getByRole('button', { name: 'Save original' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Find Pixabay footage' }).click();
    await page.getByText('City lights').waitFor(); assert.ok(await page.getByText('These results are not yet approved or available for automatic videos.', { exact: false }).isVisible());
  } finally { await browser.close(); await server.close(); }
});
