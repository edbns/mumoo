import { DURATION_MS, type LyricCue } from './composition';

export interface RecognizedWord {
  text: string;
  timestamp: [number, number | null];
}

export const MAX_WORDS = 120;

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

export function matchWords(words: string[], recognized: RecognizedWord[]) {
  const candidates = recognized.flatMap(({ text, timestamp: [inTime, outTime] }) => {
    if (outTime === null || !Number.isFinite(inTime) || !Number.isFinite(outTime)) return [];
    const startMs = Math.max(0, Math.round(inTime * 1000));
    const endMs = Math.min(DURATION_MS, Math.round(outTime * 1000));
    const token = normalize(text);
    return token && startMs < endMs ? [{ token, startMs, endMs }] : [];
  });
  const tokens = words.map(normalize);
  const scores = tokens.map(() => new Uint16Array(candidates.length + 1));
  scores.push(new Uint16Array(candidates.length + 1));
  for (let i = tokens.length - 1; i >= 0; i--) {
    for (let j = candidates.length - 1; j >= 0; j--) {
      scores[i][j] = tokens[i] === candidates[j].token
        ? 1 + scores[i + 1][j + 1] : Math.max(scores[i + 1][j], scores[i][j + 1]);
    }
  }

  const cues: LyricCue[] = [];
  const unmatched: string[] = [];
  let j = 0;
  for (let i = 0; i < words.length; i++) {
    while (j < candidates.length && tokens[i] !== candidates[j].token && scores[i][j + 1] > scores[i + 1][j]) j++;
    if (j === candidates.length || tokens[i] !== candidates[j].token) {
      unmatched.push(words[i]);
      continue;
    }
    const candidate = candidates[j++];
    const startMs = Math.max(candidate.startMs, cues.at(-1)?.endMs ?? 0);
    if (startMs >= candidate.endMs) {
      unmatched.push(words[i]);
      continue;
    }
    cues.push({ text: words[i], startMs, endMs: candidate.endMs });
  }
  return { cues, unmatched };
}
