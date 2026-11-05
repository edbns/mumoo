import { useEffect, useState } from 'react';
import { StagingAccess } from './staging-access';
import { mediaRequest } from './media-admin';

type Asset = { id: string; type: 'image' | 'video'; title: string; previewUrl: string; sourceUrl: string; creator: string; provider: string; sourceCharacter: string; rights: { statement: string; licenseUrl: string }; review: { status: string }; adSafety: { status: string }; retainedMaster: { status: string } };
type PixabayVideo = { id: string; title: string; sourceUrl: string; previewUrl: string | null; renderUrl: string; creator: string };

// Separate staging-only review surface. It does not change the creator flow.
export function CatalogResearch() {
  const [token, setToken] = useState(''); const [items, setItems] = useState<Asset[]>([]); const [query, setQuery] = useState('city');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [next, setNext] = useState<number | null>(null);
  const [pixabay, setPixabay] = useState<PixabayVideo[]>([]);
  async function load(access: string, offset = 0) { const data = await mediaRequest(access, { operation: 'research-list', offset }); setItems(data.assets); setNext(data.nextOffset); }
  useEffect(() => { if (token) void load(token).catch(() => setMessage('Could not load the research catalog.')); }, [token]);
  async function discover() {
    setBusy(true); setMessage('Searching source records…');
    try {
      const data = await mediaRequest(token, { operation: 'research-discover', provider: 'commons', query });
      await load(token); setMessage(`Found ${data.found} candidates; added ${data.added} for review.`);
    } catch { setMessage('The source search did not complete.'); } finally { setBusy(false); }
  }
  async function searchPixabay() {
    setBusy(true); setMessage('Searching Pixabay…'); setPixabay([]);
    try { const data = await mediaRequest(token, { operation: 'pixabay-search', query }); setPixabay(data.candidates); setMessage(`Found ${data.candidates.length} Pixabay video candidates. They require review before use.`); }
    catch { setMessage('Pixabay search is unavailable. Try again later.'); } finally { setBusy(false); }
  }
  async function review(asset: Asset, status: 'SAFE' | 'REVIEW_REQUIRED' | 'BLOCKED') {
    if (status === 'SAFE' && !window.confirm('Have you inspected this asset and confirmed both its reuse rights and its suitability for advertising, including any people, brands and third-party rights?')) return;
    setBusy(true); setMessage('Rechecking the source…');
    try {
      await mediaRequest(token, { operation: 'research-review', id: asset.id, rightsStatus: status === 'BLOCKED' ? 'REJECTED' : 'APPROVED', adSafety: status });
      await load(token); setMessage('Review saved. Source retention is a separate step.');
    } catch { setMessage('Review could not be saved; the source may have changed.'); } finally { setBusy(false); }
  }
  async function retain(asset: Asset) {
    setBusy(true); setMessage('Saving the original source file…');
    try { await mediaRequest(token, { operation: 'research-retain', id: asset.id }); await load(token); setMessage('Original saved for this research asset.'); }
    catch { setMessage('Original not saved. It may be unavailable or exceed the 20 MiB research limit.'); } finally { setBusy(false); }
  }
  return <main className="media-admin-page"><section className="gallery-shell"><p className="eyebrow">INTERNAL · STAGING RESEARCH</p><h1>Catalog research review</h1>
    <p>Find footage for review. This research collection is not yet used to create videos. Check each source and assess reuse rights and advertising safety, including people, brands and other third-party rights.</p>
    {!token ? <StagingAccess onAccess={setToken} /> : <><label>Search<input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label>
      <button disabled={busy || !query.trim()} onClick={() => void discover()}>Find Commons footage</button>
      <button disabled={busy || !query.trim()} onClick={() => void searchPixabay()}>Find Pixabay footage</button>
      {pixabay.length > 0 && <><h2>Pixabay video candidates</h2><p>Source: <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a>. These results are not yet approved or available for automatic videos.</p><div className="gallery-grid">{pixabay.map(item => <article className="gallery-card" key={item.id}><video src={item.renderUrl} poster={item.previewUrl || undefined} controls preload="none" onPlay={event => { const current = event.currentTarget; document.querySelectorAll('video').forEach(video => { if (video !== current) video.pause(); }); }} style={{ width: '100%', height: 180, objectFit: 'contain' }} /><strong>{item.title}</strong><p className="hint">By {item.creator} · Pixabay</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">View on Pixabay</a></article>)}</div></>}
      <p role="status">{message}</p><div className="gallery-grid">{items.filter(item => item.type === 'video').map(item => <article className="gallery-card" key={item.id}>
        {item.type === 'video' ? <video src={item.previewUrl} controls preload="none" onPlay={event => { const current = event.currentTarget; document.querySelectorAll('video').forEach(video => { if (video !== current) video.pause(); }); }} style={{ width: '100%', height: 180, objectFit: 'contain' }} /> : <img src={item.previewUrl} alt="" loading="lazy" style={{ width: '100%', height: 180, objectFit: 'contain' }} />}<strong>{item.title}</strong>
        <p className="hint">{item.provider} · {item.creator || 'Creator not recorded'} · {item.sourceCharacter}</p><p className="hint">{item.rights.statement}</p>
        <p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Inspect source</a> · <a href={item.rights.licenseUrl} target="_blank" rel="noreferrer">Inspect rights</a></p>
        <p className="hint">Rights: {item.review.status} · Ad safety: {item.adSafety.status} · Original: {item.retainedMaster.status}</p>
        <button disabled={busy} onClick={() => void review(item, 'SAFE')}>Approve rights and ad safety</button>
        <button disabled={busy} onClick={() => void review(item, 'REVIEW_REQUIRED')}>Rights approved, safety needs review</button>
        <button disabled={busy} onClick={() => void review(item, 'BLOCKED')}>Reject</button>
        <button disabled={busy || item.review.status !== 'APPROVED' || item.adSafety.status !== 'SAFE'} onClick={() => void retain(item)}>Save original</button>
      </article>)}</div>{next !== null && <button disabled={busy} onClick={() => void load(token, next)}>Next page</button>}
    </>}
  </section></main>;
}
