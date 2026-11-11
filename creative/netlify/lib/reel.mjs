/**
 * A Director's reel is edited in the cloud from several library pictures. The browser names them (library ids, in the order the card
 * opens on them) and nothing else: the links, the kinds and the shots of the clips are read here, from the library, so no picture,
 * link or shot list ever comes from the page.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const REEL_MIN = 2;
export const REEL_MAX = 8;

/** Our photography (with a live look) and Riso (whole-frame) draw a reel; it replaces every other picture of the card. */
export function reelIds(opts) {
  const reel = opts?.reel;
  if (!Array.isArray(reel) || reel.length < REEL_MIN || reel.length > REEL_MAX) return { refused: 'A reel needs between two and eight pictures.' };
  if (!['filter', 'riso'].includes(opts.style)) return { refused: 'A reel is kept for a different style.' };
  if (['plateId', 'effectId', 'photoUrl', 'cutoutUrl', 'motionUrl'].some((key) => opts[key] !== undefined)) return { refused: 'A reel is the card’s only picture.' };
  const ids = reel.map((entry) => entry?.id);
  if (!ids.every((id) => typeof id === 'string' && UUID.test(id)) || new Set(ids).size !== ids.length) return { refused: 'Invalid picture.' };
  // Depth puts the person in front of each picture, so it is a reel of photos with their cut-outs.
  return { ids, depth: typeof opts.look === 'string' && opts.look.startsWith('depth') };
}

/** The reel as the worker takes it: `[{ kind, url, cutoutUrl?, shots? }]`, from what the library returned for each id. */
export function reelFrom(found) {
  return found.map(({ kind, url, cutoutUrl, shots }) => ({ kind, url, ...(cutoutUrl ? { cutoutUrl } : {}), ...(shots ? { shots } : {}) }));
}
