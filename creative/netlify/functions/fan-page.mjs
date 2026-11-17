import { cacheTag, fanPage, missingPage, POLICY } from '../lib/fan-page.mjs';
import { db } from '../lib/person.mjs';
import { slugProblem } from '../lib/smart-links.mjs';

function page(status, html, slug, cdnSeconds) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Browsers check back every time; Netlify's CDN keeps the page until the link changes (which empties it) or an hour passes.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=86400`,
      'Netlify-Cache-Tag': cacheTag(slug),
    },
  });
}

/** GET /l/<slug> — the fan page of a published smart link (`fan-page.mjs`). */
export default async function handler(request, context) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET.', { status: 405 });
  const url = new URL(request.url);
  const slug = context?.params?.slug ?? url.pathname.split('/')[2] ?? '';
  const home = url.origin;
  if (slugProblem(slug) || !process.env.DATABASE_URL) return page(404, missingPage(home), slug, 60);
  try {
    const [row] = await db()`select link from smart_links where slug = ${slug}`;
    return row ? page(200, fanPage(row.link, `${home}/l/${slug}`, home, { countAs: slug }), slug, 3600) : page(404, missingPage(home), slug, 60);
  } catch (cause) {
    console.error('fan page:', cause);
    return new Response('This page is unavailable right now. Try again in a moment.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
}

export const config = { path: '/l/:slug' };
