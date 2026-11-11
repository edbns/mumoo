import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { freshAccess, rememberAccess } = await server.ssrLoadModule('/src/staging-token.ts');
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
