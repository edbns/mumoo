import type { CreativeProfileV1 } from './creative-profile';
import type { CreativesPackSlot } from './creatives-pack';
import { readSong } from './creatives-pack';

export type PackFeedbackEvent = 'play' | 'select' | 'download';

/** Fire-and-forget learning signal for the brain (taste loop). Client still paints pixels. */
export function reportPackFeedback(
  token: string,
  profile: CreativeProfileV1,
  event: PackFeedbackEvent,
  slot: CreativesPackSlot,
  extras?: { selectedIds?: string[]; generation?: number },
) {
  if (!token) return;
  const { intent, genre, language, mood, lane } = readSong(profile);
  const body = {
    version: 1,
    event,
    clipSha256: profile.clip.sourceSha256,
    primaryGenre: genre,
    vibe: intent?.vibe ?? null,
    lane,
    language: language ?? null,
    lyricTheme: mood.read ? mood.theme : null,
    lyricsOrigin: profile.approvedLyrics?.origin ?? null,
    slot: {
      id: slot.id,
      style: slot.style,
      font: slot.font,
      fontSecondary: slot.fontSecondary,
      palette: slot.palette,
    },
    ...(extras?.selectedIds && { selectedIds: extras.selectedIds.slice(0, 32) }),
    ...(extras?.generation !== undefined && { generation: extras.generation }),
  };
  void fetch('/api/pack-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mumoo-Brain-Access': token,
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
