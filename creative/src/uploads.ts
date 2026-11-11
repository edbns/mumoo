import { accountFetch } from './account';
import { shrinkPhoto } from './photo-shrink';

/** Which row of the shelf a picture is kept for. */
export type PictureUse = 'dust' | 'filter' | 'riso' | 'window' | 'thermal' | 'halftone' | 'dither';

/** Dust and Riso are made only of a person cut out of a photo, so they take photos and nothing else. (A Window photo is cut out too, but a Window also takes a video or GIF.) */
export const photoOnly = (use: PictureUse) => use === 'dust' || use === 'riso';

/**
 * A person's own picture, kept privately in their storage (each row keeps one; a new one replaces it).
 * Every call needs them to be signed in.
 */
export type Upload = {
  id: string;
  kind: 'photo' | 'motion';
  use: PictureUse;
  /**
   * A picture is being prepared on our worker (a photo's cut-out, a video's small clip) until it is ready.
   * `failed` is only ever reported once, with the reason, in the answer that found out; it is not kept.
   */
  status: 'preparing' | 'ready' | 'failed';
  error?: string;
  bytes: number;
  createdAt: string;
  /** Present when ready: the still (a photo, or a video's poster), and the cut-out mask or the clip. */
  url?: string;
  cutoutUrl?: string;
  motionUrl?: string;
  /** A video or GIF's shots, as [start, end] in ms of the video. */
  shots?: [number, number][];
};

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MOTION_LIMITS: Record<string, number> = { 'video/mp4': 150e6, 'video/quicktime': 150e6, 'video/webm': 150e6, 'image/gif': 25e6 };
const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 60;

/** What each row's file picker offers. The server enforces the same limits. */
export const ACCEPT: Record<PictureUse, string> = {
  dust: PHOTO_TYPES.join(','),
  riso: PHOTO_TYPES.join(','),
  filter: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
  window: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
  thermal: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
  halftone: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
  dither: [...PHOTO_TYPES, ...Object.keys(MOTION_LIMITS)].join(','),
};

/** Answers of the uploads API: the person's pictures as they now are. */
async function pictures(response: Response): Promise<Upload[]> {
  return ((await response.json()) as { uploads: Upload[] }).uploads;
}

export async function listUploads(): Promise<Upload[]> {
  return pictures(await accountFetch('/api/uploads'));
}

/** A new run starts clean: every picture goes except those in `keep` (the ones a cart still draws from). Resolves with what is left. */
export async function clearUploads(keep: readonly string[]): Promise<Upload[]> {
  return pictures(await accountFetch(`/api/uploads?except=${keep.map(encodeURIComponent).join(',')}`, { method: 'DELETE' }));
}

export async function removeUpload(id: string): Promise<Upload[]> {
  return pictures(await accountFetch(`/api/uploads?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
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

async function addMotion(file: File, use: PictureUse, onProgress: (share: number) => void): Promise<Upload[]> {
  const seconds = await videoSeconds(file);
  if (seconds !== null && seconds > MAX_SECONDS) throw new Error(`Videos can be up to ${MAX_SECONDS} seconds long.`);
  const reserved = await accountFetch('/api/uploads?kind=motion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ use, type: file.type, bytes: file.size }),
  }).then(response => response.json() as Promise<{ id: string; putUrl: string }>);
  try {
    await send(reserved.putUrl, file, onProgress);
    return await pictures(await accountFetch(`/api/uploads?id=${reserved.id}`, { method: 'PUT' }));
  } catch (cause) {
    await removeUpload(reserved.id).catch(() => undefined);
    throw cause;
  }
}

/**
 * Adds a picture for a row, replacing the one it has. A photo is shrunk and sent in one request; a Filter photo
 * is ready as soon as it is stored. A Dust, Riso or Window photo is cut out, and a video or GIF prepared, in the cloud: the
 * answer lists it as `preparing` until `listUploads` says it is ready. Resolves with the person's pictures.
 */
export async function addUpload(file: File, use: PictureUse, onProgress: (share: number) => void = () => undefined): Promise<Upload[]> {
  if (PHOTO_TYPES.includes(file.type)) {
    if (file.size > MAX_PHOTO_FILE_BYTES) throw new Error('That photo is larger than 25 MB.');
    const photo = await shrinkPhoto(file);
    return pictures(await accountFetch(`/api/uploads?kind=photo&use=${use}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: photo }));
  }
  if (photoOnly(use)) throw new Error(`${use === 'dust' ? 'Dust' : 'Riso'} uses a photo (JPEG, PNG or WebP).`);
  const limit = MOTION_LIMITS[file.type];
  if (!limit) throw new Error('Use a JPEG, PNG or WebP photo, an MP4, MOV or WebM video, or a GIF.');
  if (file.size > limit) throw new Error(`That ${file.type === 'image/gif' ? 'GIF' : 'video'} is larger than ${limit / 1e6} MB.`);
  return addMotion(file, use, onProgress);
}
