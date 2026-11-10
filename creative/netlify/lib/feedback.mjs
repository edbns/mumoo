import { db } from './person.mjs';

/**
 * What people do with the creatives, for the brain to learn from (see migration 011). Only codes are kept, never lyrics.
 * The body is checked here, not trusted: it comes from a browser.
 */
export const EVENTS = ['play', 'select', 'download', 'refresh'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const word = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const optional = (value, max) => value === undefined || value === null || word(value, max);

/** True when the body is one the brain understands. A refresh is about a row, the others about a card. */
export function validFeedback(v) {
  if (!v || typeof v !== 'object' || v.version !== 1) return false;
  if (!EVENTS.includes(v.event)) return false;
  if (typeof v.clipSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.clipSha256)) return false;
  if (v.language !== null && !(typeof v.language === 'string' && /^[a-z]{2,3}$/.test(v.language))) return false;
  if (v.lyricAttitude !== null && !(typeof v.lyricAttitude === 'string' && /^[a-z]{3,16}$/.test(v.lyricAttitude))) return false;
  if (v.lyricSadness !== null && !(Number.isInteger(v.lyricSadness) && v.lyricSadness >= 0 && v.lyricSadness <= 3)) return false;
  if (v.lyricIntensity !== null && !(Number.isInteger(v.lyricIntensity) && v.lyricIntensity >= 1 && v.lyricIntensity <= 5)) return false;
  if (v.lyricsOrigin !== null && !['transcribed', 'typed'].includes(v.lyricsOrigin)) return false;
  if (typeof v.primaryGenre !== 'string' || !v.primaryGenre.trim() || v.primaryGenre.length > 80) return false;
  if (!optional(v.subGenre, 80)) return false;
  if (v.vibe !== null && typeof v.vibe !== 'string') return false;
  if (typeof v.lane !== 'string' || v.lane.length > 24) return false;
  if (!optional(v.row, 16)) return false;
  if (v.generation !== undefined && !(Number.isInteger(v.generation) && v.generation >= 0 && v.generation < 100_000)) return false;
  if (v.event === 'refresh') return word(v.row, 16);
  const s = v.slot;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || s.id.length > 120) return false;
  if (typeof s.style !== 'string' || s.style.length > 40) return false;
  if (typeof s.font !== 'string' || typeof s.fontSecondary !== 'string') return false;
  if (!optional(s.typeStyle, 40) || !optional(s.effectId, 80)) return false;
  if (s.libraryId !== undefined && s.libraryId !== null && !(typeof s.libraryId === 'string' && UUID.test(s.libraryId))) return false;
  if (v.ownPicture !== undefined && typeof v.ownPicture !== 'boolean') return false;
  return true;
}

/**
 * Keeps one action. `userId` is the signed-in person, or null. A download press is numbered among that person's own
 * (1 is their first). Never throws: learning must not get in the way of what the person is doing.
 */
export async function storeFeedback(v, userId) {
  try {
    const s = v.slot ?? {};
    const sql = db();
    const [{ nth }] = v.event === 'download' && userId
      ? await sql`select count(*)::int + 1 as nth from brain_feedback where user_id = ${userId} and event = 'download'`
      : [{ nth: null }];
    await sql`
      insert into brain_feedback (event, user_id, nth_download, clip_sha256, genre, sub_genre, vibe, lane, language, lyrics_origin,
        attitude, sadness, intensity, row_id, slot_id, style, font, font_secondary, type_style, effect_id, library_id, own_picture, generation)
      values (${v.event}, ${userId}, ${nth},
        ${v.clipSha256}, ${v.primaryGenre.trim()}, ${v.subGenre ?? null}, ${v.vibe}, ${v.lane}, ${v.language}, ${v.lyricsOrigin},
        ${v.lyricAttitude}, ${v.lyricSadness}, ${v.lyricIntensity}, ${v.row ?? null}, ${s.id ?? null}, ${s.style ?? null},
        ${s.font ?? null}, ${s.fontSecondary ?? null}, ${s.typeStyle ?? null}, ${s.effectId ?? null}, ${s.libraryId ?? null},
        ${typeof v.ownPicture === 'boolean' ? v.ownPicture : null}, ${v.generation ?? null})`;
    return true;
  } catch (cause) {
    console.error('feedback not kept:', cause);
    return false;
  }
}
