import { useEffect } from 'react';
import { DURATION_MS } from './composition';
import { encodePcmWav } from './staging-alignment';
import type { ClipIdentity, MusicAnalysisState } from './creative-profile';

// The staging gateway verifies the short-lived tester token; the worker
// receives a separate server-only credential.
export function MusicAnalysisRunner({ audio, clip, analysis, accessToken, onChange }: { audio: AudioBuffer; clip: ClipIdentity; accessToken: string; analysis: MusicAnalysisState; onChange: (state: MusicAnalysisState) => void }) {
  const { sourceSha256, offsetMs, durationMs } = clip;
  useEffect(() => {
    if (analysis.status === 'ready') return;
    if (!accessToken) return;
    const controller = new AbortController();
    const identity: ClipIdentity = { sourceSha256, offsetMs, durationMs };
    onChange({ status: 'pending', clip: identity });
    void (async () => {
      try {
        const rate = 16_000;
        const context = new OfflineAudioContext(1, DURATION_MS * rate / 1000, rate);
        const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination); source.start(0, offsetMs / 1000);
        const rendered = await context.startRendering();
        const body = encodePcmWav(rendered.getChannelData(0), rate);
        const digest = await crypto.subtle.digest('SHA-256', body);
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        const response = await fetch('/.netlify/functions/analyze-music', { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'audio/wav', 'X-Mumoo-Brain-Access': accessToken }, body });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.version !== 1 || data.method !== 'beat_this_librosa' || data.clip?.durationMs !== DURATION_MS || data.clip?.offsetMs !== 0 || data.clip?.sha256 !== hash || !Array.isArray(data.rhythm?.beatsMs) || !Array.isArray(data.rhythm?.downbeatsMs) || !data.rhythm?.tempo || !Array.isArray(data.rhythm.tempo.alternativesBpm) || !Array.isArray(data.features?.transientsMs) || !Array.isArray(data.features?.frames) || !data.features.frames.length || !data.provenance || !data.metrics) throw new Error('Music analysis is unavailable.');
        if (!controller.signal.aborted) onChange({ status: 'ready', clip: identity, result: data });
      } catch { if (!controller.signal.aborted) onChange({ status: 'error', clip: identity, message: 'Music analysis is unavailable.' }); }
    })();
    return () => controller.abort();
  // A clip is analyzed once per mounted runner; the parent keys it by clip identity.
  }, [audio, sourceSha256, offsetMs, durationMs, accessToken]);
  return null;
}
