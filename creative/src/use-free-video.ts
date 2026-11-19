import { useEffect, useState } from 'react';
import { wasSignedIn } from './account-hint';

const KEY = 'mumoo-free-video';

/** The answer the account gave last time in this browser, so the page is drawn right before it answers again. */
function lastAnswer(): boolean | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === '1' ? true : saved === '0' ? false : null;
  } catch { return null; }
}

/**
 * Whether the free first video is still to come: signed out it is (signing up gives it); signed in, until they have made it.
 * Null only while an account never checked in this browser is being checked, so the free video is left out rather than shown and taken away.
 */
export function useFreeVideo(): boolean | null {
  const [free, setFree] = useState<boolean | null>(() => (wasSignedIn() ? lastAnswer() : true));
  useEffect(() => {
    let stopped = false;
    void import('./account')
      .then(async account => {
        if (!(await account.sessionToken().catch(() => null))) return true;
        const { freeVideo } = await account.loadAllowance();
        try { localStorage.setItem(KEY, freeVideo ? '1' : '0'); } catch { /* storage unavailable: it is checked each time */ }
        return freeVideo;
      })
      .then(answer => { if (!stopped) setFree(answer); }, () => { if (!stopped) setFree(current => current ?? false); });
    return () => { stopped = true; };
  }, []);
  return free;
}
