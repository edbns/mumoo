import { DURATION_MS, type LyricCue } from './composition';

export function LyricReview({ cues, position, onChange }: {
  cues: LyricCue[];
  position: number;
  onChange: (cues: LyricCue[]) => void;
}) {
  function update(index: number, fields: Partial<LyricCue>) {
    onChange(cues.map((cue, i) => i === index ? { ...cue, ...fields } : cue));
  }

  const end = cues.at(-1)?.endMs ?? 0;
  const canAdd = Number.isSafeInteger(end) && end >= 0 && end < DURATION_MS && cues.length < 30;

  return <fieldset className="lyric-review">
    <legend>Review lyrics</legend>
    <p>Add the lines you hear and set their times within the selected clip. Leave the list empty for an instrumental.</p>
    {cues.map((cue, index) => <div className="lyric-row" key={index}>
      <label>Lyric {index + 1}
        <input value={cue.text} maxLength={48} onChange={event => update(index, { text: event.target.value })} />
      </label>
      <div className="timing">
        {(['startMs', 'endMs'] as const).map(field => {
          const label = field === 'startMs' ? 'in' : 'out';
          return <div key={field}>
            <label>Line {index + 1} {label} (ms)
              <input type="number" min={0} max={DURATION_MS} step={1}
                value={Number.isNaN(cue[field]) ? '' : cue[field]}
                onChange={event => update(index, { [field]: event.target.valueAsNumber })} />
            </label>
            <button type="button" onClick={() => update(index, { [field]: Math.round(position) })}>
              Set {label} to playhead
            </button>
          </div>;
        })}
      </div>
      <button className="remove-lyric" type="button" onClick={() => onChange(cues.filter((_, i) => i !== index))}>Remove line {index + 1}</button>
    </div>)}
    <button type="button" disabled={!canAdd} onClick={() => onChange([
      ...cues, { text: '', startMs: end, endMs: Math.min(end + 2000, DURATION_MS) },
    ])}>Add lyric line</button>
  </fieldset>;
}
