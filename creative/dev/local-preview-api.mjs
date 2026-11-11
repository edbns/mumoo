import { createHash } from 'node:crypto';

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
  { id: 'preview-invoice-1', number: 'MUM-0003', createdAt: '2026-11-09T18:04:00Z', description: 'Creatives pack · 4 videos in HD', amount: 1200, currency: 'USD', status: 'paid', url: '#' },
  { id: 'preview-invoice-2', number: 'MUM-0002', createdAt: '2026-11-03T11:30:00Z', description: 'Credit top-up', amount: 2000, currency: 'USD', status: 'paid', url: '#' },
  { id: 'preview-invoice-3', number: 'MUM-0001', createdAt: '2026-10-28T09:15:00Z', description: 'Creatives pack · 2 videos in HD', amount: 600, currency: 'USD', status: 'refunded', url: '#' },
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
      route('/api/account', 'GET', signedIn(async (email, _request, response) =>
        send(response, 200, { email, lastSeenAt: new Date().toISOString(), storage: { used: 1_000_000_000, quota: 5_000_000_000 }, credit: { tokens: 120 } })));
      let renders = sampleRenders();
      let uploads = sampleUploads();
      const idOf = request => new URL(request.url, 'http://local').searchParams.get('id');
      route('/api/renders', 'GET', signedIn(async (_email, _request, response) => send(response, 200, { renders })));
      route('/api/renders', 'DELETE', signedIn(async (_email, request, response) => {
        renders = renders.filter(item => item.id !== idOf(request));
        send(response, 200, { renders });
      }));
      route('/api/invoices', 'GET', signedIn(async (_email, _request, response) => send(response, 200, { invoices: sampleInvoices() })));
      route('/api/uploads', 'GET', signedIn(async (_email, _request, response) => send(response, 200, { uploads })));
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
      let library = [
        { id: 'preview-lib-1', kind: 'photo', contentType: 'image/jpeg', bytes: 1_800_000, status: 'approved', attitudes: ['tender', 'nostalgic'], tags: ['sunset', 'beach'], genre: null, subGenre: null, note: 'Licence 118, Studio Ray', clearedBy: ADMIN, clearedAt: '2026-11-08T10:00:00Z', createdAt: '2026-11-08T10:00:00Z', ready: true, problem: null, url: samplePicture('#ff9821', '#2b231a') },
        { id: 'preview-lib-2', kind: 'photo', contentType: 'image/jpeg', bytes: 2_400_000, status: 'pending', attitudes: [], tags: [], genre: null, subGenre: null, note: '', clearedBy: ADMIN, clearedAt: '2026-11-09T12:30:00Z', createdAt: '2026-11-09T12:30:00Z', ready: true, problem: null, url: samplePicture('#2fe92b', '#0f0f0f') },
        { id: 'preview-lib-3', kind: 'gif', contentType: 'image/gif', bytes: 4_100_000, status: 'hidden', attitudes: ['playful'], tags: ['dance'], genre: 'Pop', subGenre: 'Dance-Pop', note: 'Own work', clearedBy: ADMIN, clearedAt: '2026-11-09T15:00:00Z', createdAt: '2026-11-09T15:00:00Z', ready: true, problem: null, url: samplePicture('#6b7367', '#26272d') },
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
        library = [{ id, kind, contentType: type, bytes, status: 'pending', attitudes: [], tags: [], genre: null, subGenre: null, note: note ?? '', clearedBy: ADMIN, clearedAt: new Date().toISOString(), createdAt: new Date().toISOString(), ready: true, problem: null, url: `/dev-media/${id}`, hidden: true }, ...library];
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
        if (change.status === 'approved' && !(change.attitudes ?? item.attitudes).length) return send(response, 400, { error: 'Give it at least one attitude before approving it.' });
        Object.assign(item, { ...change, genre: change.genre === '' ? null : (change.genre ?? item.genre), subGenre: change.subGenre === '' ? null : (change.subGenre ?? item.subGenre) });
        pool = [...new Set([...pool, ...item.tags])];
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

      route('/.netlify/functions/transcribe-lyrics', 'POST', async (request, response) => {
        const form = (await readBody(request)).toString('utf8');
        const meta = JSON.parse(/name="meta"\r\n\r\n([\s\S]*?)\r\n--/.exec(form)[1]);
        const result = lyricsFor(meta.lines ?? SAMPLE_LINES, meta.language);
        send(response, 202, { id: startJob(meta.lines ? { ...result, source: 'supplied' } : result) });
      });
      route('/.netlify/functions/transcribe-lyrics-status', 'GET', async (request, response) => poll(request, response));

      route('/.netlify/functions/read-lyric-meaning', 'POST', async (_request, response) => send(response, 202, { id: startJob(NEUTRAL_READING) }));
      route('/.netlify/functions/read-lyric-meaning-status', 'GET', async (request, response) => poll(request, response));

      // The preview has no voice worker: it hears no singer, so the Doodle row deals its default singers.
      route('/.netlify/functions/detect-voice', 'POST', async (_request, response) => send(response, 202, { id: startJob({ version: 1, value: null, reason: 'no_singing' }) }));
      route('/.netlify/functions/detect-voice-status', 'GET', async (request, response) => poll(request, response));

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
