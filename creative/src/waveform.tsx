import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { DURATION_MS } from './composition';

const BARS = 88;

/**
 * The song as rounded bars (the look of 21st.dev's "Playback Scrubber"), with the 15-second window lit in green.
 * Drag anywhere to place the window. Arrow keys nudge it (Shift = 5 s).
 */
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
  const heights = useMemo(() => {
    const peaks = new Float32Array(BARS);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const samples = audio.getChannelData(channel);
      for (let bar = 0; bar < BARS; bar++) {
        const end = Math.floor((bar + 1) * samples.length / BARS);
        for (let i = Math.floor(bar * samples.length / BARS); i < end; i++) {
          peaks[bar] = Math.max(peaks[bar], Math.abs(samples[i]));
        }
      }
    }
    // Normalise so quiet songs still show a readable shape.
    const top = Math.max(0.05, ...peaks);
    return Array.from(peaks, peak => Math.max(8, Math.min(peak / top, 1) ** 0.8 * 100));
  }, [audio]);

  function select(event: PointerEvent<HTMLDivElement>, initial: boolean) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - bounds.left) / bounds.width * duration;
    if (initial) {
      dragOffset.current = time >= selected && time <= selected + DURATION_MS
        ? time - selected : DURATION_MS / 2;
    }
    onSelect(Math.min(maxStart, Math.max(0, Math.round(time - dragOffset.current))));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5000 : 1000;
    const move = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (!move) return;
    event.preventDefault();
    onSelect(Math.min(maxStart, Math.max(0, selected + move)));
  }

  const left = selected / duration * 100;
  const width = DURATION_MS / duration * 100;
  return <div className="relative h-32 cursor-ew-resize touch-none select-none rounded-xl bg-muted px-3 outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
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
    <div className="pointer-events-none relative flex h-full items-center gap-[3px]">
      {heights.map((height, bar) => {
        const time = (bar + 0.5) / BARS * duration;
        const inside = time >= selected && time <= selected + DURATION_MS;
        return <span key={bar} className={`flex-1 rounded-full ${inside ? 'bg-primary' : 'bg-white/20'}`} style={{ height: `${height * 0.7}%` }} />;
      })}
      <div className="absolute inset-y-0 rounded-lg bg-primary/10" style={{ left: `${left}%`, width: `${width}%` }}>
        <span className="absolute inset-y-4 left-0 w-1 rounded-full bg-primary" />
        <span className="absolute inset-y-4 right-0 w-1 rounded-full bg-primary" />
      </div>
      {position > 0 && <span className="absolute inset-y-2 w-0.5 rounded-full bg-foreground" style={{ left: `${(selected + position) / duration * 100}%` }} />}
    </div>
  </div>;
}
