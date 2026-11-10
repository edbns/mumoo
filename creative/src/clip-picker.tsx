import { PauseIcon, PlayIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DURATION_MS } from './composition';
import { Waveform } from './waveform';

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Where in the song the 15 seconds are: the chosen range, a play button to hear it, and the song to drag the window across. */
export function ClipPicker({ audio, start, valid, position, playing, onPlay, onSelect }: {
  audio: AudioBuffer;
  start: number;
  /** False while the chosen range does not fit inside the song. */
  valid: boolean;
  position: number;
  playing: boolean;
  onPlay: () => void;
  onSelect: (start: number) => void;
}) {
  return <div className="mb-6 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="m-0 text-xs text-muted-foreground">Selected clip</p>
        {valid && <p className="clip-range m-0 mt-1 text-lg tabular-nums"><strong className="font-semibold">{clock(start)} – {clock(start + DURATION_MS)}</strong></p>}
      </div>
      <Button variant="secondary" onClick={onPlay} aria-label={playing ? 'Pause the clip' : 'Play the clip'}>
        {playing ? <PauseIcon aria-hidden="true" className="size-4" /> : <PlayIcon aria-hidden="true" className="size-4" />}
        {playing ? 'Pause' : 'Play'}
      </Button>
    </div>
    <Waveform audio={audio} start={start} position={position} onSelect={onSelect} />
    <p className="m-0 mt-3 text-center text-xs text-muted-foreground">Drag the highlighted window to choose your 15 seconds.</p>
  </div>;
}
