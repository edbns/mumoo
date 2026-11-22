const RELOAD = 'MUMOO just updated. Reload to continue.';

/** After a new deploy, an already-open tab asks for chunk files that no longer exist. */
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk/i;

export const isStaleChunk = (cause: unknown) => cause instanceof Error && STALE_CHUNK.test(cause.message);

/**
 * Words of the browser, the network or our servers' plumbing, never meant for the public: "Failed to fetch", "Load failed",
 * "NetworkError…", "Unexpected token < in JSON", "HTTP 502", "x is undefined", staging-only refusals and the like.
 */
const SYSTEM_WORDS = /fetch|network|load failed|json|unexpected (token|end)|undefined|null\b|is not (a function|defined|iterable)|cannot read|webgl|shader|gpu|context lost|\bstatus\b|\bhttp|\b[45]\d\d\b|abort|timed? ?out|internal|gateway|cors|origin|staging|invalid request|not configured|method not allowed|quota|exception|stack|<\/?[a-z]/i;

/**
 * What a person may read when something fails: the words our own code wrote for them (an `Error` thrown with copy), or
 * `fallback` when the cause is the browser's or the network's (a `TypeError` from `fetch`, a `SyntaxError` from a bad reply, a
 * `DOMException`) or reads like one.
 */
export function friendlyError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if (STALE_CHUNK.test(message)) return RELOAD;
  // Ours, or a class of ours like `LyricsError`, keep the name "Error"; the browser's are TypeError, SyntaxError, AbortError…
  const ours = cause instanceof Error && cause.name === 'Error';
  return ours && message && !SYSTEM_WORDS.test(message) ? message : fallback;
}

/** For failures of the page's own machinery (drawing, rendering): never the cause's words, only `fallback`, or the reload after a deploy. */
export function quietError(cause: unknown, fallback: string): string {
  return cause instanceof Error && STALE_CHUNK.test(cause.message) ? RELOAD : fallback;
}
