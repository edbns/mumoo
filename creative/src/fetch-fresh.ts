/** How often a picture or clip is asked for again after a passing failure (a 5xx from storage, a 429, a dropped connection). */
const RETRIES = 3;
const RETRY_DELAY_MS = 400;
/** A request storage has not started answering by then is dropped and asked again: Safari can leave one hanging for good. */
const ANSWER_TIMEOUT_MS = 15_000;
/** How long a picture (never a clip) may take to arrive once storage answers. */
export const PICTURE_BODY_MS = 30_000;

/**
 * Fetches a picture or clip fresh from the network, never from the browser's cache: a signed link that was once shown in an <img>
 * sits in the cache without CORS headers, and reusing it would fail. Many cloud chunks ask storage for the same clips at once, so
 * a passing failure is asked again; null when the network never answered.
 */
export async function fetchFresh(url: string): Promise<Response | null> {
  let response: Response | null = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2 ** (attempt - 1)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANSWER_TIMEOUT_MS);
    response = await fetch(url, { cache: 'no-store', signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    if (response && (response.ok || (response.status < 500 && response.status !== 429))) return response;
  }
  return response;
}

/** A file's body, given up on (rejected) when it has not all arrived in `ms`: a stalled download never holds up what waits for it. */
export function bodyWithin(response: Response, ms: number): Promise<Blob> {
  let timer = 0;
  return Promise.race([
    response.blob(),
    new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('A picture took too long to arrive.')), ms); }),
  ]).finally(() => clearTimeout(timer));
}
