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
        uploads = uploads.filter(item => item.id !== idOf(request));
        send(response, 200, { uploads });
      }));

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
