import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createHmac } from 'node:crypto';
import submit from '../netlify/functions/detect-voice.mjs';
import status from '../netlify/functions/detect-voice-status.mjs';

/** A staging access token, signed the way brain-tester-access signs it. */
const validToken = key => {
  const expiry = String(Math.floor(Date.now() / 1000) + 600);
  return `${expiry}.${createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
};
const ORIGIN = 'https://mumoo-staging.netlify.app';
const WORKER = readFileSync(fileURLToPath(new URL('../../audio-intelligence/modal_voice_staging.py', import.meta.url)), 'utf8');

async function withEnv(change, run) {
  const previous = { ...process.env };
  Object.assign(process.env, { SITE_ID: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', MUMOO_BRAIN_TESTER_KEY: 'k'.repeat(40), MUMOO_MUSIC_BRIDGE_SECRET: 'b'.repeat(40), ...change });
  const fetched = globalThis.fetch;
  try { return await run(); } finally {
    globalThis.fetch = fetched;
    for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_MUSIC_BRIDGE_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
}

const clip = () => {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(480_044)], { type: 'audio/wav' }), 'clip.wav');
  return form;
};
const submitRequest = (headers = {}) => new Request(`${ORIGIN}/.netlify/functions/detect-voice`, {
  method: 'POST', body: clip(), headers: { origin: ORIGIN, 'x-mumoo-brain-access': validToken('k'.repeat(40)), ...headers },
});
const statusRequest = (id = 'fc-abcdefgh12345678') => new Request(`${ORIGIN}/.netlify/functions/detect-voice-status?id=${id}`, {
  headers: { 'x-mumoo-brain-access': validToken('k'.repeat(40)) },
});

test('the worker is the one the functions call, and answers with the names the page reads', () => {
  const app = /^APP = "([^"]+)"/m.exec(WORKER)[1];
  for (const [file, name] of [['detect-voice.mjs', 'submit'], ['detect-voice-status.mjs', 'status']]) {
    const source = readFileSync(fileURLToPath(new URL(`../netlify/functions/${file}`, import.meta.url)), 'utf8');
    assert.ok(source.includes(`edbns-mumoo-staging--${app}-${name}.us-east.modal.run`), `${file} does not call ${app} ${name}`);
  }
  assert.match(WORKER, /async def submit\(/);
  assert.match(WORKER, /async def status\(/);
});

test('the submit function is staging only, needs access and a clip, and hands back the job id', async () => {
  await withEnv({}, async () => {
    assert.equal((await submit(new Request('https://mumoo.app/x', { method: 'POST', body: clip() }))).status, 404);
    assert.equal((await submit(submitRequest({ 'x-mumoo-brain-access': 'nope' }))).status, 401);
    assert.equal((await submit(submitRequest({ origin: 'https://evil.example' }))).status, 403);
    const empty = new Request(`${ORIGIN}/x`, { method: 'POST', body: new FormData(), headers: { origin: ORIGIN, 'x-mumoo-brain-access': validToken('k'.repeat(40)) } });
    assert.equal((await submit(empty)).status, 400);
    const sent = [];
    globalThis.fetch = async (url, init) => { sent.push({ url, init }); return Response.json({ id: 'fc-abcdefgh12345678' }); };
    const answer = await submit(submitRequest());
    assert.equal(answer.status, 202);
    assert.deepEqual(await answer.json(), { id: 'fc-abcdefgh12345678' });
    assert.equal(sent[0].init.headers.Authorization, `Bearer ${'b'.repeat(40)}`);
  });
  await withEnv({ MUMOO_MUSIC_BRIDGE_SECRET: 'short' }, async () => assert.equal((await submit(submitRequest())).status, 503));
});

test('the status function passes on the answer and nothing of the worker\'s measurements', async () => {
  await withEnv({}, async () => {
    globalThis.fetch = async () => Response.json({ status: 'running' }, { status: 202 });
    assert.equal((await status(statusRequest())).status, 202);
    globalThis.fetch = async () => Response.json({ version: 1, value: 'male', reason: null, medianHz: 120.5, stretches: 6, windows: [{ female: 0.001 }] });
    const done = await status(statusRequest());
    assert.deepEqual(await done.json(), { version: 1, value: 'male', reason: null });
    globalThis.fetch = async () => Response.json({ version: 1, value: null, reason: 'no_singing' });
    assert.deepEqual(await (await status(statusRequest())).json(), { version: 1, value: null, reason: 'no_singing' });
    for (const bad of [{ version: 2, value: 'male' }, { version: 1, value: 'robot' }, { version: 1 }]) {
      globalThis.fetch = async () => Response.json(bad);
      assert.equal((await status(statusRequest())).status, 502, JSON.stringify(bad));
    }
    assert.equal((await status(statusRequest('../etc'))).status, 400);
  });
});

test('the page takes only an answer it knows', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { parseSingerVoice } = await server.ssrLoadModule('/src/singer-voice.ts');
    assert.deepEqual(parseSingerVoice({ version: 1, value: 'female' }), { value: 'female' });
    assert.deepEqual(parseSingerVoice({ version: 1, value: 'both' }), { value: 'both' });
    assert.deepEqual(parseSingerVoice({ version: 1, value: null }), { value: null });
    for (const bad of [null, {}, { version: 2, value: 'male' }, { version: 1, value: 'child' }, { version: 1 }, 'male']) {
      assert.equal(parseSingerVoice(bad), undefined, JSON.stringify(bad));
    }
  } finally { await server.close(); }
});
