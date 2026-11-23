import { PauseIcon, PlayIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { clipLengthMs } from './composition';
import { Waveform } from './waveform';

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Where in the song the clip is: the chosen range, a play button to hear it, and the song to drag the window across (a song of 15 seconds or less is the clip, whole). */
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
  const clipMs = clipLengthMs(audio.duration * 1000);
  const whole = audio.duration * 1000 - clipMs < 1000;
  return <div className="mb-6 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="m-0 text-xs text-muted-foreground">Selected clip</p>
        {valid && <p className="clip-range m-0 mt-1 text-lg tabular-nums"><strong className="font-semibold">{clock(start)} – {clock(start + clipMs)}</strong></p>}
      </div>
      <Button variant="secondary" onClick={onPlay} aria-label={playing ? 'Pause the clip' : 'Play the clip'}>
        {playing ? <PauseIcon aria-hidden="true" className="size-4" /> : <PlayIcon aria-hidden="true" className="size-4" />}
        {playing ? 'Pause' : 'Play'}
      </Button>
    </div>
    <Waveform audio={audio} start={start} position={position} onSelect={onSelect} />
    <p className="m-0 mt-3 text-center text-xs text-muted-foreground">
      {whole ? `Your whole song is the clip: ${clipMs / 1000} seconds.` : 'Drag the highlighted window to pick your 15 seconds.'}
    </p>
  </div>;
}
