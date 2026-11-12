import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { deleteObject, objectSize, signedDownload, signedUpload } from './storage.mjs';

/**
 * A file sent from a phone to the computer it was asked from (the site does not work on phones, but people keep their
 * music, photos and videos on them). `kind` is what the computer wants: the `song` of the song step, or the creatives'
 * own `picture` (a photo, video or GIF).
 *
 *   computer  asks for a handoff: an id and a phone link (shown as a QR code) that only that id can use, for 15 minutes
 *   phone     opens the link, picks the file, sends it straight to private storage
 *   computer  sees it arrived, fetches it once, deletes it, and goes on as if the file had been chosen there
 *
 * The file only passes through: it is at `handoffs/<id>` until the computer takes it (and a bucket rule removes any
 * left behind after a day). No row, no account, no name is kept. Knowing the id is what lets the computer collect it;
 * the phone's link is signed, so it cannot be made up, pointed at another id or given another kind.
 */
export const HANDOFF_SECONDS = 15 * 60;
export const MAX_HANDOFF_BYTES = 200 * 1024 * 1024;
export const HANDOFF_KINDS = ['song', 'picture'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** What the computer will go on to accept for each kind; it checks the exact limits again itself. */
const TYPES = {
  song: /^(audio|video)\/[\w.+-]+$/,
  picture: /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/,
};

export const handoffKey = (id) => `handoffs/${id}`;
export const validHandoffId = (id) => typeof id === 'string' && UUID.test(id);

const sign = (key, id, expiry, kind) => createHmac('sha256', key).update(`mumoo-handoff:${id}:${expiry}:${kind}`).digest();

/** A new handoff: its id and the token the phone's link carries. */
export function newHandoff(key, kind = 'song', now = Math.floor(Date.now() / 1000)) {
  const id = randomUUID();
  const expiry = now + HANDOFF_SECONDS;
  return { id, expiry, token: `${id}.${expiry}.${kind}.${sign(key, id, expiry, kind).toString('hex')}` };
}

/** The handoff a phone token is good for, or null when it is forged, malformed or past its 15 minutes. */
export function handoffFromToken(token, key, now = Math.floor(Date.now() / 1000)) {
  if (typeof key !== 'string' || key.length < 32 || typeof token !== 'string') return null;
  const [id, expiry, kind, signature] = token.split('.');
  if (!validHandoffId(id) || !/^\d{10}$/.test(expiry ?? '') || !HANDOFF_KINDS.includes(kind) || !/^[a-f0-9]{64}$/.test(signature ?? '')) return null;
  if (Number(expiry) <= now || Number(expiry) > now + HANDOFF_SECONDS) return null;
  const supplied = Buffer.from(signature, 'hex');
  const expected = sign(key, id, expiry, kind);
  return supplied.length === expected.length && timingSafeEqual(expected, supplied) ? { id, expiry: Number(expiry), kind } : null;
}

/** Is the phone's file something the computer can use for this kind, and not too large? A song may come without a type (its bytes are checked); a picture may not. */
export const acceptableFile = (kind, type, bytes) =>
  Number.isInteger(bytes) && bytes > 0 && bytes <= MAX_HANDOFF_BYTES && typeof type === 'string'
  && ((kind === 'song' && type === '') || Boolean(TYPES[kind]?.test(type)));

/** The link the phone sends its file to, alive only while the handoff is. */
export async function phoneUploadUrl(id, expiry, now = Math.floor(Date.now() / 1000)) {
  return signedUpload(handoffKey(id), Math.max(60, expiry - now));
}

/** Null until the phone's file is there; then its size and a five-minute link to fetch it. */
export async function arrived(id) {
  const bytes = await objectSize(handoffKey(id));
  if (bytes === null) return null;
  if (bytes > MAX_HANDOFF_BYTES) {
    await deleteObject(handoffKey(id));
    return null;
  }
  return { bytes, url: await signedDownload(handoffKey(id), null, 300) };
}

export const removeHandoff = (id) => deleteObject(handoffKey(id));
