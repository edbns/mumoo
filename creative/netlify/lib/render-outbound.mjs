import { libraryMedia, libraryReel } from './library.mjs';
import { ownMedia } from './render-media.mjs';
import { reelFrom, reelIds } from './reel.mjs';
import { uploadMedia, uploadReel } from './uploads.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * What the browser asks for, checked without reading any file: one picture at most (a library one, the person's own upload or a
 * reel), in the style it is kept for. The reason in words when it is not; null when it is fine.
 */
export function refusalOf(meta) {
  const { upload, library, opts } = meta ?? {};
  if (typeof opts !== 'object' || opts === null) return 'Expected the creative’s settings.';
  if (library !== undefined && upload !== undefined) return 'Choose one picture.';
  if (library !== undefined) {
    if (!UUID.test(library)) return 'Invalid picture.';
    // Our photography draws a library picture or video; Riso photos a library photo with its cut-out; Window a photo or a clip.
    if (!['filter', 'riso', 'window', 'treatment'].includes(opts.style)) return 'That picture is kept for a different style.';
  }
  if (upload !== undefined && !UUID.test(upload)) return 'Invalid picture.';
  if (opts.reel !== undefined) {
    if (upload !== undefined || library !== undefined) return 'Choose one picture.';
    const asked = reelIds(opts);
    if (asked.refused) return asked.refused;
  }
  return null;
}

/**
 * The worker's form for one creative of `userId`: the song's audio, the scene, and the picture's files read here from the library or
 * from that person's own storage (a reel goes as fresh links the worker fetches itself), so the browser never sends an image, a video
 * or a link. `{ form }`, or `{ status, error }` when a picture is gone or not ready.
 */
export async function outboundFor(userId, meta, audio) {
  const refused = refusalOf(meta);
  if (refused) return { status: 400, error: refused };
  const { upload, library, ownReel, ...scene } = meta;
  const form = new FormData();
  form.append('audio', audio, 'clip.wav');
  if (library !== undefined) {
    const media = await libraryMedia(library);
    if (!media) return { status: 404, error: 'That picture is no longer in the library.' };
    // Riso library clips are whole-frame (no cut-out); Riso photos still need the mask.
    const cutOut = scene.opts.style === 'riso' && Boolean(media.photo);
    if (cutOut && (!media.photo || !media.cutout)) return { status: 404, error: 'That picture has no cut-out yet.' };
    if (media.photo) form.append('photo', new Blob([media.photo], { type: 'image/jpeg' }), 'photo.jpg');
    if (cutOut) form.append('cutout', new Blob([media.cutout], { type: 'image/png' }), 'cutout.png');
    if (media.motion) form.append('motion', new Blob([media.motion], { type: 'video/mp4' }), 'motion.mp4');
  }
  if (upload !== undefined) {
    const media = await uploadMedia(userId, upload);
    if (!media) return { status: 404, error: 'One of your visuals is still processing or couldn’t be found.' };
    const sent = ownMedia(scene.opts.style, media);
    if (sent.refused) return { status: 400, error: sent.refused };
    if (sent.parts.photo) form.append('photo', new Blob([sent.parts.photo], { type: 'image/jpeg' }), 'photo.jpg');
    if (sent.parts.cutout) form.append('cutout', new Blob([sent.parts.cutout], { type: 'image/png' }), 'cutout.png');
    if (sent.parts.motion) form.append('motion', new Blob([sent.parts.motion], { type: 'video/mp4' }), 'motion.mp4');
  }
  if (scene.opts.reel !== undefined) {
    const { ids } = reelIds(scene.opts);
    // A reel of the person's own pictures: only theirs.
    const found = ownReel === true ? await uploadReel(userId, ids) : await libraryReel(ids);
    if (found.includes(null)) {
      return { status: 404, error: ownReel === true ? 'A custom visual in this video was removed or is still processing.' : 'One of the library clips in this video was retired.' };
    }
    scene.opts = { ...scene.opts, reel: reelFrom(found) };
  }
  form.append('meta', JSON.stringify(scene));
  return { form };
}
