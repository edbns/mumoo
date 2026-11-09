import { sessionToken } from './account';

/** A person's own photos, kept privately in their storage. Every call needs them to be signed in. */
export type Upload = { id: string; bytes: number; createdAt: string; url: string };

/** What we ask of a photo before shrinking it; the stored copy is a JPEG of at most `LONG_SIDE` pixels. */
export const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;
const LONG_SIDE = 2048;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

async function call(path: string, init: RequestInit = {}) {
  const token = await sessionToken();
  if (!token) throw new Error('Sign in to use your own photos.');
  const response = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || 'Your photos are unavailable right now. Try again in a moment.');
  }
  return response;
}

export async function listUploads(): Promise<Upload[]> {
  return ((await (await call('/api/uploads')).json()) as { uploads: Upload[] }).uploads;
}

export async function removeUpload(id: string): Promise<void> {
  await call(`/api/uploads?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Shrinks to a JPEG (phones take 12-megapixel photos; nothing here needs more than 2048 px) and stores it. */
export async function addUpload(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Use a JPEG, PNG or WebP photo.');
  if (file.size > MAX_PHOTO_FILE_BYTES) throw new Error('That photo is larger than 25 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('That photo could not be read.'); });
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!jpeg) throw new Error('That photo could not be prepared.');
  const response = await call('/api/uploads', { method: 'POST', headers: { 'X-Mumoo-Rights': 'confirmed', 'Content-Type': 'image/jpeg' }, body: jpeg });
  return ((await response.json()) as { id: string }).id;
}
