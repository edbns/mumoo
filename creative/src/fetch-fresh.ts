/** How often a picture or clip is asked for again after a passing failure (a 5xx from storage, a 429, a dropped connection). */
const RETRIES = 3;
const RETRY_DELAY_MS = 400;

/**
 * Fetches a picture or clip fresh from the network, never from the browser's cache: a signed link that was once shown in an <img>
 * sits in the cache without CORS headers, and reusing it would fail. Many cloud chunks ask storage for the same clips at once, so
 * a passing failure is asked again; null when the network never answered.
 */
export async function fetchFresh(url: string): Promise<Response | null> {
  let response: Response | null = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2 ** (attempt - 1)));
    response = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (response && (response.ok || (response.status < 500 && response.status !== 429))) return response;
  }
  return response;
}
