import { useEffect, useRef, useState } from 'react';
import { DURATION_MS } from './composition';
import { encodePcmWav } from './staging-alignment';
import { analysisForClip, type ClipIdentity, type MusicAnalysisState } from './creative-profile';

function savedCode() {
  try { return sessionStorage.getItem('mumoo-music-access') ?? ''; } catch { return ''; }
}

export function MusicDiagnostics({ audio, clip, analysis, onChange }: {
  audio: AudioBuffer;
  clip: ClipIdentity;
  analysis: MusicAnalysisState;
  onChange: (state: MusicAnalysisState) => void;
}) {
  const [access, setAccess] = useState(savedCode);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const current = analysisForClip(analysis, clip);
  const result = current.status === 'ready' ? current.result : undefined;
  const error = current.status === 'error' ? current.message : '';
  const pending = current.status === 'pending';

  async function analyze() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    onChange({ status: 'pending', clip });
    try {
      const rate = 16_000;
      const context = new OfflineAudioContext(1, DURATION_MS * rate / 1000, rate);
      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(context.destination);
      source.start(0, clip.offsetMs / 1000);
      const rendered = await context.startRendering();
      const body = encodePcmWav(rendered.getChannelData(0), rate);
      const digest = await crypto.subtle.digest('SHA-256', body);
      const expectedHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const response = await fetch('/.netlify/functions/analyze-music', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'audio/wav', 'X-Mumoo-Analysis-Access': access.trim() },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `Analysis failed (HTTP ${response.status}).`);
      if (data?.version !== 1 || data.method !== 'beat_this_librosa' || data.clip?.durationMs !== DURATION_MS ||
          data.clip?.offsetMs !== 0 || data.clip?.sha256 !== expectedHash ||
          !Array.isArray(data.rhythm?.beatsMs) || !Array.isArray(data.rhythm?.downbeatsMs) ||
          !data.rhythm?.tempo || !Array.isArray(data.rhythm.tempo.alternativesBpm) ||
          !Array.isArray(data.features?.transientsMs) || !Array.isArray(data.features?.frames) || !data.features.frames.length ||
          !data.provenance || !data.metrics) {
        throw new Error('The music worker returned an unexpected result.');
      }
      try { sessionStorage.setItem('mumoo-music-access', access.trim()); } catch { /* Storage is optional. */ }
      onChange({ status: 'ready', clip, result: data });
    } catch (cause) {
      if (!controller.signal.aborted) onChange({ status: 'error', clip, message: cause instanceof Error ? cause.message : 'Music analysis failed.' });
    } finally {
      request.current = null;
    }
  }

  const frames = result?.features.frames ?? [];
  const peak = Math.max(0.01, ...frames.map(frame => frame.rms));
  const mean = (key: 'rms' | 'centroidHz') => frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length;
  return <details className="hint">
    <summary>Music analysis · staging diagnostics</summary>
    <p>Analyze the selected 15 seconds. The original song and its metadata stay in this browser.</p>
    <label>Music analysis tester code
      <input type="password" autoComplete="off" value={access} onChange={event => setAccess(event.target.value)} />
    </label>
    <button type="button" disabled={!access.trim() || pending} onClick={() => void analyze()}>{result ? 'Analyze again' : 'Analyze selection'}</button>
    {pending && <p role="status">Detecting beats and measuring audio features…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p><strong>Detected beat grid:</strong> {result.rhythm.tempo.gridBpm === null
        ? 'BPM unavailable' : `${result.rhythm.tempo.gridBpm} BPM`}</p>
      {result.rhythm.tempo.status === 'ambiguous' && <p>Half- or double-time ambiguity. Other plausible rates: {result.rhythm.tempo.alternativesBpm.join(' / ')} BPM.</p>}
      <svg viewBox="0 0 600 100" width="100%" role="img" aria-label="Energy trace with detected beat markers">
        <rect width="600" height="100" fill="#f7f7f8" />
        <polyline fill="none" stroke="#171717" strokeWidth="1"
          points={frames.map(frame => `${frame.timeMs / 25},${95 - frame.rms / peak * 90}`).join(' ')} />
        {result.rhythm.beatsMs.map(ms => <line key={ms} x1={ms / 25} x2={ms / 25} y1="0" y2="100" stroke="#ce451b" opacity=".55" />)}
      </svg>
      <p>{result.rhythm.beatsMs.length} beats · {result.features.transientsMs.length} onset peaks · Mean RMS {mean('rms').toFixed(3)} full scale · Mean spectral centroid {Math.round(mean('centroidHz'))} Hz</p>
      <details>
        <summary>Raw timing data for evaluation</summary>
        <p>Beats (ms): {result.rhythm.beatsMs.join(', ') || 'None detected'}</p>
        <p>Downbeat candidates (ms, unverified): {result.rhythm.downbeatsMs.join(', ') || 'None detected'}</p>
      </details>
    </>}
  </details>;
}
