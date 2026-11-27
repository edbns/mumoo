/** The addresses of the site's own pages, in plain words, so a person (and a search engine) can tell from a link what it opens. */
export const LEGAL_PATHS = {
  terms: '/terms-of-service',
  privacy: '/privacy-policy',
  cookies: '/cookie-policy',
  acceptableUse: '/acceptable-use-policy',
  refunds: '/refund-policy',
  ai: '/ai-disclosure',
  dpa: '/data-processing-agreement',
} as const;
/** The index of the legal documents. */
export const LEGAL_INDEX = '/legal';
export const PRICING_PATH = '/pricing';
/** Set for this browser session once someone signed out chooses to start: `/` then opens the studio instead of the welcome page (netlify.toml). */
export const START_COOKIE = 'mumoo_start';

/** Fades the page out (app.css) and opens `path`: for signing in or out, where the page in between should not be seen. */
export function leaveFor(path: string) {
  fadeOut();
  location.assign(path);
}

export function fadeOut() {
  document.documentElement.classList.add('leaving');
  // Back to this page from the browser's memory: shown again, not left faded.
  addEventListener('pageshow', event => { if (event.persisted) document.documentElement.classList.remove('leaving'); }, { once: true });
}
