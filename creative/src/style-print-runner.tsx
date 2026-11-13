import { useEffect } from 'react';
import { DURATION_MS } from './composition';
import type { ClipIdentity } from './creative-profile';
import type { Style } from './style-search';
import { encodePcmWav } from './staging-alignment';
import { trace } from './staging-diagnostics';
import { withAccess } from './staging-token';

/** Once per clip and answer in a session: going back and forth between steps sends nothing again. */
const sent = new Set<string>();
const POLL_MS = 3000;
const GIVE_UP_MS = 120_000;
/** The sound print hears 48 kHz (a 16 kHz clip prints as another song); the song is decoded at 44.1 kHz. */
const RATE = 48_000;

/**
 * Genre learning on staging: the creator's answer to "What kind of music is it?" teaches the brain how that style sounds.
 * A picked style sends the selected 15 s to be printed and kept with it; "I don't know" only counts the press.
 */
export function StylePrintRunner({ audio, clip, style, unknown, accessToken }: { audio: AudioBuffer; clip: ClipIdentity; style?: Style; unknown: boolean; accessToken: string }) {
  const { sourceSha256, offsetMs } = clip;
  const name = style?.name;
  useEffect(() => {
    if (!accessToken || (!style && !unknown)) return;
    const key = `${sourceSha256}:${offsetMs}:${style?.name ?? '?'}`;
    if (sent.has(key)) return;
    sent.add(key);
    const controller = new AbortController();
    let finished = false;
    const post = (url: string, type: string, body: BodyInit) => withAccess(accessToken, access => fetch(url, {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': type, 'X-Mumoo-Brain-Access': access }, body,
    }));
    void (async () => {
      try {
        if (!style) {
          finished = (await post('/.netlify/functions/style-print', 'application/json', JSON.stringify({ version: 1, unknown: true }))).ok;
          return;
        }
        const context = new OfflineAudioContext(1, DURATION_MS * RATE / 1000, RATE);
        const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination); source.start(0, offsetMs / 1000);
        const rendered = await context.startRendering();
        const started = await post('/.netlify/functions/style-print', 'audio/wav', encodePcmWav(rendered.getChannelData(0), RATE));
        const job = await started.json().catch(() => null);
        if (started.status !== 202 || typeof job?.id !== 'string') throw new Error('not started');
        const label = { sourceSha256, offsetMs, style: style.name, genre: style.genre, subGenre: style.subGenre, source: 'creator' };
        const body = JSON.stringify({ version: 1, id: job.id, label });
        for (const deadline = Date.now() + GIVE_UP_MS; Date.now() < deadline;) {
          await new Promise(resolve => setTimeout(resolve, POLL_MS));
          if (controller.signal.aborted) return;
          const response = await post('/.netlify/functions/style-print-status', 'application/json', body);
          if (response.status === 202) continue;
          const result = await response.json().catch(() => null);
          finished = response.ok;
          trace('style_print', { category: response.ok ? result?.status : `http_${response.status}` });
          return;
        }
        trace('style_print', { category: 'timeout' });
      } catch {
        if (!controller.signal.aborted) trace('style_print', { category: 'failed' });
      } finally {
        if (!finished) sent.delete(key);
      }
    })();
    return () => controller.abort();
  // A clip and its answer are sent once per mounted runner; the parent keys it by both.
  }, [audio, sourceSha256, offsetMs, name, unknown, accessToken]);
  return null;
}
