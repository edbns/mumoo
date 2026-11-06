import { FPS, FRAMES, HEIGHT, WIDTH, type ImpactMusic, type ImpactVariant, type LyricCue } from './composition';
import { wrapScreenText } from './daily-screens';

export const IMPACT_STYLES: readonly { id: ImpactVariant; name: string; description: string }[] = [
  { id: 'poster', name: 'Poster', description: 'Bold editorial type' },
  { id: 'punch', name: 'Punch', description: 'One word at a time' },
  { id: 'editorial', name: 'Editorial', description: 'Quiet and cinematic' },
  { id: 'echo', name: 'Echo', description: 'Layered typography' },
];

type Phrase = { words: LyricCue[]; startMs: number };
function phrasesFor(cues: readonly LyricCue[]): Phrase[] {
  const result: Phrase[] = [];
  for (const cue of cues) {
    const previous = result.at(-1); const last = previous?.words.at(-1);
    if (!previous || !last || previous.words.length >= 5 || cue.startMs - last.endMs > 450 || /[.!?。！？]$/u.test(last.text)) result.push({ words: [cue], startMs: cue.startMs });
    else previous.words.push(cue);
  }
  return result;
}

export function impactFrame(cues: readonly LyricCue[], frame: number) {
  const cueFrame = (ms: number) => Math.min(FRAMES - 1, Math.ceil(ms * FPS / 1000));
  const phrase = phrasesFor(cues).filter(item => cueFrame(item.startMs) <= frame).at(-1);
  if (!phrase || frame >= Math.ceil(phrase.words[phrase.words.length - 1].endMs * FPS / 1000)) return { phrase: '', word: '', startMs: 0, wordStartMs: 0 };
  const word = phrase.words.filter(item => cueFrame(item.startMs) <= frame && frame < Math.ceil(item.endMs * FPS / 1000)).at(-1);
  return { phrase: phrase.words.map(item => item.text).join(' '), word: word?.text ?? '', startMs: phrase.startMs, wordStartMs: word?.startMs ?? 0 };
}

export function impactSignals(music: ImpactMusic | null, ms: number) {
  if (!music) return { beat: 0, energy: 0 };
  let recent = -Infinity;
  for (const beat of music.beatsMs) { if (beat > ms) break; recent = beat; }
  const beat = Math.exp(-Math.max(0, ms - recent) / 110);
  let rms = 0;
  for (const point of music.energy) { if (point.timeMs > ms) break; rms = point.rms; }
  return { beat, energy: Math.max(0, Math.min(1, rms * 3)) };
}

export function fitImpactText(ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>, value: string, width: number, start: number, weight: number, maxLines: number) {
  let size = start, lines: string[] = [];
  do { ctx.font = `${weight} ${size}px "Inter Variable"`; lines = wrapScreenText(ctx, value, width); if (lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= width)) break; if (size <= 13) break; size = Math.max(13, size - 5); } while (true);
  return { lines, size };
}

/** All motion is a deterministic function of the selected frame and clip data. */
export function drawLyricImpact(canvas: HTMLCanvasElement, cues: readonly LyricCue[], frame: number,
  options: { style: ImpactVariant; music: ImpactMusic | null } = { style: 'poster', music: null }) {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable.');
  const state = impactFrame(cues, frame), ms = frame * 1000 / FPS, reaction = impactSignals(options.music, ms);
  const entrance = Math.max(0, 1 - Math.max(0, ms - state.startMs) / 260);
  const wordEntrance = Math.max(0, 1 - Math.max(0, ms - state.wordStartMs) / 160);
  const ink = options.style === 'poster' ? '#171717' : '#f7f6f3';
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = options.style === 'poster' ? '#eeeae2' : options.style === 'echo' ? '#242035' : options.style === 'editorial' ? '#181c20' : '#111111';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!state.phrase) return;
  ctx.save(); ctx.textBaseline = 'middle';
  if (options.style === 'poster') {
    ctx.fillStyle = '#e34a2b'; ctx.fillRect(95, 360, 120, 14 + reaction.beat * 5);
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 890, 150, 800, 5);
    const leading = fit.size * 1.03, top = HEIGHT / 2 - (fit.lines.length - 1) * leading / 2;
    ctx.fillStyle = ink; ctx.textAlign = 'left';
    fit.lines.forEach((line, index) => ctx.fillText(line, 95, top + index * leading + entrance * 18, 890));
    ctx.fillStyle = '#e34a2b'; ctx.fillRect(95, 1490, 890 * (0.25 + .12 * reaction.energy), 5);
  } else if (options.style === 'punch') {
    const fit = fitImpactText(ctx, state.word.toLocaleUpperCase(), 900, 220, 800, 3);
    const scale = 1 + wordEntrance * .035 + reaction.beat * .018;
    ctx.translate(WIDTH / 2, HEIGHT / 2); ctx.scale(scale, scale); ctx.textAlign = 'center'; ctx.fillStyle = '#ff5b31';
    fit.lines.forEach((line, index) => ctx.fillText(line, 0, (index - (fit.lines.length - 1) / 2) * fit.size, 880));
  } else if (options.style === 'editorial') {
    const fit = fitImpactText(ctx, state.phrase, 720, 90, 400, 5);
    const leading = fit.size * 1.35, top = HEIGHT / 2 - (fit.lines.length - 1) * leading / 2;
    ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.globalAlpha = .82 + reaction.energy * .18;
    fit.lines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, top + index * leading + entrance * 8, 720));
    ctx.globalAlpha = .65; ctx.fillRect(500, 1250, 80, 2);
  } else {
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 850, 125, 800, 4);
    const leading = fit.size * 1.04, top = HEIGHT / 2 - (fit.lines.length - 1) * leading / 2;
    ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.strokeStyle = '#888099';
    for (const delta of [-190, 190]) { ctx.globalAlpha = .2 + reaction.energy * .15; fit.lines.forEach((line, index) => ctx.strokeText(line, WIDTH / 2, top + index * leading + delta, 850)); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#f4c87e';
    fit.lines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, top + index * leading + entrance * 12, 850));
  }
  ctx.restore();
}
