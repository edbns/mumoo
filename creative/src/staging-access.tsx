import { useState } from 'react';
export function StagingAccess({ onAccess }: { onAccess: (token: string) => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/brain-tester-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setPassword(''); const value = await response.json();
      if (!response.ok || typeof value?.token !== 'string') throw new Error('Staging access could not be verified.');
      onAccess(value.token);
    } catch { setPassword(''); setError('Staging access could not be verified.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className="staging-access"><label>Staging tester password<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label><button disabled={!password || busy}>{busy ? 'Checking…' : 'Unlock staging'}</button>{error && <p role="alert">{error}</p>}</form>;
}
