import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { deleteObject, objectSize, signedDownload, signedUpload } from './storage.mjs';

/**
 * A file sent from a phone to the computer it was asked from (the site does not work on phones, but people keep their
 * music, photos and videos on them). `kind` is what the computer wants: the `song` of the song step, or the creatives'
 * own `picture` (a photo, video or GIF).
 *
 *   computer  asks for a handoff: an id and a phone link (shown as a QR code) that only that id can use, for 15 minutes
 *   phone     opens the link, picks the file (a song) or files (up to ten pictures), sends them straight to private
 *             storage, then marks the handoff done
 *   computer  sees it is done, fetches each file once, deletes them, and goes on as if they had been chosen there
 *
 * The files only pass through: they are at `handoffs/<id>/<n>` until the computer takes them (and a bucket rule removes
 * any left behind after a day). No row, no account, no name is kept. Knowing the id is what lets the computer collect
 * them; the phone's link is signed, so it cannot be made up, pointed at another id or given another kind.
 */
export const HANDOFF_SECONDS = 15 * 60;
export const MAX_HANDOFF_BYTES = 200 * 1024 * 1024;
export const HANDOFF_KINDS = ['song', 'picture'];
/** How many files one handoff carries: the song step takes one song; the creatives take as many pictures as the shelf keeps. */
export const MAX_HANDOFF_FILES = { song: 1, picture: 10 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** What the computer will go on to accept for each kind; it checks the exact limits again itself. */
const TYPES = {
  song: /^(audio|video)\/[\w.+-]+$/,
  picture: /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/,
};

export const handoffKey = (id, n) => `handoffs/${id}/${n}`;
const doneKey = (id) => `handoffs/${id}/done`;
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

/** Can the phone send these files for this kind: one to the most this kind takes, each one acceptable? */
export const acceptableFiles = (kind, files) =>
  Array.isArray(files) && files.length > 0 && files.length <= (MAX_HANDOFF_FILES[kind] ?? 0)
  && files.every(file => acceptableFile(kind, file?.type ?? '', file?.bytes));

/** The links the phone sends its `count` files to, and the one it marks the handoff done with; alive only while the handoff is. */
export async function phoneUploadUrls(id, expiry, count, now = Math.floor(Date.now() / 1000)) {
  const seconds = Math.max(60, expiry - now);
  const putUrls = await Promise.all(Array.from({ length: count }, (_, n) => signedUpload(handoffKey(id, n), seconds)));
  return { putUrls, doneUrl: await signedUpload(doneKey(id), seconds) };
}

/**
 * Null until the phone has marked the handoff done; then each file that is there, with its size and a 15-minute link to fetch it
 * (the computer opens them one after another, so the last of ten large videos starts well after the first).
 */
export async function arrived(id) {
  if ((await objectSize(doneKey(id))) === null) return null;
  const sizes = await Promise.all(Array.from({ length: MAX_HANDOFF_FILES.picture }, (_, n) => objectSize(handoffKey(id, n))));
  const files = [];
  for (const [n, bytes] of sizes.entries()) {
    if (bytes === null) continue;
    if (bytes > MAX_HANDOFF_BYTES) await deleteObject(handoffKey(id, n));
    else files.push({ bytes, url: await signedDownload(handoffKey(id, n), null, 900) });
  }
  return { files };
}

export const removeHandoff = (id) => Promise.all([
  ...Array.from({ length: MAX_HANDOFF_FILES.picture }, (_, n) => deleteObject(handoffKey(id, n))),
  deleteObject(doneKey(id)),
]);
