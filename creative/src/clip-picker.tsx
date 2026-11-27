import { MinusIcon, PauseIcon, PlayIcon, PlusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { MIN_SONG_MS, clipLengthMs } from './composition';
import { Waveform } from './waveform';

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} seconds`;

/**
 * Where in the song the clip is and how long (10–15 s): the chosen range, a play button to hear it, the song to drag the window
 * across or stretch it by its edges, and a length nudge for when the window is too small to grab (a phone, a long song).
 */
export function ClipPicker({ audio, start, clipMs, valid, position, playing, onPlay, onSelect }: {
  audio: AudioBuffer;
  start: number;
  clipMs: number;
  /** False while the chosen range does not fit inside the song. */
  valid: boolean;
  position: number;
  playing: boolean;
  onPlay: () => void;
  onSelect: (start: number, clipMs: number) => void;
}) {
  const songMs = audio.duration * 1000;
  const longest = clipLengthMs(songMs);
  /** A new length keeps the clip's start, unless the longer clip would run past the end of the song. */
  const resize = (length: number) => onSelect(Math.max(0, Math.min(start, Math.floor(songMs - length))), length);
  return <div className="mb-6 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="m-0 text-xs text-muted-foreground">Selected clip</p>
        {valid && <p className="clip-range m-0 mt-1 text-lg tabular-nums"><strong className="font-semibold">{clock(start)} – {clock(start + clipMs)}</strong></p>}
      </div>
      <div className="flex items-center gap-3">
        {longest > MIN_SONG_MS && <div className="flex items-center gap-1" role="group" aria-label="Clip length">
          <Button variant="ghost" size="sm" className="px-2" disabled={clipMs <= MIN_SONG_MS}
            onClick={() => resize(Math.max(MIN_SONG_MS, Math.ceil(clipMs / 1000) * 1000 - 1000))} aria-label="Shorter clip">
            <MinusIcon aria-hidden="true" />
          </Button>
          <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">{Number((clipMs / 1000).toFixed(1))} s</span>
          <Button variant="ghost" size="sm" className="px-2" disabled={clipMs >= longest}
            onClick={() => resize(Math.min(longest, Math.floor(clipMs / 1000) * 1000 + 1000))} aria-label="Longer clip">
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>}
        <Button variant="secondary" onClick={onPlay} aria-label={playing ? 'Pause the clip' : 'Play the clip'}>
          {playing ? <PauseIcon aria-hidden="true" className="size-4" /> : <PlayIcon aria-hidden="true" className="size-4" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
      </div>
    </div>
    <Waveform audio={audio} start={start} clipMs={clipMs} position={position} onSelect={onSelect} />
    <p className="m-0 mt-3 text-center text-xs text-muted-foreground">
      {longest <= MIN_SONG_MS ? `Your whole song is the clip: ${seconds(longest)}.`
        : `Drag the highlighted window to pick your clip, or pull its edges to make it ${MIN_SONG_MS / 1000} to ${longest / 1000} seconds.`}
    </p>
  </div>;
}
