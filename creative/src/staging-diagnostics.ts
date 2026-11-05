// Volatile local diagnostics only: never store audio, lyrics, filenames or credentials.
type Event = { at: string; stage: string; durationMs?: number; status?: number; category?: string };
const events: Event[] = [];
export function trace(stage: string, info: Omit<Event, 'stage' | 'at'> = {}) {
  events.push({ at: new Date().toISOString(), stage, ...info });
  if (events.length > 100) events.shift();
}
export function traces() { return [...events]; }
