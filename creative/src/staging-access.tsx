import { useEffect } from 'react';
import { freshAccess } from './staging-token';

/**
 * Staging open access: fetches a short-lived signed token without a password, in the background, with nothing on screen.
 * If it cannot be had, the things that need it say so themselves when they are used.
 */
export function StagingAccess({ onAccess }: { onAccess: (token: string) => void }) {
  useEffect(() => {
    let alive = true;
    void freshAccess().then(token => { if (alive && token) onAccess(token); });
    return () => { alive = false; };
  }, [onAccess]);
  return null;
}
