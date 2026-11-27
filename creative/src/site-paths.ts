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
  try { sessionStorage.setItem(ARRIVING, '1'); } catch { /* storage unavailable: the next page fades in whole */ }
  location.assign(path);
}

const ARRIVING = 'mumoo-arriving';
/**
 * Called by each page before it is drawn: after `leaveFor`, only the page's contents fade in, inside the frame already shown.
 * index.html and welcome.html set the same class from their <head>, so the empty frame shows from the first paint.
 */
export function arrive() {
  let arriving = false;
  try {
    arriving = Boolean(sessionStorage.getItem(ARRIVING));
    sessionStorage.removeItem(ARRIVING);
  } catch { /* storage unavailable */ }
  if (!arriving) return;
  const html = document.documentElement;
  html.classList.add('arriving');
  // The dots give way once the page is drawn and its fonts are in, and a moment more for what it fetches first; never longer than SETTLE_CAP_MS.
  const drawn = new Promise<void>(resolve => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount) { resolve(); return; }
    const watch = new MutationObserver(() => { if (root.childElementCount) { watch.disconnect(); resolve(); } });
    watch.observe(root, { childList: true });
  });
  const settled = Promise.all([drawn, document.fonts?.ready]).then(() => new Promise(resolve => setTimeout(resolve, SETTLE_MS)));
  void Promise.race([settled, new Promise(resolve => setTimeout(resolve, SETTLE_CAP_MS))]).then(() => html.classList.add('arrived'));
}
const SETTLE_MS = 350;
const SETTLE_CAP_MS = 3000;

export function fadeOut() {
  document.documentElement.classList.add('leaving');
  // Back to this page from the browser's memory: shown again, not left faded.
  addEventListener('pageshow', event => { if (event.persisted) document.documentElement.classList.remove('leaving'); }, { once: true });
}
