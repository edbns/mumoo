import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { adminEmails, adminFrom } from '../netlify/lib/admin.mjs';
import { ACCEPTED_TYPES, addTag, ATTITUDES, changeItem, itemArrived, listLibrary, removeItem, removeTag, reserveItem } from '../netlify/lib/library.mjs';
import { db } from '../netlify/lib/person.mjs';
import { listProblems, markSeen, recordProblem } from '../netlify/lib/problems.mjs';
import { storageReady } from '../netlify/lib/storage.mjs';
import libraryHandler from '../netlify/functions/admin/library.mjs';
import problemsHandler from '../netlify/functions/admin/problems.mjs';
import reportHandler from '../netlify/functions/report-problem.mjs';

const READY = storageReady() && Boolean(process.env.DATABASE_URL);

test('the server knows the same attitudes as the brain', () => {
  const source = readFileSync(new URL('../src/lyric-meaning.ts', import.meta.url), 'utf8');
  const list = /ATTITUDES = \[([\s\S]*?)\] as const/.exec(source)[1].match(/'([a-z]+)'/g).map(code => code.slice(1, -1));
  assert.deepEqual(ATTITUDES, list);
});

test('the admin list is read from ADMIN_EMAILS, lowercase, and empty means nobody', () => {
  const previous = process.env.ADMIN_EMAILS;
  try {
    process.env.ADMIN_EMAILS = ' Moo@Mumoo.app , other@example.com,, ';
    assert.deepEqual(adminEmails(), ['moo@mumoo.app', 'other@example.com']);
    delete process.env.ADMIN_EMAILS;
    assert.deepEqual(adminEmails(), []);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous;
  }
});

