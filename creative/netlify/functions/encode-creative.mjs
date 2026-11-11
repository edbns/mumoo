import { validAccess } from '../lib/access.mjs';
import { personFrom } from '../lib/person.mjs';
import { libraryMedia } from '../lib/library.mjs';
import { uploadMedia } from '../lib/uploads.mjs';

/**
 * Submit a cloud render job. Tiny request (≈960 KB WAV + JSON); returns a job id at once.
 * A person's own picture (`upload` in the meta) is read here from that signed-in person's storage and handed on,
 * so the browser never sends an image, a video or a link.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_SUBMIT =
  'https://edbns-mumoo-staging--mumoo-creatives-encode-staging-submit.us-east.modal.run';
const BODY_LIMIT = 2_000_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function encodeCreative(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Cloud render is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) {
    return error(403, 'Open MUMOO Staging to render a creative.');
  }
  const stagingAccess = request.headers.get('x-mumoo-brain-access') ?? '';
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (!validAccess(stagingAccess, process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if (bridgeSecret.length < 32) return error(503, 'Cloud render is not configured.');

  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > BODY_LIMIT) return error(413, 'Render request is too large.');

    const incoming = await request.formData();
    const audio = incoming.get('audio');
    const meta = incoming.get('meta');
    if (!(audio instanceof Blob) || typeof meta !== 'string' || meta.length > 400_000) {
      return error(400, 'Expected audio and meta form fields.');
    }
    if (audio.size < 1000) return error(400, 'Audio file is too small.');

    const { upload, library, ...scene } = JSON.parse(meta);
    const outbound = new FormData();
    outbound.append('audio', audio, 'clip.wav');
    if (library !== undefined) {
      // An approved library picture is for everyone, so no sign-in is needed; it is Our photography's picture, like a person's own.
      if (upload !== undefined) return error(400, 'Choose one picture.');
      if (!UUID.test(library)) return error(400, 'Invalid picture.');
      const style = scene.opts?.style;
      // Our photography draws a library picture or video; Dust (and Riso photos) a library photo with its cut-out; Window either a photo with its cut-out or a clip.
      if (!['filter', 'riso', 'dust', 'window'].includes(style)) return error(400, 'That picture is kept for a different style.');
      const media = await libraryMedia(library);
      if (!media) return error(404, 'That picture is no longer in the library.');
      const depthLook = typeof scene.opts?.look === 'string' && String(scene.opts.look).startsWith('depth');
      const cutOut = style === 'riso' || style === 'dust' || (style === 'window' && Boolean(media.photo)) || (style === 'filter' && depthLook);
      if (cutOut && (!media.photo || !media.cutout)) return error(404, 'That picture has no cut-out yet.');
      if (media.photo) outbound.append('photo', new Blob([media.photo], { type: 'image/jpeg' }), 'photo.jpg');
      if (cutOut) outbound.append('cutout', new Blob([media.cutout], { type: 'image/png' }), 'cutout.png');
      if (media.motion) outbound.append('motion', new Blob([media.motion], { type: 'video/mp4' }), 'motion.mp4');
    }
    if (upload !== undefined) {
      if (!UUID.test(upload)) return error(400, 'Invalid picture.');
      const person = await personFrom(request);
      if (!person) return error(401, 'Sign in to use your own pictures.');
      const media = await uploadMedia(person.id, upload);
      if (!media) return error(404, 'That picture was not found, or is still being prepared.');
      // A picture kept for Filters cannot be sent to Dust, and the other way round. Live-look rows are drawn in the Filters style, on a picture kept under their own name.
      const style = scene.opts?.style;
      if (media.use !== style && !(style === 'filter' && ['thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'].includes(media.use))) return error(400, 'That picture is kept for a different style.');
      if (media.photo) outbound.append('photo', new Blob([media.photo], { type: 'image/jpeg' }), 'photo.jpg');
      if (media.cutout) outbound.append('cutout', new Blob([media.cutout], { type: 'image/png' }), 'cutout.png');
      if (media.motion) outbound.append('motion', new Blob([media.motion], { type: 'video/mp4' }), 'motion.mp4');
    }
    outbound.append('meta', JSON.stringify(scene));

    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST',
      body: outbound,
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') {
      return Response.json({ id: result.id }, { status: 202, headers });
    }
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 413, 429].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Cloud render could not start.');
    }
    return error(502, 'The cloud render worker could not accept this creative.');
  } catch {
    return error(504, 'The cloud render worker did not respond in time.');
  }
}
