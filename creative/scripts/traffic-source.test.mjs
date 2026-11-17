import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, sourceOf } from '../netlify/lib/traffic-source.mjs';

/** Smart links: where a fan page visit came from, from the page's address alone. */

const page = (query) => `https://mumoo.app/l/blinding-lights${query}`;

test('ads and posts are told apart by the campaign tags and the platforms\' own click IDs', () => {
  assert.equal(sourceOf(page('')), 'direct');
  assert.equal(sourceOf(page('?utm_source=meta&utm_medium=paid')), 'meta_ads', 'the "Copy link for Meta ads" address');
  assert.equal(sourceOf(page('?utm_source=meta&utm_medium=paid&fbclid=IwAR0abc')), 'meta_ads');
  assert.equal(sourceOf(page('?utm_source=Instagram&utm_medium=Paid_Social')), 'meta_ads', 'tags in any case');
  assert.equal(sourceOf(page('?fbclid=IwAR0abc')), 'meta', 'Meta adds its click ID to posts too: not an ad by itself');
  assert.equal(sourceOf(page('?utm_source=ig&utm_medium=social')), 'meta');
  assert.equal(sourceOf(page('?ttclid=E.C.P.abc')), 'tiktok_ads', 'TikTok adds its click ID to ads only');
  assert.equal(sourceOf(page('?utm_source=tiktok&utm_medium=bio')), 'tiktok');
  assert.equal(sourceOf(page('?gclid=Cj0abc')), 'google_ads');
  assert.equal(sourceOf(page('?utm_source=google&utm_medium=organic')), 'other');
  assert.equal(sourceOf(page('?utm_source=youtube')), 'youtube');
  assert.equal(sourceOf(page('?utm_source=newsletter&utm_campaign=launch')), 'other');
  assert.equal(sourceOf(page('?ref=whatever')), 'direct', 'other parameters say nothing');
  assert.equal(sourceOf(''), 'direct');
  assert.equal(sourceOf('not a url'), 'direct');
  for (const query of ['', '?fbclid=x', '?utm_source=a&utm_medium=cpc', '?ttclid=x', '?gbraid=x']) assert.ok(SOURCES.includes(sourceOf(page(query))));
});
