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
      if (route.request().headers()['content-type'] === 'video/mp4') { assert.equal(route.request().headers()['x-mumoo-operation'], 'staging-upload'); return route.fulfill({ json: { asset: { rights: 'STAGING_TEST_ONLY' } } }); }
      const input = route.request().postDataJSON();
      if (input.operation === 'pixabay-review') { assert.equal(input.id, 'pixabay-1'); assert.equal(input.adSafety, 'SAFE'); return route.fulfill({ json: { review: { eligibleForCreation: false } } }); }
      if (input.operation === 'research-review') { assert.equal(input.adSafety, 'SAFE'); reviewed = true; return route.fulfill({ json: {} }); }
      if (input.operation === 'pixabay-search') return route.fulfill({ json: { candidates: [{ id: 'pixabay-1', title: 'City lights', creator: 'Creator', sourceUrl: 'https://pixabay.com/videos/id-1/', previewUrl: null, renderUrl: 'https://cdn.pixabay.com/video/test.mp4' }] } });
      return route.fulfill({ json: { assets: [{ id: 'commons2-1', type: 'video', title: 'Test source', previewUrl: '', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example', creator: '', provider: 'Commons', sourceCharacter: 'unknown', rights: { statement: 'Item CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' }, review: { status: 'PENDING' }, adSafety: { status: 'REVIEW_REQUIRED' }, retainedMaster: { status: 'NOT_RETAINED' } }], nextOffset: null } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?catalog-research=1`);
    await page.getByText('Staging access enabled.').waitFor({ timeout: 15000 });
    await page.getByText('Test source').waitFor(); page.once('dialog', dialog => dialog.dismiss());
    await page.getByLabel('Add staging test clips').setInputFiles({ name: 'test.mp4', mimeType: 'video/mp4', buffer: Buffer.from('0000ftyp01234567890') });
    await page.getByText('1 test clips saved for staging only. Commercial rights and advertising safety remain unverified.').waitFor();
    await page.getByRole('button', { name: 'Approve rights and ad safety' }).click(); assert.equal(reviewed, false);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Approve rights and ad safety' }).click();
    await page.getByText('Review saved. Source retention is a separate step.').waitFor(); assert.equal(reviewed, true);
    assert.equal(await page.getByRole('button', { name: 'Save original' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Find Pixabay footage' }).click();
    await page.getByText('City lights').waitFor(); assert.ok(await page.getByText('These results are not yet approved or available for automatic videos.', { exact: false }).isVisible());
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Approve for testing' }).click();
    await page.getByText('Review saved. This footage is not yet enabled for automatic videos.').waitFor();
  } finally { await browser.close(); await server.close(); }
});
