import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { modal, siteOf, SITES } from '../netlify/lib/sites.mjs';

const [staging, live] = SITES;
/** Every Modal endpoint the functions call: an address part longer than 63 characters does not resolve. */
const ENDPOINTS = [...new Set(readdirSync(new URL('../netlify', import.meta.url), { recursive: true })
  .filter(file => file.endsWith('.mjs'))
  .flatMap(file => [...readFileSync(new URL(`../netlify/${file}`, import.meta.url), 'utf8').matchAll(/modal\(['`]([a-z0-9-]+)(-\$\{step\})?['`]\)/g)]
    .flatMap(([, name, step]) => (step ? [`${name}-submit`, `${name}-status`] : [name]))))];
const at = (url) => new Request(url);

test('each site answers only at its own address and calls its own Modal environment', () => {
  const previous = process.env.SITE_ID;
  try {
    process.env.SITE_ID = live.id;
    assert.equal(siteOf(at('https://mumoo.app/api/x'))?.name, 'live');
    assert.equal(siteOf(at('https://mumoo.netlify.app/api/x')), null);
    assert.ok(ENDPOINTS.length >= 10);
    for (const endpoint of ENDPOINTS) assert.ok(new URL(modal(endpoint)).hostname.split('.')[0].length <= 63, endpoint);
    assert.equal(siteOf(at('https://mumoo-staging.netlify.app/api/x')), null);
    assert.equal(modal('mumoo-lyrics-v2-staging-submit'), 'https://edbns-mumoo-production--mumoo-lyrics-v2-staging-submit.us-east.modal.run');

    process.env.SITE_ID = staging.id;
    assert.equal(siteOf(at('https://mumoo-staging.netlify.app/api/x'))?.name, 'staging');
    assert.equal(siteOf(at('https://mumoo.app/api/x')), null);
    assert.equal(modal('mumoo-lyrics-v2-staging-submit'), 'https://edbns-mumoo-staging--mumoo-lyrics-v2-staging-submit.us-east.modal.run');

    process.env.SITE_ID = 'a-deploy-preview';
    assert.equal(siteOf(at('https://mumoo-staging.netlify.app/api/x')), null);
  } finally {
    if (previous === undefined) delete process.env.SITE_ID; else process.env.SITE_ID = previous;
  }
});
