import { useEffect, useRef, useState } from 'react';
import { authClient } from './account';
import { addUpload, listUploads, type Upload } from './uploads';

/**
 * Choose, add or remove one of your own photos. Adding needs the rights confirmation, and a photo is only
 * ever shown to its owner. `onChoose` receives the photo the shelf should be drawn from (or null for none).
 */
export function OwnPhotos({ chosen, onChoose, disabled }: { chosen: Upload | null; onChoose: (photo: Upload | null) => void; disabled: boolean }) {
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const [photos, setPhotos] = useState<Upload[] | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const chosenId = useRef(chosen?.id);
  chosenId.current = chosen?.id;

  useEffect(() => {
    if (!signedIn) { setPhotos(null); choose.current(null); return; }
    let alive = true;
    // Links expire, so the chosen photo is re-read from a fresh list; with none chosen the newest is used.
    listUploads().then(list => { if (alive) { setPhotos(list); setError(''); choose.current(list.find(photo => photo.id === chosenId.current) ?? list[0] ?? null); } }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [signedIn]);

  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      await addUpload(file);
      const list = await listUploads();
      setPhotos(list);
      choose.current(list[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That photo could not be added.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  if (session.isPending) return null;
  if (!signedIn) return <p className="hint">Sign in (top right) to use your own photo. It stays private to you.</p>;
  return <section className="own-photos" aria-label="Your photos">
    {photos && photos.length > 0 && <ul className="own-photo-list">
      {photos.map(photo => <li key={photo.id}>
        <button type="button" disabled={disabled} aria-pressed={chosen?.id === photo.id} aria-label="Use this photo" onClick={() => onChoose(photo)}>
          <img src={photo.url} alt="" />
        </button>
      </li>)}
    </ul>}
    <div className="trim-actions">
      <label className="rights">
        <input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} />
        <span>I own this photo or have the right to use it, and the people in it are happy for me to.</span>
      </label>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void add(event.target.files?.[0])} />
      <button type="button" className="secondary" disabled={!rights || busy || disabled} onClick={() => input.current?.click()}>{busy ? 'Adding…' : 'Add a photo'}</button>
    </div>
    {photos && photos.length === 0 && <p className="hint">Add a photo to see Dust and Filters made from it.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
