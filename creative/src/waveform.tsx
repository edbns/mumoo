import { useMemo, useRef, type PointerEvent } from 'react';
import { DURATION_MS } from './composition';

const BINS = 420;

export function Waveform({ audio, start, position, onSelect }: {
  audio: AudioBuffer;
  start: number;
  position: number;
  onSelect: (start: number) => void;
}) {
  const dragOffset = useRef(0);
  const duration = audio.duration * 1000;
  const maxStart = Math.floor(duration - DURATION_MS);
  const selected = Math.min(maxStart, Math.max(0, start || 0));
  const path = useMemo(() => {
    const peaks = new Float32Array(BINS);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const samples = audio.getChannelData(channel);
      for (let bin = 0; bin < BINS; bin++) {
        const end = Math.floor((bin + 1) * samples.length / BINS);
        for (let i = Math.floor(bin * samples.length / BINS); i < end; i++) {
          peaks[bin] = Math.max(peaks[bin], Math.abs(samples[i]));
        }
      }
    }
    return Array.from(peaks, (peak, bin) => {
      const height = Math.max(0.8, Math.min(peak, 1) * 44);
      return `M${bin + 0.5} ${50 - height}v${height * 2}`;
    }).join('');
  }, [audio]);

  function select(event: PointerEvent<SVGSVGElement>, initial: boolean) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - bounds.left) / bounds.width * duration;
    if (initial) {
      dragOffset.current = time >= selected && time <= selected + DURATION_MS
        ? time - selected : DURATION_MS / 2;
    }
    onSelect(Math.min(maxStart, Math.max(0, Math.round(time - dragOffset.current))));
  }

  const x = selected / duration * BINS;
  return <>
    <svg className="waveform" viewBox={`0 0 ${BINS} 100`} preserveAspectRatio="none"
      role="img" aria-label="Song waveform with 15-second selection"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        select(event, true);
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) select(event, false);
      }}>
      <rect x={x} width={DURATION_MS / duration * BINS} height="100" fill="#fff0e9" stroke="#d94b20" />
      <path d={path} stroke="#514b49" strokeWidth=".75" fill="none" />
      <line x1={(selected + position) / duration * BINS} x2={(selected + position) / duration * BINS}
        y1="0" y2="100" stroke="#b5300a" strokeWidth="1.5" />
    </svg>
    <label>Move the 15-second window
      <input type="range" min={0} max={maxStart} step={1} value={selected}
        disabled={maxStart === 0} onChange={event => onSelect(event.target.valueAsNumber)} />
    </label>
  </>;
}
