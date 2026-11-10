import type { CreativeProfileV1 } from './creative-profile';
import type { CreativesPackSlot, ShelfRow } from './creatives-pack';
import { readSong } from './creatives-pack';

export type PackFeedbackEvent = 'play' | 'select' | 'download';

/** What the brain learns from, for both kinds of action: the song as the brain understood it. Codes only, never words. */
function songFacts(profile: CreativeProfileV1) {
  const { intent, genre, language, meaning, lane } = readSong(profile);
  return {
    version: 1,
    clipSha256: profile.clip.sourceSha256,
    primaryGenre: genre,
    subGenre: profile.creator.subGenre?.value ?? null,
    vibe: intent?.vibe ?? null,
    lane,
    language: language ?? null,
    lyricAttitude: meaning?.attitude ?? null,
    lyricSadness: meaning?.sadness ?? null,
    lyricIntensity: meaning?.intensity ?? null,
    lyricsOrigin: profile.approvedLyrics?.origin ?? null,
  };
}

/** Sent to the server, against the person when they are signed in (so their first download, the free one, can be told from the rest). */
async function send(token: string, body: unknown) {
  const bearer = await import('./account').then(account => account.sessionToken()).catch(() => null);
  await fetch('/api/pack-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mumoo-Brain-Access': token,
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
  extras?: { selectedIds?: string[]; generation?: number; ownPicture?: boolean },
) {
  if (!token) return;
  void send(token, {
    ...songFacts(profile),
    event,
    row: slot.row,
    slot: {
      id: slot.id,
      style: slot.style,
      font: slot.font,
      fontSecondary: slot.fontSecondary,
      ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      ...(slot.libraryId ? { libraryId: slot.libraryId } : {}),
      // Only when the look was really drawn: on a library picture or the person's own, never on a baked effect.
      ...(slot.look && (slot.libraryId || extras?.ownPicture) ? { look: slot.look } : {}),
    },
    ...(extras?.ownPicture !== undefined && { ownPicture: extras.ownPicture }),
    ...(extras?.selectedIds && { selectedIds: extras.selectedIds.slice(0, 32) }),
    ...(extras?.generation !== undefined && { generation: extras.generation }),
  });
}

/** A row was rolled again: the hand it showed was not what the person wanted. `generation` is the count it moves to. */
export function reportRefresh(token: string, profile: CreativeProfileV1, row: ShelfRow, generation: number) {
  if (!token) return;
  void send(token, { ...songFacts(profile), event: 'refresh', row, generation });
}
