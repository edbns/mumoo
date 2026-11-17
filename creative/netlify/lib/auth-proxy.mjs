/**
 * The browser signs in through our own address (/api/neon-auth/*), and we pass each request on to Neon Auth as it is. Its
 * session cookie then belongs to our site, not to Neon's: browsers that block third-party cookies (Safari, iPhones, private
 * windows) would otherwise drop it the moment the code is accepted, and the person lands back on the sign-in screen.
 */

/** Request headers that describe the hop to us, not the request: the rest go to Neon as sent. */
const HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'keep-alive', 'upgrade', 'forwarded', 'via']);
/** Response headers fetch has already dealt with (the body arrives decoded), or that only made sense cross-site. */
const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie',
  'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-expose-headers']);

export function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const key = name.toLowerCase();
    if (HOP.has(key) || key.startsWith('x-forwarded-') || key.startsWith('x-nf-') || key.startsWith('x-country') || key.startsWith('x-language')) continue;
    headers.set(name, value);
  }
  // Neon checks the Origin of a sign-in against its trusted domains: it is the page's own, our site.
  headers.set('origin', new URL(request.url).origin);
  return headers;
}

/** A cookie Neon set for its own domain, kept for ours instead: the same cookie without a Domain. */
export const ownCookie = cookie => cookie.split(';').filter(part => !/^\s*domain\s*=/i.test(part)).join(';');

/** Where a request to /api/neon-auth/<path>?<query> goes on Neon Auth (`base`, its base URL). Null for anything else. */
export function upstreamUrl(requestUrl, base, prefix = '/api/neon-auth') {
  const url = new URL(requestUrl);
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
  const rest = url.pathname.slice(prefix.length);
  if (rest.split('/').some(part => part === '..')) return null;
  return `${base.replace(/\/$/, '')}${rest}${url.search}`;
}

export async function forwardAuth(request, base, fetcher = fetch) {
  const target = upstreamUrl(request.url, base);
  if (!target) return new Response('Not found.', { status: 404 });
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const answer = await fetcher(target, {
    method: request.method,
    headers: upstreamHeaders(request),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const headers = new Headers();
  for (const [name, value] of answer.headers) if (!DROP.has(name.toLowerCase())) headers.set(name, value);
  for (const cookie of answer.headers.getSetCookie?.() ?? []) headers.append('set-cookie', ownCookie(cookie));
  headers.set('cache-control', 'no-store');
  return new Response(request.method === 'HEAD' || [204, 304].includes(answer.status) ? null : answer.body, { status: answer.status, headers });
}
