import { useEffect, useState } from 'react';
import { StagingAccess } from './staging-access';

type Candidate = { id: string; title: string; description: string; creator: string; sourceProvider: string; sourceUrl: string; previewUrl: string; rightsStatement: string; licenseUrl: string; status: string; verificationTimestamp: string | null; commercialUseEligible: boolean; tags: string[] };
export async function mediaRequest(token: string, body: object) {
  const response = await fetch('/api/media-catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Media service is unavailable.');
  return data;
}
export function MediaAdmin() {
  const [token, setToken] = useState(''); const [items, setItems] = useState<Candidate[]>([]); const [query, setQuery] = useState('landscape');
  const [checked, setChecked] = useState<string[]>([]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function refresh(access: string) { const data = await mediaRequest(access, { operation: 'list' }); setItems(data.assets); }
  useEffect(() => { if (token) void refresh(token).catch(() => setMessage('The catalog could not be loaded.')); }, [token]);
  async function discover() { setBusy(true); setMessage('Searching The Met…'); try { const data = await mediaRequest(token, { operation: 'discover', query }); await refresh(token); setMessage(`Found ${data.discovered} eligible candidates; ${data.added} added as pending.`); } catch { setMessage('The museum search failed. Try again.'); } finally { setBusy(false); } }
  async function review(status: 'approved' | 'rejected') { setBusy(true); setMessage('Verifying source records…'); try { await mediaRequest(token, { operation: 'review-many', ids: checked, status }); await refresh(token); setMessage(`${checked.length} assets marked ${status}.`); setChecked([]); } catch { setMessage('Review could not be saved; verify each source and try again.'); } finally { setBusy(false); } }
  return <main className="desktop gallery-page"><section className="gallery-shell"><p className="eyebrow">INTERNAL · STAGING</p><h1>Media review</h1><p>Only explicitly approved records can be recommended. Recheck each image and its rights before approval.</p>
    {!token ? <StagingAccess onAccess={setToken} /> : <><label>Search The Met<input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label><button onClick={() => void discover()} disabled={busy || !query.trim()}>Find candidates</button>
    <div className="trim-actions"><button disabled={busy || !checked.length || checked.length > 25} onClick={() => void review('approved')}>Approve selected ({checked.length})</button><button disabled={busy || !checked.length || checked.length > 25} onClick={() => void review('rejected')}>Reject selected</button></div>
    <p role="status">{message}</p><div className="gallery-grid">{items.map(item => <article className="gallery-card" key={item.id}><img src={item.previewUrl} alt="" loading="lazy" style={{ width: '100%', height: 180, objectFit: 'contain' }} /><strong>{item.title}</strong><p className="hint">{item.id} · {item.creator || 'Creator not recorded'} · {item.status}</p><p className="hint">{item.rightsStatement}</p><p className="hint"><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source record</a> · <a href={item.licenseUrl} target="_blank" rel="noreferrer">Rights policy</a></p><label><input type="checkbox" checked={checked.includes(item.id)} onChange={() => setChecked(list => list.includes(item.id) ? list.filter(id => id !== item.id) : [...list, item.id])} /> Select for review</label></article>)}</div></>}
  </section></main>;
}
