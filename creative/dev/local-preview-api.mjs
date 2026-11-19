import { createHash } from 'node:crypto';
import { cleanLink, cleanTracking, slugProblem } from '../netlify/lib/smart-links.mjs';
import { fanPage, missingPage, POLICY } from '../netlify/lib/fan-page.mjs';
import { PICK, lookupSong, parseSource, searchSongs } from '../netlify/lib/song-lookup.mjs';
import { summarise } from '../netlify/lib/link-stats.mjs';
import { adClick } from '../netlify/lib/traffic-source.mjs';
import { parseAgent } from '../netlify/lib/user-agent.mjs';
import * as support from '../netlify/lib/support.mjs';

/**
 * Stand-ins for the staging servers, so every screen can be used and designed on the local dev server.
 * They answer with sample data (never the song's real lyrics or analysis) and the real servers would refuse the stand-in token.
 * This is part of the dev server only; it is never part of a build.
 */

const SAMPLE_LINES = [['These', 'are', 'sample', 'words'], ['for', 'designing', 'the', 'screens'], ['not', 'your', 'real', 'lyrics']];
const FIRST_WORD_MS = 600;
const READY_AFTER_MS = 1500;
const NEUTRAL_READING = { version: 1, clarity: 'clear', attitude: 'neutral', sadness: 0, intensity: 3 };

const send = (response, status, value) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
};

const readBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

/** Words spread over the 15 seconds, one entry per word, the way the lyrics worker answers. */
function lyricsFor(lines, language) {
  const count = lines.flat().length;
  const step = Math.max(80, Math.min(1100, Math.floor(13_500 / count)));
  let index = 0;
  const words = lines.flatMap((line, row) => line.map(text => {
    const startMs = FIRST_WORD_MS + index++ * step;
    return { text, line: row, startMs, endMs: startMs + step - 40, score: 0.9, status: 'aligned' };
  }));
  return { version: 2, source: 'transcribed', language: language ?? 'en', languageProbability: 0.9, languageAlternatives: [], words, metrics: {} };
}

/** The one code the stand-in sign-in accepts, so the sign-in popup can be used (and designed) without sending any email. */
const PREVIEW_CODE = '123456';
const SESSION_COOKIE = 'preview_session';
/** Enough of them that the history needs scrolling, newest first. */
const sampleRenders = () => Array.from({ length: 60 }, (_, index) => ({
  id: `preview-render-${index + 1}`, bytes: 3_000_000 + index * 70_000, createdAt: new Date(Date.UTC(2026, 10, 9, 18) - index * 43_200_000).toISOString(), url: '#',
}));
/** A plain coloured picture standing in for an uploaded photo. */
const samplePicture = (from, to) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="180" height="320" fill="url(#g)"/></svg>`)}`;
const sampleUploads = () => [
  { id: 'preview-photo-1', kind: 'photo', use: 'dust', status: 'ready', bytes: 1_200_000, createdAt: '2026-11-07T09:00:00Z', url: samplePicture('#2fe92b', '#0f0f0f') },
  { id: 'preview-photo-2', kind: 'photo', use: 'riso', status: 'ready', bytes: 900_000, createdAt: '2026-11-07T09:30:00Z', url: samplePicture('#ff9821', '#1b1b1d') },
];

const sampleInvoices = () => [
  { id: 'preview-invoice-1', number: 'MUM-0003', createdAt: '2026-11-09T18:04:00Z', description: '100 video credits', amount: 2000, currency: 'USD', status: 'paid' },
  { id: 'preview-invoice-2', number: 'MUM-0002', createdAt: '2026-11-03T11:30:00Z', description: '20 video credits', amount: 500, currency: 'USD', status: 'paid' },
  { id: 'preview-invoice-3', number: 'MUM-0001', createdAt: '2026-10-28T09:15:00Z', description: '20 video credits', amount: 500, currency: 'USD', status: 'refunded' },
];

const b64 = value => Buffer.from(value).toString('base64url');

