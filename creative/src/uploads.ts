import { accountFetch } from './account';

/** Which row of the shelf a picture is kept for. */
export type PictureUse = 'dust' | 'filter';

/** A person's own pictures, kept privately in their storage. Every call needs them to be signed in. */
export type Upload = {
  id: string;
  kind: 'photo' | 'motion';
  use: PictureUse;
  /** A picture is being prepared on our worker (a photo's cut-out, a video's small clip) until it is ready. */
  status: 'preparing' | 'ready' | 'failed';
  error?: string;
  bytes: number;
  createdAt: string;
  /** Present when ready: the still (a photo, or a video's poster), and the cut-out mask or the clip. */
  url?: string;
  cutoutUrl?: string;
  motionUrl?: string;
};

/** Photos are shrunk to a JPEG of at most `LONG_SIDE` pixels. Videos and GIFs go straight to storage and are prepared there. */
const LONG_SIDE = 2048;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MOTION_LIMITS: Record<string, number> = { 'video/mp4': 150e6, 'video/quicktime': 150e6, 'video/webm': 150e6, 'image/gif': 25e6 };
const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 60;
const RIGHTS = { 'X-Mumoo-Rights': 'confirmed' };

/** What each row accepts and keeps. The server enforces the same limits; this is what the person is told first. */
export const PICTURE_RULES: Record<PictureUse, { limit: number; accepts: string; rules: string[] }> = {
  dust: {
    limit: 1,
    accepts: PHOTO_TYPES.join(','),
    rules: [
      'One photo only: JPEG, PNG or WebP, up to 25 MB.',
      'Best with one clear subject (a person, an object) against any background. It is cut out and turned into dust.',
      'Adding another needs the current one removed first.',
    ],
  },
  filter: {
    limit: 6,
    accepts: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
    rules: [
      'A photo (JPEG, PNG or WebP, up to 25 MB), a video (MP4, MOV or WebM, up to 150 MB and 60 seconds) or a GIF (up to 25 MB).',
      'Videos and GIFs use their first 15 seconds, shown in portrait.',
      'Up to 6 pictures are kept. Remove one to add another.',
    ],
  },
};

export async function listUploads(): Promise<Upload[]> {
  return ((await (await accountFetch('/api/uploads')).json()) as { uploads: Upload[] }).uploads;
}

export async function removeUpload(id: string): Promise<void> {
  await accountFetch(`/api/uploads?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function addPhoto(file: File, use: PictureUse): Promise<void> {
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
  await accountFetch(`/api/uploads?kind=photo&use=${use}`, { method: 'POST', headers: { ...RIGHTS, 'Content-Type': 'image/jpeg' }, body: jpeg });
}

/** How long a video is, when the browser can tell. GIFs and unusual formats are checked by our worker instead. */
function videoSeconds(file: File): Promise<number | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null);
  return new Promise(resolve => {
    const video = document.createElement('video');
    const link = URL.createObjectURL(file);
    const done = (seconds: number | null) => { URL.revokeObjectURL(link); resolve(seconds); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(null);
    video.src = link;
  });
}

function send(url: string, file: File, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => (request.status < 300 ? resolve() : reject(new Error('That file could not be sent. Try again.')));
    request.onerror = () => reject(new Error('That file could not be sent. Check your connection and try again.'));
    request.send(file);
  });
}

async function addMotion(file: File, onProgress: (share: number) => void): Promise<void> {
  const seconds = await videoSeconds(file);
  if (seconds !== null && seconds > MAX_SECONDS) throw new Error(`Videos can be up to ${MAX_SECONDS} seconds long.`);
  const reserved = await accountFetch('/api/uploads?kind=motion', {
    method: 'POST',
    headers: { ...RIGHTS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: file.type, bytes: file.size }),
  }).then(response => response.json() as Promise<{ id: string; putUrl: string }>);
  try {
    await send(reserved.putUrl, file, onProgress);
    await accountFetch(`/api/uploads?id=${reserved.id}`, { method: 'PUT' });
  } catch (cause) {
    await removeUpload(reserved.id).catch(() => undefined);
    throw cause;
  }
}

/** Adds a picture for a row. A Dust photo is then cut out in the cloud, a video or GIF is prepared; `listUploads` shows when it is ready. */
export async function addUpload(file: File, use: PictureUse, onProgress: (share: number) => void = () => undefined): Promise<void> {
  if (PHOTO_TYPES.includes(file.type)) return addPhoto(file, use);
  if (use === 'dust') throw new Error('Dust uses one photo (JPEG, PNG or WebP).');
  const limit = MOTION_LIMITS[file.type];
  if (!limit) throw new Error('Use a JPEG, PNG or WebP photo, an MP4, MOV or WebM video, or a GIF.');
  if (file.size > limit) throw new Error(`That ${file.type === 'image/gif' ? 'GIF' : 'video'} is larger than ${limit / 1e6} MB.`);
  return addMotion(file, onProgress);
}
