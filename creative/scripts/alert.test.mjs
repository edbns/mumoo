import assert from 'node:assert/strict';
import test from 'node:test';
import { alertText, sameProblemText, tellOwner, worthTelling } from '../netlify/lib/alert.mjs';

const live = { name: 'live', origin: 'https://mumoo.app' };

test('a problem tells the owner once, then again only as it keeps happening', () => {
  assert.deepEqual([1, 2, 9, 10, 11, 50, 100, 499, 500].map(worthTelling), [true, false, false, true, false, true, true, false, true]);
  assert.equal(sameProblemText('Video rq-1a2b: worker timed out'), sameProblemText('Video rq-9z8y: worker timed out'));
  assert.equal(sameProblemText('Live preview: context lost'), 'Live preview: context lost');
});

test('the message names the site, the kind, who and what, and links to the errors page', () => {
  assert.equal(alertText({ kind: 'render', email: 'a@b.co', message: 'Live preview: context lost', count: 1, site: live }),
    '⚠ mumoo · Video failed\na@b.co · Live preview: context lost\n\nhttps://mumoo.app/admin#errors');
  const wave = alertText({ kind: 'sign_in', email: null, message: 'Code not accepted', count: 10, site: { name: 'staging', origin: 'https://mumoo-staging.netlify.app' } });
  assert.match(wave, /^⚠ mumoo staging · Sign-in problem\n10 times in the last hour\nCode not accepted\n/);
});

test('nothing is sent off our sites or without the bot, and a failed send never throws', async () => {
  const saved = { ...process.env };
  const calls = [];
  const send = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  try {
    delete process.env.SITE_ID;
    process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_CHAT_ID = '1';
    assert.equal(await tellOwner({ kind: 'render', message: 'x', count: 1 }, send), false);
    process.env.SITE_ID = '130ebb77-011f-44f0-90ae-4566510d1b38';
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal(await tellOwner({ kind: 'render', message: 'x', count: 1 }, send), false);
    assert.equal(calls.length, 0);
    process.env.TELEGRAM_BOT_TOKEN = 't';
    assert.equal(await tellOwner({ kind: 'render', message: 'x', count: 1 }, send), true);
    assert.equal(calls[0].url, 'https://api.telegram.org/bott/sendMessage');
    assert.equal(calls[0].body.chat_id, '1');
    assert.equal(await tellOwner({ kind: 'render', message: 'x', count: 1 }, async () => { throw new Error('offline'); }), false);
  } finally {
    process.env = saved;
  }
});
