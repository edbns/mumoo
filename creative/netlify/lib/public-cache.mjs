import { purgeCache } from '@netlify/functions';

/**
 * The public library (/api/library) is the same for everyone, so Netlify's CDN keeps one copy of it for a few minutes instead of
 * building it (thousands of signed links, the learning tallies) for every visitor. Its links last `LIBRARY_LINK_SECONDS`, longer than
 * the copy is kept plus the time it may be served stale, so a page never receives links that run out before it renews them.
 */
export const LIBRARY_CACHE_TAG = 'public-library';
export const LIBRARY_CDN_SECONDS = 300;
export const LIBRARY_STALE_SECONDS = 600;
export const LIBRARY_LINK_SECONDS = 3600;

export const libraryCacheHeaders = () => ({
  'Cache-Control': 'private, max-age=30',
  'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${LIBRARY_CDN_SECONDS}, stale-while-revalidate=${LIBRARY_STALE_SECONDS}`,
  'Netlify-Cache-Tag': LIBRARY_CACHE_TAG,
});

/** After the admin changes what is offered (hides, approves, removes, retags): the CDN's copy is dropped, so the change shows at once. */
export async function forgetPublicLibrary() {
  if (!process.env.NETLIFY_PURGE_API_TOKEN) return;
  await purgeCache({ tags: [LIBRARY_CACHE_TAG] }).catch(cause => console.error('library cache purge:', cause));
}
