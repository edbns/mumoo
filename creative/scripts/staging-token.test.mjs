import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { freshAccess, rememberAccess, withAccess } = await server.ssrLoadModule('/src/staging-token.ts');
await server.close();

const realFetch = globalThis.fetch;
const realNow = Date.now;
function fakeServer() {
  const calls = { minted: 0 };
  globalThis.fetch = async () => { calls.minted += 1; return Response.json({ token: `token-${calls.minted}` }); };
  return calls;
}

test('a young token is reused, an old one is replaced, and a refused one can be renewed on demand', async () => {
  const calls = fakeServer();
  try {
    rememberAccess('first');
    assert.equal(await freshAccess(), 'first', 'young: no request');
    assert.equal(calls.minted, 0);
    assert.equal(await freshAccess('', true), 'token-1', 'renewed on demand');
    // Twenty minutes later (a page left open) the token is not trusted.
    const start = realNow();
    Date.now = () => start + 20 * 60 * 1000;
    assert.equal(await freshAccess(), 'token-2');
    assert.equal(await freshAccess(), 'token-2', 'and then reused');
    assert.equal(calls.minted, 2);
  } finally { globalThis.fetch = realFetch; Date.now = realNow; }
});

test('several requests at once ask for one token, and a failed renewal keeps the old token', async () => {
  const calls = fakeServer();
  try {
    const start = realNow();
    Date.now = () => start + 60 * 60 * 1000;
    const tokens = await Promise.all([freshAccess(), freshAccess(), freshAccess()]);
    assert.equal(new Set(tokens).size, 1);
    assert.equal(calls.minted, 1);
    globalThis.fetch = async () => { throw new Error('offline'); };
    Date.now = () => start + 2 * 60 * 60 * 1000;
    assert.equal(await freshAccess('none'), tokens[0], 'offline: the last token is better than none');
  } finally { globalThis.fetch = realFetch; Date.now = realNow; }
});

test('a request the server refuses for an old token is sent once more with a new one, and only once', async () => {
  const minted = fakeServer();
  try {
    rememberAccess('stale');
    const sent = [];
    const answer = await withAccess('stale', async access => { sent.push(access); return new Response('', { status: access === 'stale' ? 401 : 200 }); });
    assert.equal(answer.status, 200);
    assert.deepEqual(sent, ['stale', 'token-1']);
    sent.length = 0;
    const refused = await withAccess('x', async access => { sent.push(access); return new Response('', { status: 401 }); });
    assert.equal(refused.status, 401);
    assert.equal(sent.length, 2, 'never a loop');
    assert.ok(minted.minted >= 1);
  } finally { globalThis.fetch = realFetch; Date.now = realNow; }
});

test('everything in the page that sends staging access renews it (a page left open must never send a token minted at load)', () => {
  const sources = readdirSync(new URL('../src/', import.meta.url)).filter(name => /\.(ts|tsx)$/.test(name) && name !== 'staging-token.ts');
  for (const name of sources) {
    const code = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    if (!/x-mumoo-brain-access/i.test(code)) continue;
    assert.ok(/withAccess|freshAccess/.test(code), `${name} sends staging access without renewing it`);
  }
});
