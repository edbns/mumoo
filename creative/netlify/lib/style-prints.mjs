import { db } from './person.mjs';

/**
 * Genre learning (see migration 025): the sound print of a selected clip, kept with the style a person gave it.
 * What the browser says about the clip is checked here, not trusted.
 */
export const PRINT_SOURCES = ['creator', 'confirmed', 'corrected', 'seeded'];
export const PRINT_SIZE = 512;
const SHA = /^[a-f0-9]{64}$/;
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;

/** True for a clip and the style given to it: { sourceSha256, offsetMs, style, genre, subGenre, source }. */
export function validLabel(v) {
  if (!v || typeof v !== 'object') return false;
  if (typeof v.sourceSha256 !== 'string' || !SHA.test(v.sourceSha256)) return false;
  if (!Number.isInteger(v.offsetMs) || v.offsetMs < 0 || v.offsetMs > 86_400_000) return false;
  return name(v.style) && name(v.genre) && name(v.subGenre) && PRINT_SOURCES.includes(v.source);
}

/** True for what the sound print worker returns when it heard the clip. */
export function validPrint(v) {
  return v?.version === 1 && v.status === 'ready' && typeof v.model === 'string' && v.model.length <= 120
    && Array.isArray(v.values) && v.values.length === PRINT_SIZE
    && v.values.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1);
}

export async function storePrint(label, print) {
  await db()`
    insert into style_prints (source_sha256, offset_ms, style, genre, sub_genre, source, model, print)
    values (${label.sourceSha256}, ${label.offsetMs}, ${label.style.trim()}, ${label.genre.trim()},
            ${label.subGenre.trim()}, ${label.source}, ${print.model}, ${print.values}::real[])
    on conflict (source_sha256, offset_ms) do update set
      style = excluded.style, genre = excluded.genre, sub_genre = excluded.sub_genre, source = excluded.source,
      model = excluded.model, print = excluded.print, created_at = now()`;
}

export async function countUnknown() {
  await db()`
    insert into style_unknowns (day, count) values (current_date, 1)
    on conflict (day) do update set count = style_unknowns.count + 1`;
}
