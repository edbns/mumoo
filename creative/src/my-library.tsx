import { useEffect, useState } from 'react';
import { accountFetch } from './account';
import { listUploads, removeUpload, type Upload } from './uploads';

type Creative = { id: string; bytes: number; createdAt: string; url: string };
type Storage = { used: number; quota: number };

const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Everything a person has kept: their finished creatives and their photos, with how much room is left. */
export function MyLibrary({ onClose }: { onClose: () => void }) {
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [photos, setPhotos] = useState<Upload[] | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [renders, uploads, account] = await Promise.all([
        accountFetch('/api/renders').then(response => response.json() as Promise<{ renders: Creative[] }>),
        listUploads(),
        accountFetch('/api/account').then(response => response.json() as Promise<{ storage: Storage }>),
      ]);
      setCreatives(renders.renders); setPhotos(uploads); setStorage(account.storage); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your library is unavailable right now.');
    }
  }
  useEffect(() => { void load(); }, []);

  async function remove(run: () => Promise<unknown>) {
    try { await run(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'That could not be removed.'); }
  }

  return <div className="library-panel" role="dialog" aria-label="My library">
    <div className="library-head">
      <h2>My library</h2>
      <button type="button" className="link-button" onClick={onClose}>Close</button>
    </div>
    {storage && <p className="hint">
      {megabytes(storage.used)} of {megabytes(storage.quota)} used
      <progress max={storage.quota} value={storage.used} aria-label="Storage used" />
    </p>}
    {error && <p role="alert">{error}</p>}
    <h3>Creatives</h3>
    {creatives?.length === 0 && <p className="hint">Creatives you download while signed in are kept here.</p>}
    <ul className="library-list">
      {creatives?.map(item => <li key={item.id}>
        <span>{day(item.createdAt)} · {megabytes(item.bytes)}</span>
        <a href={item.url} download="mumoo-creative.mp4">Download</a>
        <button type="button" className="link-button" onClick={() => void remove(() => accountFetch(`/api/renders?id=${item.id}`, { method: 'DELETE' }))}>Delete</button>
      </li>)}
    </ul>
    <h3>Photos</h3>
    {photos?.length === 0 && <p className="hint">Photos you add for Dust and Filters are kept here, private to you.</p>}
    <ul className="library-photos">
      {photos?.map(photo => <li key={photo.id}>
        <img src={photo.url} alt="" />
        <button type="button" className="link-button" onClick={() => void remove(() => removeUpload(photo.id))}>Delete</button>
      </li>)}
    </ul>
  </div>;
}
