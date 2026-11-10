import { useEffect } from 'react';

/**
 * Staging open access: fetches a short-lived signed token without a password, in the background, with nothing on screen.
 * If it cannot be had, the things that need it say so themselves when they are used.
 */
export function StagingAccess({ onAccess }: { onAccess: (token: string) => void }) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/brain-tester-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (typeof value?.token === 'string') onAccess(value.token); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [onAccess]);
  return null;
}