/** The signed-in email, from the stand-in's cookie. */
function cookieEmail(request) {
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(request.headers.cookie ?? '');
  return match ? Buffer.from(match[1], 'base64url').toString('utf8') : null;
}

/** The three-part token our own API expects; here it only carries the email. */
const tokenFor = email => `preview.${b64(email)}.local`;
const emailOf = request => {
  const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
  const payload = token?.split('.')[1];
  return payload ? Buffer.from(payload, 'base64url').toString('utf8') : null;
};

const previewUser = email => ({ id: 'preview-user', email, name: email, emailVerified: true, image: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
const previewSession = email => ({
  session: { id: 'preview-session', userId: 'preview-user', token: tokenFor(email), expiresAt: '2027-01-01T00:00:00Z', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
  user: previewUser(email),
});

export function localPreviewApi() {
  return {
    name: 'local-preview-api',
    configureServer(server) {
      const jobs = new Map();
      let jobCount = 0;
      const route = (path, method, handler) => server.middlewares.use(path, (request, response, next) => {
        if (request.method !== method) return next();
        handler(request, response).catch(() => send(response, 500, { error: 'The local preview stand-in failed.' }));
      });
      // The same addresses netlify.toml sends to the legal page.
      server.middlewares.use((request, _response, next) => {
        if (/^\/(legal|terms|privacy|cookies|acceptable-use|refunds|ai|dpa)\/?(\?|$)/.test(request.url ?? '')) request.url = '/legal.html';
        if (/^\/welcome\/?(\?|$)/.test(request.url ?? '')) request.url = '/welcome.html';
        if (/^\/pricing\/?(\?|$)/.test(request.url ?? '')) request.url = '/pricing.html';
        next();
      });
      const startJob = (result) => {
        const id = `local-${++jobCount}`;
        jobs.set(id, { result, readyAt: Date.now() + READY_AFTER_MS });
        return id;
      };
      const poll = (request, response) => {
        const job = jobs.get(new URL(request.url, 'http://local').searchParams.get('id'));
        if (!job) return send(response, 410, { error: 'That job is gone.' });
        return Date.now() < job.readyAt ? send(response, 202, { status: 'running' }) : send(response, 200, job.result);
      };

      route('/api/brain-tester-access', 'POST', async (_request, response) => send(response, 200, { token: 'local-preview' }));

      // Sign-in: the same email-code steps as the real Neon Auth, with one fixed code.
      route('/dev-auth/get-session', 'GET', async (request, response) => {
        const email = cookieEmail(request);
        send(response, 200, email ? previewSession(email) : null);
      });
      route('/dev-auth/email-otp/send-verification-otp', 'POST', async (_request, response) => send(response, 200, { success: true }));
      route('/dev-auth/sign-in/email-otp', 'POST', async (request, response) => {
        const { email, otp } = JSON.parse((await readBody(request)).toString('utf8'));
        if (otp !== PREVIEW_CODE) return send(response, 400, { code: 'INVALID_OTP', message: 'Invalid OTP' });
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${b64(email)}; Path=/; SameSite=Lax`);
        send(response, 200, { redirect: false, token: tokenFor(email), user: previewUser(email) });
      });
      // Changing the email: a code goes to the new address; the same fixed code confirms it and the account stays the same.
      route('/dev-auth/email-otp/request-email-change', 'POST', async (_request, response) => send(response, 200, { success: true }));
      route('/dev-auth/email-otp/change-email', 'POST', async (request, response) => {
        const { newEmail, otp } = JSON.parse((await readBody(request)).toString('utf8'));
        if (otp !== PREVIEW_CODE) return send(response, 400, { code: 'INVALID_OTP', message: 'Invalid OTP' });
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${b64(newEmail)}; Path=/; SameSite=Lax`);
        send(response, 200, { success: true });
      });
      route('/dev-auth/sign-out', 'POST', async (_request, response) => {
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
        send(response, 200, { success: true });
      });

      // The signed-in person's own API, with sample data.
      const signedIn = (handler) => async (request, response) => {
        const email = emailOf(request);
        return email ? handler(email, request, response) : send(response, 401, { error: 'Sign in to continue.' });
      };
      route('/api/members', 'GET', async (_request, response) => send(response, 200, { latest: 128 }));
      // A new person's credits can be tried with the cookie `preview_allowance=<credits>:<1 when the free video is still to come>`.
      route('/api/account', 'GET', signedIn(async (email, request, response) => {
        const [credits = '120', free = '0'] = (/(?:^|;\s*)preview_allowance=(\d+):([01])/.exec(request.headers.cookie ?? '') ?? []).slice(1);
        send(response, 200, { email, memberNo: 42, lastSeenAt: new Date().toISOString(), storage: { used: 1_000_000_000, quota: 5_000_000_000 }, credits: Number(credits), freeVideo: free === '1' });
      }));
      let renders = sampleRenders();
      let uploads = sampleUploads();
      const idOf = request => new URL(request.url, 'http://local').searchParams.get('id');
      route('/api/renders', 'GET', signedIn(async (_email, _request, response) => send(response, 200, { renders })));
      route('/api/renders', 'DELETE', signedIn(async (_email, request, response) => {
        renders = renders.filter(item => item.id !== idOf(request));
        send(response, 200, { renders });
      }));
      route('/api/invoices', 'GET', signedIn(async (_email, request, response) => (idOf(request)
        ? send(response, 202, { error: 'Invoices come from Polar, which the local preview does not reach.' })
        : send(response, 200, { invoices: sampleInvoices() }))));
      // Checkout without Polar: "paying" returns straight away, as Polar does after a test card.
      const PACK_VIDEOS = { 5: 20, 20: 100, 50: 300 };
      let previewCheckout = null;
      route('/api/checkout', 'POST', signedIn(async (_email, request, response) => {
        const { usd } = await body(request);
        if (!PACK_VIDEOS[usd]) return send(response, 400, { error: 'That pack is not on sale.' });
        previewCheckout = { id: `local-checkout-${Date.now()}`, videos: PACK_VIDEOS[usd], readyAt: Date.now() + READY_AFTER_MS };
        send(response, 200, { url: `/?checkout_id=${previewCheckout.id}` });
      }));
      route('/api/checkout', 'GET', signedIn(async (_email, request, response) => (previewCheckout?.id === idOf(request) && Date.now() >= previewCheckout.readyAt
        ? send(response, 200, { status: 'paid', videos: previewCheckout.videos, bonus: previewInvited ? 10 : 0, credits: 120 + previewCheckout.videos + (previewInvited ? 10 : 0) })
        : send(response, 200, { status: 'pending' }))));
      // Invites: someone arriving with any ?ref= is that friend once signed in, so the first pack shows its 10 extra videos.
      let previewInvited = false;
      route('/api/referral', 'POST', signedIn(async (_email, request, response) => { await body(request); previewInvited = true; send(response, 200, { result: 'joined' }); }));
      route('/api/referral', 'GET', signedIn(async (_email, request, response) => send(response, 200, {
        code: 'preview8', link: `http://${request.headers.host}/?ref=preview8`, joined: 3, bought: 2, thisMonth: 2, earned: 20, cap: 20, videos: 10,
        firstPackBonus: previewInvited ? 10 : 0,
      })));
      // Help chat: the real matching and rule checks, kept in memory. What needs our model "thinks" for a few seconds, then is not sure.
      const help = { status: 'helper', messages: [], thinkingUntil: 0, n: 0 };
      const helpSays = (author, text) => help.messages.push({ id: ++help.n, author, text, at: new Date().toISOString() });
      const helpNow = () => {
        if (help.thinkingUntil && Date.now() >= help.thinkingUntil) { help.thinkingUntil = 0; helpSays('helper', support.FIXED.unsure); }
        return { status: help.status, thinking: Boolean(help.thinkingUntil), messages: help.messages };
      };
      route('/api/support', 'GET', signedIn(async (_email, _request, response) => send(response, 200, helpNow())));
      route('/api/support', 'POST', signedIn(async (_email, request, response) => {
        const { message, team } = await body(request);
        if (team) { if (help.status !== 'waiting') helpSays('helper', support.FIXED.human); help.status = 'waiting'; return send(response, 200, helpNow()); }
        const text = typeof message === 'string' ? message.trim() : '';
        if (!text) return send(response, 400, { error: 'Type a message first.' });
        if (support.hasLink(text)) return send(response, 400, { error: 'Links can’t be sent here. Just say it in words.' });
        helpSays('person', text);
        if (help.status !== 'helper') return send(response, 200, helpNow());
        const plain = support.steers(text) ? null : support.matchAnswer(text);
        if (support.steers(text)) helpSays('helper', support.FIXED.off_topic);
        else if (plain?.text) helpSays('helper', plain.text);
        else if (plain?.account === 'credits') helpSays('helper', 'You have 120 credits. One credit makes one video.');
        else if (plain) helpSays('helper', 'You have 6 videos in Media, the newest from Nov 19. New ones show up in Media when they’re done, and the bar at the bottom shows how far along they are. If one fails, its credit comes back on its own.');
        else help.thinkingUntil = Date.now() + 3000;
        send(response, 200, helpNow());
      }));
      // A photo sent here is "prepared" for a few seconds, like the cut-out on our worker, then shown in the colours of its upload.
      let uploadCount = 0;
      const readied = () => uploads.map(item => (item.status === 'preparing' && Date.now() >= item.readyAt
        ? { ...item, status: 'ready', url: samplePicture(['#5b8cff', '#e94bd6', '#ffd23f'][item.n % 3], '#111') } : item));
      route('/api/uploads', 'GET', signedIn(async (_email, _request, response) => { uploads = readied(); send(response, 200, { uploads }); }));
      route('/api/uploads', 'POST', signedIn(async (_email, request, response) => {
        const body = await readBody(request);
        const n = ++uploadCount;
        uploads = [...readied(), { id: `preview-new-${n}`, n, kind: 'photo', status: 'preparing', bytes: body.length, createdAt: new Date().toISOString(), readyAt: Date.now() + 3000 }];
        send(response, 200, { uploads });
      }));
      route('/api/uploads', 'DELETE', signedIn(async (_email, request, response) => {
        const except = new URL(request.url, 'http://local').searchParams.get('except');
        if (except !== null) uploads = uploads.filter(item => except.split(',').includes(item.id));
        else uploads = uploads.filter(item => item.id !== idOf(request));
        send(response, 200, { uploads });
      }));

      // The admin: only moo@mumoo.app, like the real list. Files "uploaded" here are kept in memory and served back.
      const ADMIN = 'moo@mumoo.app';
      const adminOnly = (handler) => async (request, response) => {
        const email = emailOf(request);
        if (!email) return send(response, 401, { error: 'Sign in to continue.' });
        return email.toLowerCase() === ADMIN ? handler(request, response) : send(response, 403, { error: 'This account does not have access.' });
      };
      const files = new Map();
      const sample = (id, colours, over) => ({
        id, kind: 'photo', contentType: 'image/jpeg', bytes: 2_000_000, status: 'pending', attitudes: [], tags: [], genre: null, subGenre: null, note: '', boards: [], notBoards: [],
        clearedBy: ADMIN, clearedAt: '2026-11-09T12:30:00Z', createdAt: '2026-11-09T12:30:00Z', ready: true, problem: null, seen: [], looking: false, seenAs: null, suggestion: null, also: [],
        url: samplePicture(...colours), ...over,
      });
      // Filed (some would also fit other boards), sure (filed as a group), not sure (checked one by one) and still being looked at: every part of the trays.
      let library = [
        sample('preview-lib-1', ['#ff9821', '#2b231a'], { status: 'approved', tags: ['sunset', 'beach'], boards: ['sunset-coast'], note: 'Licence 118, Studio Ray', seen: ['couple', 'sea'], seenAs: 'A couple on a beach at sunset, warm golden light.', also: ['intimate-velvet'] }),
        sample('preview-lib-9', ['#c1121f', '#0b0204'], { status: 'approved', boards: ['main-stage'], seenAs: 'A concert crowd under red stage lights and smoke.', also: ['dark-warehouse', 'live-raw'] }),
        sample('preview-lib-10', ['#1d3557', '#05070d'], { status: 'approved', boards: ['luxury-flex'], seenAs: 'A car interior at night, city lights through the windscreen.', also: ['night-drive'] }),
        sample('preview-lib-11', ['#e63946', '#14050a'], { status: 'approved', boards: ['main-stage'], seenAs: 'A red-lit stage with a crowd below.', also: ['dark-warehouse'] }),
        sample('preview-lib-2', ['#ffb347', '#3a2a1a'], { seenAs: 'Palm trees against an orange sky at golden hour.', suggestion: { boards: ['sunset-coast'], sure: true } }),
        sample('preview-lib-4', ['#ff7f50', '#20160f'], { seenAs: 'A woman dancing under a bridge on the beach at sunset.', suggestion: { boards: ['sunset-coast'], sure: true } }),
        sample('preview-lib-5', ['#7b2ff7', '#0a0a1a'], { seenAs: 'A festival crowd with laser lights and smoke.', suggestion: { boards: ['main-stage'], sure: true } }),
        sample('preview-lib-6', ['#b3122e', '#120306'], { seenAs: 'A pole dancer in dim red light.', suggestion: { boards: ['intimate-velvet', 'dark-warehouse'], sure: false } }),
        sample('preview-lib-7', ['#d9d9d9', '#1a1a1a'], { seenAs: 'Hands playing a piano, black and white.', suggestion: { boards: ['sanctuary-soul', 'rain-blue'], sure: false } }),
        sample('preview-lib-8', ['#2fe92b', '#0f0f0f'], { looking: true }),
        sample('preview-lib-3', ['#6b7367', '#26272d'], { kind: 'gif', contentType: 'image/gif', status: 'hidden', tags: ['dance'], genre: 'Pop', subGenre: 'Dance-Pop', note: 'Own work' }),
      ];
      let pool = ['sunset', 'beach', 'dance'];
      const tagsNow = () => pool.map(name => ({ name, items: library.filter(item => item.tags.includes(name)).length }));
      const body = async request => JSON.parse((await readBody(request)).toString('utf8') || '{}');
      const idParam = request => new URL(request.url, 'http://local').searchParams.get('id');
      const tagParam = request => new URL(request.url, 'http://local').searchParams.get('tag');
      route('/api/admin/overview', 'GET', adminOnly(async (_request, response) => send(response, 200, {
        email: ADMIN, people: 3, problems: { unseen: problems.filter(item => !item.seen).length },
        library: { approved: library.filter(item => item.status === 'approved').length, pending: library.filter(item => item.status === 'pending').length, hidden: library.filter(item => item.status === 'hidden').length },
      })));
      // What the creatives may draw: approved items only, with just what the brain needs.
      route('/api/library', 'GET', async (_request, response) => send(response, 200, {
        items: library.filter(item => item.status === 'approved' && !item.hidden && item.kind === 'photo')
          .map(({ id, kind, attitudes, tags, genre, subGenre, url }) => ({ id, kind, attitudes, tags, genre, subGenre, url })),
      }));
      route('/api/admin/library', 'GET', adminOnly(async (_request, response) => send(response, 200, { items: library.filter(item => !item.hidden), tags: tagsNow() })));
      route('/api/admin/library', 'POST', adminOnly(async (request, response) => {
        if (tagParam(request)) return send(response, 200, { items: library, tags: tagsNow() });
        const { type, bytes, note } = await body(request);
        const id = `preview-lib-${Date.now()}`;
        const kind = type.startsWith('video/') ? 'video' : type === 'image/gif' ? 'gif' : 'photo';
        library = [{ ...sample(id, ['#000', '#000'], { kind, contentType: type, bytes, note: note ?? '', clearedAt: new Date().toISOString(), createdAt: new Date().toISOString() }), url: `/dev-media/${id}`, hidden: true }, ...library];
        send(response, 201, { id, putUrl: `/dev-media/${id}` });
      }));
      route('/dev-media', 'PUT', async (request, response) => {
        files.set(request.url.slice(1), { bytes: await readBody(request), type: request.headers['content-type'] });
        response.statusCode = 200; response.end();
      });
      route('/dev-media', 'GET', async (request, response) => {
        const file = files.get(request.url.slice(1));
        if (!file) return send(response, 404, { error: 'Gone.' });
        response.setHeader('Content-Type', file.type); response.end(file.bytes);
      });
      route('/api/admin/library', 'PUT', adminOnly(async (request, response) => {
        const item = library.find(entry => entry.id === idParam(request));
        if (!item) return send(response, 404, { error: 'Not found.' });
        delete item.hidden;
        send(response, 200, { item });
      }));
      route('/api/admin/library', 'PATCH', adminOnly(async (request, response) => {
        const item = library.find(entry => entry.id === idParam(request));
        if (!item) return send(response, 404, { error: 'Not found.' });
        const change = await body(request);
        Object.assign(item, { ...change, genre: change.genre === '' ? null : (change.genre ?? item.genre), subGenre: change.subGenre === '' ? null : (change.subGenre ?? item.subGenre) });
        pool = [...new Set([...pool, ...item.tags])];
        item.notBoards = item.notBoards.filter(board => !item.boards.includes(board));
        item.also = item.also.filter(board => !item.boards.includes(board) && !item.notBoards.includes(board));
        send(response, 200, { item, tags: tagsNow() });
      }));
      route('/api/admin/library', 'DELETE', adminOnly(async (request, response) => {
        const tag = tagParam(request);
        if (tag) { pool = pool.filter(name => name !== tag); library = library.map(item => ({ ...item, tags: item.tags.filter(name => name !== tag) })); }
        else library = library.filter(item => item.id !== idParam(request));
        send(response, 200, { items: library, tags: tagsNow() });
      }));
      let problems = [
        { id: 3, kind: 'render', userId: 'u1', email: 'dana@example.com', message: 'The cloud render did not respond in time.', createdAt: '2026-11-10T05:12:00Z', seen: false },
        { id: 2, kind: 'sign_in', userId: null, email: 'sam@example.com', message: 'Code not accepted: That code is wrong or has expired.', createdAt: '2026-11-10T03:40:00Z', seen: false },
        { id: 1, kind: 'download', userId: 'u2', email: 'lee@example.com', message: 'A download that was in progress did not finish.', createdAt: '2026-11-09T19:02:00Z', seen: true },
      ];
      const problemsNow = () => ({ problems, unseen: problems.filter(item => !item.seen).length });
      route('/api/admin/problems', 'GET', adminOnly(async (_request, response) => send(response, 200, problemsNow())));
      route('/api/admin/problems', 'PATCH', adminOnly(async (request, response) => {
        const params = new URL(request.url, 'http://local').searchParams;
        problems = problems.map(item => params.get('all') === '1' || String(item.id) === params.get('id') ? { ...item, seen: true } : item);
        send(response, 200, problemsNow());
      }));
      route('/api/report-problem', 'POST', async (_request, response) => send(response, 202, { ok: true }));

      // Smart links: the real lookup and search (public song data from Deezer and Apple, nothing of the person's; without Spotify's
      // keys here, a Spotify link is a guess with candidates), and links kept in memory, checked by the real rules.
      // The more specific paths come first: the middleware matches by prefix.
      route('/api/links/lookup', 'POST', async (request, response) => {
        const { url, pick } = JSON.parse((await readBody(request)).toString('utf8'));
        if (!parseSource(url)) return send(response, 400, { error: 'Paste a song link from Spotify, Apple Music, YouTube or Deezer, or type the song’s name.' });
        const song = await lookupSong(url, fetch, PICK.test(pick ?? '') ? pick : null).catch(() => null);
        send(response, song ? 200 : 404, song ? { song } : { error: 'We could not find that song. Check the link and try again.' });
      });
      route('/api/links/search', 'GET', async (request, response) => {
        const q = new URL(request.url, 'http://local').searchParams.get('q') ?? '';
        const results = await searchSongs(q).catch(() => null);
        send(response, results ? 200 : 502, results ? { results } : { error: 'Searching failed. Try again in a moment.' });
      });
      const smartLinks = new Map();
      route('/api/links/slug', 'GET', async (request, response) => {
        const name = new URL(request.url, 'http://local').searchParams.get('name') ?? '';
        const problem = slugProblem(name) ?? (smartLinks.has(name) || name === 'taken-name' ? 'Someone already has that name. Try another.' : null);
        send(response, 200, problem ? { free: false, error: problem } : { free: true });
      });
      // Fan page events as the real tracker keeps them, read with the same code; the country comes from the browser's language
      // (Netlify gives the real one), and `devDaysAgo` lets sample data fill the timeline. Nothing is forwarded to ad accounts.
      const linkEvents = new Map();
      const linkTracking = new Map();
      const noTracking = { meta_pixel_id: null, meta_capi_token: false, tiktok_pixel_id: null, tiktok_events_token: false, google_ads_id: null };
      route('/api/smart-links/track', 'POST', async (request, response) => {
        response.statusCode = 204;
        response.end();
        let body;
        try { body = JSON.parse((await readBody(request)).toString('utf8')); } catch { return; }
        const kept = smartLinks.get(body?.slug);
        const device = parseAgent(request.headers['user-agent'] ?? '');
        const kind = body?.event === 'click' ? 'click' : 'view';
        if (!kept || device.robot || (kind === 'click' && !kept.link.services.some(row => row.service === body.service && !row.hidden))) return;
        const ad = adClick(String(body.url ?? ''), String(body.referrer ?? ''));
        const country = /-([A-Z]{2})/.exec(request.headers['accept-language'] ?? '')?.[1] ?? null;
        const at = Date.now() - (Number(body.devDaysAgo) || 0) * 86_400_000;
        (linkEvents.get(body.slug) ?? linkEvents.set(body.slug, []).get(body.slug)).push({
          at, day: new Date(at).toISOString().slice(0, 10), kind, service: kind === 'click' ? body.service : null, country, ...device,
          is_paid_ad: ad.is_paid_ad, ad_network: ad.ad_network, source: ad.utm_source ?? ad.referrer, n: 1,
        });
      });
      route('/api/links/stats', 'GET', signedIn(async (_email, request, response) => {
        const params = new URL(request.url, 'http://local').searchParams;
        const days = Number(params.get('days') ?? 7);
        if (!smartLinks.has(params.get('slug'))) return send(response, 404, { error: 'That link is not yours, or it was deleted.' });
        const today = new Date().toISOString().slice(0, 10);
        const since = days ? Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000 : 0;
        const rows = (linkEvents.get(params.get('slug')) ?? []).filter(event => event.at >= since);
        send(response, 200, { stats: summarise(rows, days, today) });
      }));
      const linksRoute = method => route('/api/links', method, signedIn(async (_email, request, response) => {
        if (method === 'GET') {
          const week = Date.now() - 7 * 86_400_000;
          return send(response, 200, { links: [...smartLinks.values()].reverse().map(item => {
            const events = linkEvents.get(item.slug) ?? [];
            const count = (test) => events.filter(test).length;
            const services = {};
            for (const event of events) if (event.kind === 'click') services[event.service] = (services[event.service] ?? 0) + 1;
            return {
              ...item, tracking: linkTracking.get(item.slug) ?? noTracking, services,
              views: count(event => event.kind === 'view'), clicks: count(event => event.kind === 'click'),
              week_views: count(event => event.kind === 'view' && event.at > week), week_clicks: count(event => event.kind === 'click' && event.at > week),
              paid_views: count(event => event.kind === 'view' && event.is_paid_ad),
            };
          }) });
        }
        if (method === 'DELETE') {
          const slug = new URL(request.url, 'http://local').searchParams.get('slug');
          smartLinks.delete(slug);
          linkEvents.delete(slug);
          linkTracking.delete(slug);
          return send(response, 200, {});
        }
        const { slug, link, tracking } = JSON.parse((await readBody(request)).toString('utf8'));
        const problem = method === 'POST' ? slugProblem(slug) ?? (smartLinks.has(slug) ? 'Someone already has that name. Try another.' : null) : null;
        const cleaned = cleanLink(link);
        const ads = tracking === undefined ? null : await cleanTracking(tracking, async () => 'sealed');
        if (problem || cleaned.error || ads?.error) return send(response, ads?.status ?? 400, { error: problem ?? cleaned.error ?? ads.error });
        const now = new Date().toISOString();
        smartLinks.set(slug, { slug, link: cleaned.link, created_at: smartLinks.get(slug)?.created_at ?? now, updated_at: now });
        if (ads) {
          const before = linkTracking.get(slug) ?? noTracking;
          const token = (field) => (field in ads.tokens ? Boolean(ads.tokens[field]) : before[field]);
          linkTracking.set(slug, { ...ads.ids, meta_capi_token: token('meta_capi_token'), tiktok_events_token: token('tiktok_events_token') });
        }
        send(response, 200, { link: { ...smartLinks.get(slug), tracking: linkTracking.get(slug) ?? noTracking } });
      }));
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) linksRoute(method);
      route('/l', 'GET', async (request, response) => {
        const slug = new URL(request.url, 'http://local').pathname.slice(1);
        const home = `http://${request.headers.host}`;
        const kept = smartLinks.get(slug);
        response.statusCode = kept ? 200 : 404;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Security-Policy', POLICY);
        response.end(kept ? fanPage(kept.link, `${home}/l/${slug}`, home, { countAs: slug }) : missingPage(home));
      });

      route('/.netlify/functions/transcribe-lyrics', 'POST', async (request, response) => {
        const form = (await readBody(request)).toString('utf8');
        const meta = JSON.parse(/name="meta"\r\n\r\n([\s\S]*?)\r\n--/.exec(form)[1]);
        const result = lyricsFor(meta.lines ?? SAMPLE_LINES, meta.language);
        send(response, 202, { id: startJob(meta.lines ? { ...result, source: 'supplied' } : result) });
      });
      route('/.netlify/functions/transcribe-lyrics-status', 'GET', async (request, response) => poll(request, response));

      route('/.netlify/functions/read-lyric-meaning', 'POST', async (_request, response) => send(response, 202, { id: startJob(NEUTRAL_READING) }));
      route('/.netlify/functions/read-lyric-meaning-status', 'GET', async (request, response) => poll(request, response));

      route('/.netlify/functions/analyze-music', 'POST', async (request, response) => {
        const sha256 = createHash('sha256').update(await readBody(request)).digest('hex');
        send(response, 200, {
          version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256 },
          rhythm: { beatsMs: [1200, 3600, 7200, 10800], downbeatsMs: [], tempo: { status: 'estimated', bpm: 100, gridBpm: 100, alternativesBpm: [] } },
          features: {
            transientsMs: [3600, 7200, 10800],
            frames: Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 500, rms: 0.2, centroidHz: 1400, bandwidthHz: 700, rolloffHz: 3000, onsetStrength: 0.1 })),
          },
          provenance: {}, metrics: {},
        });
      });
    },
  };
}
