/**
 * GET /api/links/preview?deezer=<track id> — the fan page's preview for a song Apple Music does not have: Deezer's 30 seconds,
 * whose link lasts about 15 minutes, so each play is sent to a fresh one. The CDN keeps the answer 5 minutes, well inside that.
 */
export default async function handler(request) {
  const id = new URL(request.url).searchParams.get('deezer') ?? '';
  if (request.method !== 'GET' || !/^\d{1,15}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const response = await fetch(`https://api.deezer.com/track/${id}`, { signal: AbortSignal.timeout(8000) });
    const preview = response.ok ? (await response.json())?.preview : null;
    if (typeof preview !== 'string' || !/^https:\/\/[^/]+\.dzcdn\.net\//.test(preview)) return new Response(null, { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { Location: preview, 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'public, max-age=300' },
    });
  } catch (cause) {
    console.error('links preview:', cause instanceof Error ? cause.message : cause);
    return new Response(null, { status: 502 });
  }
}

export const config = { path: '/api/links/preview', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
