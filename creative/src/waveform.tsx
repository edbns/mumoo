import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { DURATION_MS } from './composition';

const BINS = 420;

/** Drag anywhere to place the 15-second window. Arrow keys nudge it (Shift = 5 s). */
export function Waveform({ audio, start, position, onSelect }: {
  audio: AudioBuffer;
  start: number;
  position: number;
  onSelect: (start: number) => void;
}) {
  const dragOffset = useRef(0);
  const clipId = useId();
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
    // Normalise so quiet songs still show a readable shape.
    const top = Math.max(0.05, ...peaks);
    return Array.from(peaks, (peak, bin) => {
      const height = Math.max(1, Math.min(peak / top, 1) * 42);
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

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 5000 : 1000;
    const move = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (!move) return;
    event.preventDefault();
    onSelect(Math.min(maxStart, Math.max(0, selected + move)));
  }

  const x = selected / duration * BINS;
  const width = DURATION_MS / duration * BINS;
  const playhead = (selected + position) / duration * BINS;
  return <svg className="waveform" viewBox={`0 0 ${BINS} 100`} preserveAspectRatio="none"
    role="slider" tabIndex={0} aria-label="Choose your 15 seconds"
    aria-valuemin={0} aria-valuemax={maxStart} aria-valuenow={selected}
    aria-valuetext={`${Math.floor(selected / 1000)} seconds into the song`}
    onKeyDown={onKeyDown}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      select(event, true);
    }}
    onPointerMove={event => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) select(event, false);
    }}>
    <defs><clipPath id={clipId}><rect x={x} y="0" width={width} height="100" /></clipPath></defs>
    <path d={path} stroke="#c9c5c2" strokeWidth=".8" fill="none" />
    <rect x={x} width={width} height="100" fill="#ff5b26" fillOpacity=".08" />
    <path d={path} stroke="#e3521b" strokeWidth=".9" fill="none" clipPath={`url(#${clipId})`} />
    <rect x={x} width="1.4" height="100" fill="#e3521b" />
    <rect x={x + width - 1.4} width="1.4" height="100" fill="#e3521b" />
    {position > 0 && <line x1={playhead} x2={playhead} y1="0" y2="100" stroke="#171717" strokeWidth="1.2" />}
  </svg>;
}
