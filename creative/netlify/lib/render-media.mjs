/**
 * What a render is sent of a person's own picture. The worker takes exactly the files a card needs, no more
 * (see `check_media` in audio-intelligence/modal_creatives_encode_staging.py), so a picture (which has a cut-out whenever it is
 * a photo) is cut down to the card's needs here.
 *
 *   photo needs its cut-out   Riso (photo)
 *   photo alone               Our photography and its looks, treatments, Window
 *   clip                      any of those
 *   nothing                   Dust and Pulse, the lyrics alone
 *
 * `picture` is what `uploadMedia` read: `{ photo, cutout }` or `{ motion }`. Returns `{ parts }` (the files to send, by
 * form name) or `{ refused }` with words for the person.
 */
export function ownMedia(style, picture) {
  if (style === 'dust' || style === 'pulise') return { refused: 'This template is made of the lyrics alone.' };
  if (picture.motion) return { parts: { motion: picture.motion } };
  const withCutout = style === 'riso';
  if (withCutout && !picture.cutout) return { refused: 'That picture has no cut-out yet.' };
  return { parts: { photo: picture.photo, ...(withCutout ? { cutout: picture.cutout } : {}) } };
}
