/** What the voice worker answers, read strictly: a singer we know, an honest "nobody", or nothing we can use. */
import { DOODLE_VOICES, type DoodleVoice } from './doodle-cast';

export type SingerVoiceState = { status: 'pending' } | { status: 'ready'; value: DoodleVoice | null } | { status: 'error' };

/** What the worker sent, or `undefined` when it is not an answer we know. */
export function parseSingerVoice(raw: unknown): { value: DoodleVoice | null } | undefined {
  const body = raw as { version?: unknown; value?: unknown } | null;
  if (!body || body.version !== 1) return undefined;
  if (body.value === null) return { value: null };
  return DOODLE_VOICES.includes(body.value as DoodleVoice) ? { value: body.value as DoodleVoice } : undefined;
}
