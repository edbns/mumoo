import { db } from './person.mjs';
import { BOARDS } from './boards.mjs';

/**
 * What people do with the creatives, for the brain to learn from (see migration 011). Only codes are kept, never lyrics.
 * The body is checked here, not trusted: it comes from a browser.
 */
export const EVENTS = ['play', 'select', 'download', 'refresh', 'watch', 'delivered'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE = /^[a-z]{2,16}$/;
const SHA = /^[a-f0-9]{64}$/;
const word = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const optional = (value, max) => value === undefined || value === null || word(value, max);
const codes = (value, most) => value === undefined || (Array.isArray(value) && value.length <= most && value.every(code => typeof code === 'string' && CODE.test(code)));
/** The longest watch kept: a preview loops, and a card left playing in a forgotten tab says nothing more after a few minutes. */
export const MOST_WATCH_MS = 600_000;
const MOST_DELIVERED = 20;

/** True when the body is one the brain understands. A refresh is about a row, a delivery about the cards it brought, the others about a card. */
export function validFeedback(v) {
  if (!v || typeof v !== 'object' || v.version !== 1) return false;
  if (!EVENTS.includes(v.event)) return false;
  if (typeof v.clipSha256 !== 'string' || !SHA.test(v.clipSha256)) return false;
  if (v.event === 'delivered') {
    return Array.isArray(v.slotIds) && v.slotIds.length > 0 && v.slotIds.length <= MOST_DELIVERED && v.slotIds.every(id => word(id, 120));
  }
  if (!codes(v.lyricMoods, 2) || !codes(v.lyricThemes, 3)) return false;
  if (v.drive !== undefined && v.drive !== null && !(typeof v.drive === 'number' && v.drive >= 0 && v.drive <= 1)) return false;
  if (v.mode !== undefined && v.mode !== null && !['major', 'minor', 'ambiguous'].includes(v.mode)) return false;
  if (v.language !== null && !(typeof v.language === 'string' && /^[a-z]{2,3}$/.test(v.language))) return false;
  if (v.lyricAttitude !== null && !(typeof v.lyricAttitude === 'string' && /^[a-z]{3,16}$/.test(v.lyricAttitude))) return false;
  if (v.lyricSadness !== null && !(Number.isInteger(v.lyricSadness) && v.lyricSadness >= 0 && v.lyricSadness <= 3)) return false;
  if (v.lyricIntensity !== null && !(Number.isInteger(v.lyricIntensity) && v.lyricIntensity >= 1 && v.lyricIntensity <= 5)) return false;
  if (v.lyricsOrigin !== null && !['transcribed', 'typed', 'none'].includes(v.lyricsOrigin)) return false;
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
  if (!optional(s.typeStyle, 40) || !optional(s.effectId, 80) || !optional(s.look, 40)) return false;
  if (s.libraryId !== undefined && s.libraryId !== null && !(typeof s.libraryId === 'string' && UUID.test(s.libraryId))) return false;
  if (s.reelIds !== undefined && !(Array.isArray(s.reelIds) && s.reelIds.length >= 2 && s.reelIds.length <= 8 && s.reelIds.every(id => typeof id === 'string' && UUID.test(id)))) return false;
  if (s.cutSeed !== undefined && !(Number.isInteger(s.cutSeed) && s.cutSeed >= 0 && s.cutSeed < 1_000_000)) return false;
  if (s.board !== undefined && !BOARDS.includes(s.board)) return false;
  if (v.ownPicture !== undefined && typeof v.ownPicture !== 'boolean') return false;
  if (v.event === 'watch') return Number.isInteger(v.watchMs) && v.watchMs > 0 && v.watchMs <= MOST_WATCH_MS;
  return v.watchMs === undefined;
}

/**
 * Keeps one action. `userId` is the signed-in person, or null. A download press is numbered among that person's own
 * (1 is their first). Never throws: learning must not get in the way of what the person is doing.
 */
export async function storeFeedback(v, userId) {
  try {
    const sql = db();
    if (v.event === 'delivered') {
      // Each delivered card is told as its own latest download press, which already holds the song and the card.
      await sql`
        insert into brain_feedback (event, user_id, clip_sha256, genre, sub_genre, vibe, lane, language, lyrics_origin, attitude, sadness, intensity,
          row_id, slot_id, style, font, font_secondary, type_style, effect_id, library_id, look, own_picture, generation,
          reel_ids, cut_seed, lyric_moods, lyric_themes, drive, mode, board)
        select distinct on (slot_id) 'delivered', ${userId}, clip_sha256, genre, sub_genre, vibe, lane, language, lyrics_origin, attitude, sadness, intensity,
          row_id, slot_id, style, font, font_secondary, type_style, effect_id, library_id, look, own_picture, generation,
          reel_ids, cut_seed, lyric_moods, lyric_themes, drive, mode, board
        from brain_feedback
        where event = 'download' and clip_sha256 = ${v.clipSha256} and slot_id = any(${v.slotIds}::text[]) and created_at > now() - interval '1 day'
        order by slot_id, created_at desc`;
      return true;
    }
    const s = v.slot ?? {};
    const [{ nth }] = v.event === 'download' && userId
      ? await sql`select count(*)::int + 1 as nth from brain_feedback where user_id = ${userId} and event = 'download'`
      : [{ nth: null }];
    await sql`
      insert into brain_feedback (event, user_id, nth_download, clip_sha256, genre, sub_genre, vibe, lane, language, lyrics_origin,
        attitude, sadness, intensity, row_id, slot_id, style, font, font_secondary, type_style, effect_id, library_id, look, own_picture, generation,
        reel_ids, cut_seed, watch_ms, lyric_moods, lyric_themes, drive, mode, board)
      values (${v.event}, ${userId}, ${nth},
        ${v.clipSha256}, ${v.primaryGenre.trim()}, ${v.subGenre ?? null}, ${v.vibe}, ${v.lane}, ${v.language}, ${v.lyricsOrigin},
        ${v.lyricAttitude}, ${v.lyricSadness}, ${v.lyricIntensity}, ${v.row ?? null}, ${s.id ?? null}, ${s.style ?? null},
        ${s.font ?? null}, ${s.fontSecondary ?? null}, ${s.typeStyle ?? null}, ${s.effectId ?? null}, ${s.libraryId ?? null}, ${s.look ?? null},
        ${typeof v.ownPicture === 'boolean' ? v.ownPicture : null}, ${v.generation ?? null},
        ${s.reelIds ?? null}, ${s.cutSeed ?? null}, ${v.watchMs ?? null}, ${v.lyricMoods ?? null}, ${v.lyricThemes ?? null}, ${v.drive ?? null}, ${v.mode ?? null}, ${s.board ?? null})`;
    return true;
  } catch (cause) {
    console.error('feedback not kept:', cause);
    return false;
  }
}
