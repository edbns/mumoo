/**
 * What a render is sent of a person's own picture. The worker takes exactly the files a card needs, no more
 * (see `check_media` in audio-intelligence/modal_creatives_encode_staging.py), so a picture kept for the whole shelf
 * (use `any`, which has a cut-out whenever it is a photo) is cut down to the card's needs here.
 *
 *   photo needs its cut-out   Dust, Window, Riso (photo), and Our photography when the look is Depth
 *   photo alone               every other Our photography look
 *   clip                      anything but Dust and Depth, which need a photo
 *
 * `picture` is what `uploadMedia` read: `{ use, photo?, cutout?, motion? }`. Returns `{ parts }` (the files to send, by
 * form name) or `{ refused }` with words for the person.
 */
const OLDER_USES = ['thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'];

export function ownMedia(style, look, picture) {
  const depth = typeof look === 'string' && look.startsWith('depth');
  if (picture.use === 'any') {
    if (picture.motion) {
      if (style === 'dust' || (style === 'filter' && depth)) return { refused: `${style === 'dust' ? 'Dust' : 'Depth'} needs a photo, not a video or GIF.` };
      return { parts: { motion: picture.motion } };
    }
    const withCutout = style === 'dust' || style === 'riso' || style === 'window' || (style === 'filter' && depth);
    if (withCutout && !picture.cutout) return { refused: 'That picture has no cut-out yet.' };
    return { parts: { photo: picture.photo, ...(withCutout ? { cutout: picture.cutout } : {}) } };
  }
  // The older one-picture-per-row uses: kept for the style they are named for (the live-look rows are drawn in the Filters style).
  if (picture.use !== style && !(style === 'filter' && OLDER_USES.includes(picture.use))) return { refused: 'That picture is kept for a different style.' };
  return { parts: { ...(picture.photo ? { photo: picture.photo } : {}), ...(picture.cutout ? { cutout: picture.cutout } : {}), ...(picture.motion ? { motion: picture.motion } : {}) } };
}
