/**
 * Our own worker that makes a video or GIF a small clip with a poster (see audio-intelligence/modal_prepare_media_staging.py).
 * It reads the source through a link and writes its files straight to the links it is given.
 */
const PREPARE = 'https://edbns-mumoo-staging--mumoo-prepare-media-staging';
const bridge = () => ({ Authorization: `Bearer ${process.env.MUMOO_MUSIC_BRIDGE_SECRET}` });

/** Starts preparing a video or GIF. Returns the worker's job id. */
export async function startPrepare(source, puts) {
  const response = await fetch(`${PREPARE}-submit.us-east.modal.run`, {
    method: 'POST',
    headers: { ...bridge(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'motion', source, puts }),
    redirect: 'error',
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== 'string') throw new Error('Preparing could not start.');
  return result.id;
}

/** How a job is getting on: `{ working: true }`, `{ failed: 'why, in words' }` or `{ done: result }`. */
export async function askPrepare(job) {
  const response = await fetch(`${PREPARE}-status.us-east.modal.run?id=${encodeURIComponent(job)}`, {
    headers: bridge(),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response || response.status === 202 || (response.status >= 500 && response.status !== 502)) return { working: true };
  const result = response.ok ? await response.json().catch(() => null) : null;
  if (!result) return { failed: response.status === 410 ? 'That took too long to prepare. Send it again.' : 'We could not prepare that file. Try another.' };
  if (!result.ok) return { failed: typeof result.error === 'string' ? result.error : 'We could not prepare that file. Try another.' };
  return { done: result };
}