/** Neon Auth's signing keys served from this machine, so real signed tokens can be checked without Neon. */
async function withAuth(run) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previous = { ...process.env };
  Object.assign(process.env, { NEON_AUTH_JWKS_URL: `${origin}/jwks`, NEON_AUTH_BASE_URL: `${origin}/auth`, ADMIN_EMAILS: 'moo@mumoo.app' });
  const token = (id, email) => new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(id).setIssuer(origin).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const asRequest = async (id, email, url = 'https://x.test/api/admin/library', init = {}) =>
    new Request(url, { ...init, headers: { ...init.headers, ...(id && { authorization: `Bearer ${await token(id, email)}` }) } });
  try { await run({ asRequest }); } finally {
    server.close();
    for (const key of ['NEON_AUTH_JWKS_URL', 'NEON_AUTH_BASE_URL', 'ADMIN_EMAILS']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}

test('only the listed, confirmed admin gets in', { skip: !READY, timeout: 60000 }, () => withAuth(async ({ asRequest }) => {
  const sql = db();
  assert.equal((await adminFrom(await asRequest(null))).refusal.status, 401, 'signed out');
  assert.equal((await adminFrom(await asRequest('test-nobody', 'someone@example.com'))).refusal.status, 403, 'not on the list');
  assert.equal((await adminFrom(await asRequest('test-nobody', 'moo@mumoo.app'))).refusal.status, 403, 'on the list but never confirmed their email');
  assert.equal((await libraryHandler(await asRequest('test-nobody', 'someone@example.com'))).status, 403);
  assert.equal((await problemsHandler(await asRequest(null))).status, 401);

  const id = randomUUID();
  await sql`insert into neon_auth."user" (id, name, email, "emailVerified") values (${id}, 'Test admin', 'moo@mumoo.app', false)`;
  try {
    assert.equal((await adminFrom(await asRequest(id, 'moo@mumoo.app'))).refusal.status, 403, 'unconfirmed email');
    await sql`update neon_auth."user" set "emailVerified" = true where id = ${id}`;
    const { admin } = await adminFrom(await asRequest(id, 'Moo@Mumoo.app'));
    assert.equal(admin.email, 'moo@mumoo.app');
  } finally { await sql`delete from neon_auth."user" where id = ${id}`; }
}));

const photo = (size) => Uint8Array.from({ length: size }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 7);
const admin = { email: 'moo@mumoo.app' };
const aTag = () => `t${randomBytes(4).toString('hex')}`;

test('a library item goes from upload to approved, is checked at every step, and leaves nothing behind', { skip: !READY, timeout: 60000 }, async () => {
  const made = [];
  const tags = [aTag(), aTag()];
  try {
    assert.match((await reserveItem(admin, { type: 'audio/mpeg', bytes: 10, rights: true })).refused, /JPEG/, 'no music');
    assert.match((await reserveItem(admin, { type: 'image/jpeg', bytes: 20_000_000, rights: true })).refused, /too large/);
    assert.match((await reserveItem(admin, { type: 'image/jpeg', bytes: 100 })).refused, /rights/, 'rights must be confirmed');
    assert.ok(ACCEPTED_TYPES.includes('image/gif') && ACCEPTED_TYPES.includes('video/mp4'));

    const { id, putUrl } = await reserveItem(admin, { type: 'image/jpeg', bytes: 2048, rights: true, note: ' licence 42 ' });
    made.push(id);
    assert.equal(await itemArrived(id), null, 'not there until the file is sent');
    assert.equal((await fetch(putUrl, { method: 'PUT', body: photo(999), headers: { 'Content-Type': 'image/jpeg' } })).status, 200);
    assert.equal(await itemArrived(id), null, 'a file of the wrong size is turned away');
    assert.equal((await fetch(putUrl, { method: 'PUT', body: photo(2048), headers: { 'Content-Type': 'image/jpeg' } })).status, 200);
    const item = await itemArrived(id);
    assert.equal(item.status, 'pending');
    assert.equal(item.kind, 'photo');
    assert.equal(item.clearedBy, 'moo@mumoo.app');
    assert.equal(item.note, 'licence 42');
    assert.equal((await fetch(item.url)).status, 200, 'the admin can see it through a signed link');
    assert.ok([400, 403].includes((await fetch(item.url.split('?')[0])).status), 'nobody else can');

    assert.match((await changeItem(id, { status: 'approved' })).refused, /attitude/, 'needs an attitude first');
    assert.match((await changeItem(id, { attitudes: ['sparkly'] })).refused, /list/);
    assert.match((await changeItem(id, { attitudes: ['joyful', 'playful', 'flirty', 'tender', 'romantic'] })).refused, /At most 4/);
    assert.match((await changeItem(id, { tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).refused, /At most 5/);
    assert.match((await changeItem(id, { tags: ['bad!tag'] })).refused, /symbols/);
    assert.match((await changeItem(id, { status: 'pending' })).refused, /approved or hidden/);

    const done = await changeItem(id, { attitudes: ['tender', 'nostalgic', 'tender'], tags: [` ${tags[0].toUpperCase()} `, tags[1]], genre: 'Pop', subGenre: 'Indie Pop', status: 'approved' });
    assert.deepEqual(done.attitudes, ['tender', 'nostalgic']);
    assert.deepEqual(done.tags, tags, 'tags are lowercased and tidy');
    assert.equal(done.status, 'approved');
    assert.equal(done.subGenre, 'Indie Pop');
    const cleared = await changeItem(id, { genre: '' });
    assert.equal(cleared.genre, null, 'genre is optional');
    assert.equal(cleared.subGenre, null, 'a sub-genre never outlives its genre');

    const listed = await listLibrary();
    assert.equal(listed.items.find(row => row.id === id).status, 'approved');
    assert.equal(listed.tags.find(row => row.name === tags[0]).items, 1);

    assert.equal(await removeTag(tags[0]), true);
    assert.deepEqual((await listLibrary()).items.find(row => row.id === id).tags, [tags[1]], 'removing a tag takes it off the items');
    assert.equal(await removeItem(id), true);
    assert.equal(await removeItem(id), false);
    assert.equal((await fetch(item.url)).status, 404, 'the file is gone from storage');
  } finally {
    for (const id of made) await removeItem(id).catch(() => undefined);
    for (const tag of tags) await removeTag(tag).catch(() => undefined);
  }
});

test('the tag list is kept small', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const added = [];
  try {
    assert.match((await addTag('no way!')).refused, /symbols/);
    const before = (await listLibrary()).tags.length;
    const room = 40 - before;
    for (let n = 0; n < room; n += 1) { const tag = aTag(); added.push(tag); assert.equal((await addTag(tag)).tag, tag); }
    assert.match((await addTag(aTag())).refused, /full/);
    const reuse = added[0];
    assert.equal((await addTag(reuse)).tag, reuse, 'a tag that exists is not a new one');
  } finally { for (const tag of added) await sql`delete from library_tags where name = ${tag}`; }
});

test('problems are written down, shown unseen first and marked as seen; strangers can only add small ones', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const mark = `test ${randomUUID()}`;
  try {
    assert.equal(await recordProblem({ kind: 'nonsense', message: mark }), false);
    assert.equal(await recordProblem({ kind: 'render', message: '   ' }), false);
    assert.equal(await recordProblem({ kind: 'sign_in', email: 'a@b.test', message: `${mark} 1` }), true);
    assert.equal(await recordProblem({ kind: 'render', message: `${mark} 2` }), true);
    const [first] = (await sql`select id from problems where message = ${`${mark} 1`}`);
    await markSeen(Number(first.id));
    const { problems, unseen } = await listProblems();
    const ours = problems.filter(row => row.message.startsWith(mark));
    assert.equal(ours.length, 2);
    assert.equal(ours.find(row => row.message.endsWith('1')).seen, true);
    assert.ok(unseen >= 1);
    assert.ok(problems.findIndex(row => row.message === `${mark} 2`) < problems.findIndex(row => row.message === `${mark} 1`), 'unseen comes first');

    const send = (body) => reportHandler(new Request('https://x.test/api/report-problem', { method: 'POST', body: JSON.stringify(body), headers: { 'content-length': String(JSON.stringify(body).length) } }));
    assert.equal((await send({ kind: 'download', message: `${mark} 3`, email: 'typed@example.com' })).status, 202);
    assert.equal((await send({ kind: 'hack', message: 'x' })).status, 400);
    assert.equal((await reportHandler(new Request('https://x.test/api/report-problem', { method: 'GET' }))).status, 405);
    const [typed] = await sql`select email, user_id from problems where message = ${`${mark} 3`}`;
    assert.equal(typed.email, 'typed@example.com');
    assert.equal(typed.user_id, null);
  } finally { await sql`delete from problems where message like ${`${mark}%`}`; }
});
