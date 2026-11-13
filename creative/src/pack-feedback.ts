import type { CreativeProfileV1 } from './creative-profile';
import type { CreativesPackSlot, ShelfRow } from './creatives-pack';
import { readSong } from './creatives-pack';
import { freshAccess } from './staging-token';

export type PackFeedbackEvent = 'play' | 'select' | 'download' | 'watch';
/** Shorter than this, a preview was a click past the card, not a watch. */
export const LEAST_WATCH_MS = 500;
const MOST_WATCH_MS = 600_000;

/** What the brain learns from, for both kinds of action: the song as the brain understood it. Codes only, never words. */
function songFacts(profile: CreativeProfileV1) {
  const { intent, genre, language, meaning, lane } = readSong(profile);
  return {
    version: 1,
    clipSha256: profile.clip.sourceSha256,
    // The creator did not know the genre.
    primaryGenre: genre || 'unknown',
    subGenre: profile.creator.subGenre?.value ?? null,
    vibe: intent?.vibe ?? null,
    lane,
    language: language ?? null,
    lyricAttitude: meaning?.attitude ?? null,
    lyricSadness: meaning?.sadness ?? null,
    lyricIntensity: meaning?.intensity ?? null,
    lyricsOrigin: profile.noLyrics ? 'none' : profile.approvedLyrics?.origin ?? null,
    ...(meaning?.moods?.length ? { lyricMoods: meaning.moods } : {}),
    ...(meaning?.themes?.length ? { lyricThemes: meaning.themes } : {}),
    drive: intent?.drive ?? null,
    mode: intent?.mode ?? null,
  };
}

/** Sent to the server, against the person when they are signed in (so their first download, the free one, can be told from the rest). */
async function send(token: string, body: unknown) {
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  await fetch('/api/pack-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mumoo-Brain-Access': await freshAccess(token),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

/** Fire-and-forget learning signal for the brain (taste loop): a card was played, put in the cart, or downloaded. */
export function reportPackFeedback(
  token: string,
  profile: CreativeProfileV1,
  event: PackFeedbackEvent,
  slot: CreativesPackSlot,
  extras?: { selectedIds?: string[]; generation?: number; ownPicture?: boolean; watchMs?: number },
) {
  if (!token) return;
  const libraryId = slot.libraryId ?? slot.reelIds?.[0];
  // The whole reel, and the seed the Director cut it with, only when the reel was really drawn (not under the person's own picture).
  const reel = slot.reelIds && !extras?.ownPicture ? { reelIds: slot.reelIds, ...(slot.cutSeed !== undefined ? { cutSeed: slot.cutSeed } : {}) } : {};
  void send(token, {
    ...songFacts(profile),
    event,
    ...(extras?.watchMs !== undefined && { watchMs: extras.watchMs }),
    row: slot.row,
    slot: {
      id: slot.id,
      style: slot.style,
      font: slot.font,
      fontSecondary: slot.fontSecondary,
      ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      // A reel is told by the picture it opens on, the one the Director leads with.
      ...(libraryId ? { libraryId } : {}),
      // Only when the look was really drawn: on a library picture or the person's own, never on a baked effect.
      ...(slot.look && (libraryId || extras?.ownPicture) ? { look: slot.look } : {}),
      ...reel,
      // The mood board its pictures came from, unless the person's own picture took their place.
      ...(slot.board && !extras?.ownPicture ? { board: slot.board } : {}),
    },
    ...(extras?.ownPicture !== undefined && { ownPicture: extras.ownPicture }),
    ...(extras?.selectedIds && { selectedIds: extras.selectedIds.slice(0, 32) }),
    ...(extras?.generation !== undefined && { generation: extras.generation }),
  });
}

/** A card's preview stopped: how long it was watched. */
export function reportWatch(token: string, profile: CreativeProfileV1, slot: CreativesPackSlot, watchedMs: number, extras: { generation: number; ownPicture: boolean }) {
  if (watchedMs < LEAST_WATCH_MS) return;
  reportPackFeedback(token, profile, 'watch', slot, { ...extras, watchMs: Math.min(MOST_WATCH_MS, Math.round(watchedMs)) });
}

/** Downloaded creatives reached the person. The server tells each card as its own download press, so only the song and the cards are sent. */
export function reportDelivered(token: string, clipSha256: string, slotIds: readonly string[]) {
  if (!token || !slotIds.length) return;
  void send(token, { version: 1, event: 'delivered', clipSha256, slotIds: slotIds.slice(0, 20) });
}

/** A row was rolled again: the hand it showed was not what the person wanted. `generation` is the count it moves to. */
export function reportRefresh(token: string, profile: CreativeProfileV1, row: ShelfRow, generation: number) {
  if (!token) return;
  void send(token, { ...songFacts(profile), event: 'refresh', row, generation });
}
