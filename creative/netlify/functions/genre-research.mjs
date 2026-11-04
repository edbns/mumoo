const origin = 'https://mumoo-staging.netlify.app';
const site = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const endpoint = 'https://edbns-mumoo-staging--mumoo-genre-research-evaluate.us-east.modal.run';
const size = 480044;
const headers = { 'Cache-Control': 'no-store' };
const fail = (status, error) => Response.json({ error }, { status, headers });

export default async function genreResearch(request) {
  if (process.env.SITE_ID !== site || new URL(request.url).origin !== origin) return fail(404, 'Not found.');
  if (request.method !== 'POST' || request.headers.get('origin') !== origin) return fail(403, 'Open the staging research page.');
  const code = request.headers.get('x-mumoo-genre-access') ?? '';
  if (!/^\d{10}\.[a-f0-9]{64}$/.test(code)) return fail(401, 'Enter a valid tester code.');
  try {
    if (Number(request.headers.get('content-length')) > size) return fail(413, 'Audio clip is too large.');
    const reader = request.body?.getReader();
    if (!reader) return fail(400, 'Audio is required.');
    const chunks = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > size) { await reader.cancel(); return fail(413, 'Audio clip is too large.'); }
      chunks.push(value);
    }
    if (total !== size) return fail(400, 'Expected exactly 15 seconds of audio.');
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const response = await fetch(endpoint, {
      method: 'POST', body, signal: AbortSignal.timeout(54000), redirect: 'error',
      headers: { 'Content-Type': 'audio/wav', 'X-Mumoo-Genre-Access': code,
        'X-Mumoo-Genre-Diagnostic': request.headers.get('x-mumoo-genre-diagnostic') === '1' ? '1' : '0' },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result) return Response.json(result, { headers });
    if ([400, 401, 413, 429].includes(response.status)) return fail(response.status, result?.detail ?? 'Analysis could not proceed.');
    return fail(502, 'Analysis could not complete. Try again.');
  } catch {
    return fail(504, 'Analysis took too long. Try again.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 5, aggregateBy: ['ip'] } };
