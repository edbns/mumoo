import { useEffect, useState } from 'react';

/** Staging open access — mints a short-lived signed token without a password. */
export function StagingAccess({ onAccess }: { onAccess: (token: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setBusy(true); setError('');
      try {
        const response = await fetch('/api/brain-tester-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        });
        const value = await response.json();
        if (!response.ok || typeof value?.token !== 'string') throw new Error('Staging access could not be verified.');
        onAccess(value.token);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Staging access could not be verified.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [onAccess, attempt]);

  if (busy) return <p className="hint" role="status">Preparing staging access…</p>;
  if (error) {
    return <div className="staging-access">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button>
    </div>;
  }
  return null;
}
