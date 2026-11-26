/**
 * Cloudflare Turnstile in the browser: a one-use token proving a person asked, sent with requests that email a stranger
 * (netlify/lib/turnstile.mjs checks it). Nearly everyone passes unseen; when Cloudflare does want a tick, its box appears in the
 * page's `[data-human-check]` spot. Without a site key (the local preview) no token is asked for.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Long enough to tick the box when Cloudflare asks for it. */
const WAIT_MS = 120_000;

export const HUMAN_HEADER = 'x-human-check';

type Turnstile = {
  render(container: HTMLElement, options: {
    sitekey: string; action: string; appearance: 'interaction-only'; theme: 'dark'; 'refresh-expired': 'never';
    callback(token: string): void; 'error-callback'(code: string): boolean; 'timeout-callback'(): void;
  }): string | undefined;
  remove(id: string): void;
};

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolve(turnstile); else reject(new Error('Turnstile missing'));
    };
    script.onerror = () => reject(new Error('Turnstile blocked'));
    document.head.append(script);
  }).catch((cause: unknown) => { loading = null; throw cause; });
  return loading;
}

/** Fetches Cloudflare's script ahead of the first request, so the check adds no wait to it. */
export function warmHumanCheck() {
  if (SITE_KEY) void loadTurnstile().catch(() => undefined);
}

/** Headers carrying a fresh token for `action`, or none without a site key. Fails with the words to show. */
export async function humanHeaders(action: string): Promise<Record<string, string>> {
  if (!SITE_KEY) return {};
  const failed = new Error('Couldn’t check you’re a person. Turn off anything blocking challenges.cloudflare.com, then try again.');
  const turnstile = await loadTurnstile().catch(() => { throw failed; });
  let spot = document.querySelector<HTMLElement>('[data-human-check]');
  let own = false;
  if (!spot) {
    own = true;
    spot = document.createElement('div');
    spot.className = 'fixed bottom-4 left-1/2 z-[1000] -translate-x-1/2';
    document.body.append(spot);
  }
  const box = document.createElement('div');
  spot.append(box);
  let id: string | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(failed), WAIT_MS);
      id = turnstile.render(box, {
        sitekey: SITE_KEY, action, appearance: 'interaction-only', theme: 'dark', 'refresh-expired': 'never',
        callback: (value) => { clearTimeout(timer); resolve(value); },
        'error-callback': () => { clearTimeout(timer); reject(failed); return true; },
        'timeout-callback': () => { clearTimeout(timer); reject(failed); },
      });
    });
    return { [HUMAN_HEADER]: token };
  } finally {
    if (id) turnstile.remove(id);
    box.remove();
    if (own) spot.remove();
  }
}
